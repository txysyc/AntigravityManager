package localization

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"regexp"
	"strings"

	resources "github.com/txysyc/AntigravityManager"
)

type Profile struct {
	Version, PatchVersion, OriginalSHA256, PatchedSHA256, LanguageServerSHA256 string
	AcceptedPatchedSHA256                                                      []string
	PatchedVersions                                                            map[string]string
	BaselineModules                                                            map[string]string
	NativeChanges                                                              []struct {
		Path, From string
		Count      int
	}
	HubWindowAPI bool
}

type rule struct{ From, To string }
type payload struct {
	PatchVersion   string
	NativeManifest map[string][]rule
	Preload        string
}

//go:embed payload.json
var payloadBytes []byte

var versionPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$`)
var hashPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

func loadAssets() ([]Profile, payload, []byte, error) {
	var p payload
	if err := json.Unmarshal(payloadBytes, &p); err != nil {
		return nil, p, nil, err
	}
	var version struct{ Version string }
	b, err := resources.Files.ReadFile("engines/localization/package.json")
	if err != nil || json.Unmarshal(b, &version) != nil || !versionPattern.MatchString(version.Version) || p.PatchVersion != version.Version {
		return nil, p, nil, errors.New("内置汉化资源与补丁版本不一致")
	}
	names, err := fs.Glob(resources.Files, "engines/localization/profiles/*.json")
	if err != nil {
		return nil, p, nil, err
	}
	var profiles []Profile
	for _, name := range names {
		var profile Profile
		b, err := resources.Files.ReadFile(name)
		if err != nil {
			return nil, p, nil, err
		}
		if json.Unmarshal(b, &profile) != nil || !versionPattern.MatchString(profile.Version) || !hashPattern.MatchString(profile.OriginalSHA256) ||
			(profile.LanguageServerSHA256 != "" && !hashPattern.MatchString(profile.LanguageServerSHA256)) {
			return nil, p, nil, fmt.Errorf("内置兼容配置无效：%s", name)
		}
		profiles = append(profiles, profile)
	}
	if len(profiles) == 0 {
		return nil, p, nil, errors.New("缺少内置兼容配置")
	}
	locale, err := resources.Files.ReadFile("engines/localization/src/locale-main.cjs")
	return profiles, p, locale, err
}

func identity(a *archive) (string, error) {
	entry := a.files["package.json"]
	var p struct{ Name, Version string }
	if entry == nil || json.Unmarshal(entry.data, &p) != nil || p.Name != "antigravity" || !versionPattern.MatchString(p.Version) {
		return "", errors.New("所选目录不是受支持的 Antigravity 应用")
	}
	return p.Version, nil
}

func applyRules(source string, rules []rule) (string, map[string]int) {
	crlf := strings.Contains(source, "\r\n")
	result := strings.ReplaceAll(source, "\r\n", "\n")
	counts := map[string]int{}
	for _, r := range rules {
		if r.From == "" || (strings.Contains(r.To, r.From) && strings.Contains(result, r.To)) {
			continue
		}
		if n := strings.Count(result, r.From); n > 0 {
			counts[r.From] = n
			result = strings.ReplaceAll(result, r.From, r.To)
		}
	}
	if crlf {
		result = strings.ReplaceAll(result, "\n", "\r\n")
	}
	return result, counts
}

func build(input []byte, p Profile, assets payload, locale []byte) ([]byte, error) {
	if digest(input) != p.OriginalSHA256 {
		return nil, errors.New("原始文件指纹未验证")
	}
	a, err := readASAR(input)
	if err != nil {
		return nil, err
	}
	if version, err := identity(a); err != nil || version != p.Version {
		return nil, errors.New("原始文件与应用身份或版本不匹配")
	}
	for file, rules := range assets.NativeManifest {
		m := a.files[file]
		if m == nil {
			return nil, fmt.Errorf("缺少预期应用文件：%s", file)
		}
		translated, counts := applyRules(string(m.data), rules)
		for _, r := range rules {
			if counts[r.From] == 0 {
				return nil, fmt.Errorf("原生文案锚点不匹配：%s", file)
			}
		}
		path, setup := "./locale.cjs", ""
		if strings.Contains(file, "/ideInstall/") {
			path = "../locale.cjs"
		}
		if file == "dist/main.js" {
			api := ""
			if p.HubWindowAPI {
				api = `() => require("./utils.js")`
			}
			setup = `require("./locale.cjs").setup(` + api + ");\n"
		}
		m.data = []byte("\"use strict\";\n" + setup + "if (require(" + string(jsonBytes(path)) + ").startupLanguage === \"zh-CN\") {\n" + translated + "\n} else {\n" + string(m.data) + "\n}\n")
	}
	preload := a.files["dist/preload.js"]
	if preload == nil || a.files["dist/locale.cjs"] != nil {
		return nil, errors.New("应用的预加载文件或语言入口不符合预期")
	}
	preload.data = append(bytes.Clone(preload.data), assets.Preload...)
	stamp := struct {
		PatchVersion         string `json:"patchVersion"`
		AppVersion           string `json:"appVersion"`
		OriginalSHA256       string `json:"originalSha256"`
		LanguageServerSHA256 string `json:"languageServerSha256,omitempty"`
	}{assets.PatchVersion, p.Version, p.OriginalSHA256, p.LanguageServerSHA256}
	locale = append(bytes.Clone(locale), "\n// Antigravity localization build: "...)
	locale = append(append(locale, jsonBytes(stamp)...), '\n')
	added := &member{key: "locale.cjs", data: locale, packed: true, meta: object{
		{"size", jsonBytes(len(locale))}, {"offset", jsonBytes("0")}, {"integrity", jsonBytes(checksums(locale, 4194304))},
	}}
	found := false
	for _, m := range a.tree {
		if m.key == "dist" && m.dir != nil {
			m.dir = append(m.dir, added)
			found = true
			break
		}
	}
	if !found {
		return nil, errors.New("缺少应用的 dist 目录")
	}
	a.files["dist/locale.cjs"] = added
	result := a.write()
	if p.PatchVersion == assets.PatchVersion && hashPattern.MatchString(p.PatchedSHA256) && digest(result) != p.PatchedSHA256 {
		return nil, errors.New("生成的补丁与已验证补丁指纹不一致")
	}
	verified, err := readASAR(result)
	if err != nil {
		return nil, err
	}
	for name, m := range a.files {
		if v := verified.files[name]; v == nil || !bytes.Equal(v.data, m.data) {
			return nil, fmt.Errorf("补丁归档校验失败：%s", name)
		}
	}
	return result, nil
}
