// Package update verifies and installs Antigravity Manager releases.
package update

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

const (
	ReleasePage  = "https://github.com/txysyc/AntigravityManager/releases"
	releaseAPI   = "https://api.github.com/repos/txysyc/AntigravityManager/releases"
	manifestName = "update-win-x64.json"
	targetName   = "windows-x64"
	maxManifest  = 64 << 10
	maxPackage   = 128 << 20
)

var stableVersion = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)
var digestHex = regexp.MustCompile(`^[0-9a-f]{64}$`)

type manifest struct {
	Version string `json:"version"`
	Target  string `json:"target"`
	File    string `json:"file"`
	Size    int64  `json:"size"`
	SHA256  string `json:"sha256"`
	Notes   string `json:"notes"`
}

// Release carries verified metadata when the signed manifest is available.
type Release struct {
	Version, Notes, Page, ManualReason string
	Size                               int64
	manifest, signature                []byte
}

func (r *Release) CanDownload() bool { return len(r.signature) == ed25519.SignatureSize }

type Client struct {
	key  ed25519.PublicKey
	http *http.Client
}

func New(publicKey string) *Client {
	key, err := hex.DecodeString(publicKey)
	if err != nil || len(key) != ed25519.PublicKeySize {
		key = nil
	}
	return &Client{key: key, http: &http.Client{CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 6 || req.URL.Scheme != "https" || req.URL.User != nil || req.URL.Port() != "" {
			return errors.New("更新下载重定向不可用")
		}
		switch req.URL.Hostname() {
		case "github.com", "api.github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com":
			return nil
		default:
			return errors.New("更新下载重定向到了未知站点")
		}
	}}}
}

func (c *Client) CanVerify() bool { return len(c.key) == ed25519.PublicKeySize }

func versionParts(s string) []uint64 {
	fields := stableVersion.FindStringSubmatch(s)
	if fields == nil {
		return nil
	}
	parts := make([]uint64, 3)
	for i := range parts {
		part, err := strconv.ParseUint(fields[i+1], 10, 64)
		if err != nil {
			return nil
		}
		parts[i] = part
	}
	return parts
}

func versionFile(version string) string { return "AntigravityManager-" + version + "-win-x64.exe" }

func verifyManifest(raw, signature []byte, key ed25519.PublicKey, expected string) (manifest, error) {
	var m manifest
	if len(key) != ed25519.PublicKeySize || len(raw) > maxManifest || !ed25519.Verify(key, raw, signature) {
		return m, errors.New("更新清单的签名未通过验证")
	}
	if json.Unmarshal(raw, &m) != nil || versionParts(m.Version) == nil || m.Version != expected ||
		m.Target != targetName || m.File != versionFile(m.Version) || m.Size <= 0 ||
		m.Size > maxPackage || !digestHex.MatchString(m.SHA256) {
		return manifest{}, errors.New("更新清单中的版本、文件或指纹无效")
	}
	return m, nil
}

func (c *Client) get(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "AntigravityManager")
	if strings.HasPrefix(url, releaseAPI) {
		req.Header.Set("Accept", "application/vnd.github+json")
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		res.Body.Close()
		return nil, fmt.Errorf("GitHub 返回 HTTP %d", res.StatusCode)
	}
	return res, nil
}

func (c *Client) read(ctx context.Context, url string, max int64) ([]byte, error) {
	res, err := c.get(ctx, url)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	return readBounded(res.Body, max)
}

func readBounded(r io.Reader, max int64) ([]byte, error) {
	b, err := io.ReadAll(io.LimitReader(r, max+1))
	if err == nil && int64(len(b)) > max {
		return nil, errors.New("更新响应超出大小限制")
	}
	return b, err
}

type publishedRelease struct {
	Tag        string         `json:"tag_name"`
	Draft      bool           `json:"draft"`
	Prerelease bool           `json:"prerelease"`
	Assets     []releaseAsset `json:"assets"`
}

type releaseAsset struct {
	Name  string `json:"name"`
	State string `json:"state"`
}

func (r publishedRelease) hasFile(name string) bool {
	return slices.ContainsFunc(r.Assets, func(a releaseAsset) bool {
		return a.Name == name && a.State == "uploaded"
	})
}

// Check returns nil when there is no newer stable manager release.
func (c *Client) Check(ctx context.Context, current string) (*Release, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	best := versionParts(current)
	if best == nil {
		return nil, errors.New("当前管理器版本无法识别")
	}
	var latest publishedRelease
	// 发行按创建日期分页，版本号在全部正式发行中比较。
	for page := 1; ; page++ {
		b, err := c.read(ctx, releaseAPI+"?per_page=30&page="+strconv.Itoa(page), 4<<20)
		if err != nil {
			return nil, fmt.Errorf("无法查询 GitHub 发布：%w", err)
		}
		var list []publishedRelease
		if err := json.Unmarshal(b, &list); err != nil {
			return nil, fmt.Errorf("无法读取 GitHub 发布信息：%w", err)
		}
		for _, candidate := range list {
			version, ok := strings.CutPrefix(candidate.Tag, "manager-v")
			if !ok || candidate.Draft || candidate.Prerelease || !candidate.hasFile(versionFile(version)) {
				continue
			}
			if parts := versionParts(version); parts != nil && slices.Compare(parts, best) > 0 {
				best, latest = parts, candidate
			}
		}
		if len(list) < 30 {
			break
		}
	}
	if latest.Tag == "" {
		return nil, nil
	}
	r := &Release{Version: strings.TrimPrefix(latest.Tag, "manager-v"), Page: ReleasePage + "/tag/" + latest.Tag}
	switch {
	case !c.CanVerify():
		r.ManualReason = "当前管理器未内置更新公钥。可打开发布页下载正式版。"
	case !latest.hasFile(manifestName) || !latest.hasFile(manifestName+".sig"):
		r.ManualReason = "该版本仅提供手动下载。"
	default:
		if err := c.loadManifest(ctx, r); err != nil {
			r.ManualReason = "无法验证新版：" + err.Error()
		}
	}
	return r, nil
}

func downloadURL(version, filename string) string {
	return ReleasePage + "/download/manager-v" + version + "/" + filename
}

func (c *Client) loadManifest(ctx context.Context, r *Release) error {
	raw, err := c.read(ctx, downloadURL(r.Version, manifestName), maxManifest)
	if err != nil {
		return err
	}
	sig, err := c.read(ctx, downloadURL(r.Version, manifestName+".sig"), ed25519.SignatureSize)
	if err != nil {
		return err
	}
	m, err := verifyManifest(raw, sig, c.key, r.Version)
	if err != nil {
		return err
	}
	r.manifest, r.signature, r.Notes, r.Size = raw, sig, m.Notes, m.Size
	return nil
}

type progressWriter struct {
	write    io.Writer
	progress func(int64)
	total    int64
	last     time.Time
}

func (p *progressWriter) Write(b []byte) (int, error) {
	n, err := p.write.Write(b)
	p.total += int64(n)
	if p.progress != nil && time.Since(p.last) >= 100*time.Millisecond {
		p.progress(p.total)
		p.last = time.Now()
	}
	return n, err
}

func (c *Client) download(ctx context.Context, m manifest, name string, progress func(int64)) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	r, err := c.get(ctx, downloadURL(m.Version, m.File))
	if err != nil {
		return err
	}
	defer r.Body.Close()
	f, err := os.OpenFile(name, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	hash := sha256.New()
	writer := &progressWriter{write: io.MultiWriter(f, hash), progress: progress}
	n, err := io.Copy(writer, io.LimitReader(r.Body, m.Size+1))
	if err == nil && (n != m.Size || hex.EncodeToString(hash.Sum(nil)) != m.SHA256) {
		err = errors.New("下载的程序大小或 SHA-256 与签名清单不匹配")
	}
	if err == nil {
		err = f.Sync()
	}
	if closeErr := f.Close(); err == nil {
		err = closeErr
	}
	return err
}
