package update

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

type fixtureHTTP map[string][]byte

func (f fixtureHTTP) RoundTrip(req *http.Request) (*http.Response, error) {
	b, ok := f[req.URL.String()]
	status := http.StatusOK
	if !ok {
		status = http.StatusNotFound
	}
	return &http.Response{StatusCode: status, Body: io.NopCloser(bytes.NewReader(b)), Header: http.Header{}}, nil
}

func signedFixture(t *testing.T, private ed25519.PrivateKey, version string, body []byte) (*Release, manifest) {
	t.Helper()
	sum := sha256.Sum256(body)
	m := manifest{
		Version: version, Target: targetName, File: versionFile(version), Size: int64(len(body)),
		SHA256: hex.EncodeToString(sum[:]), Notes: "测试发行说明",
	}
	raw, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	return &Release{Version: version, manifest: raw, signature: ed25519.Sign(private, raw)}, m
}

func TestFindStableSignedManagerRelease(t *testing.T) {
	pub, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	binary := []byte("updated program")
	release, m := signedFixture(t, key, "0.10.0", binary)
	uploaded := []releaseAsset{{m.File, "uploaded"}, {manifestName, "uploaded"}, {manifestName + ".sig", "uploaded"}}
	list := []publishedRelease{
		{Tag: "manager-v0.11.0", Prerelease: true, Assets: []releaseAsset{{versionFile("0.11.0"), "uploaded"}}},
		{Tag: "manager-v0.12.0", Draft: true, Assets: []releaseAsset{{versionFile("0.12.0"), "uploaded"}}},
		{Tag: "localization-v99.0.0", Assets: []releaseAsset{{versionFile("99.0.0"), "uploaded"}}},
		{Tag: "manager-v0.10.0", Assets: uploaded},
		{Tag: "manager-v0.9.1", Assets: []releaseAsset{{versionFile("0.9.1"), "uploaded"}}},
	}
	raw, err := json.Marshal(list)
	if err != nil {
		t.Fatal(err)
	}
	feed := fixtureHTTP{
		releaseAPI + "?per_page=30&page=1":          raw,
		downloadURL(m.Version, manifestName):        release.manifest,
		downloadURL(m.Version, manifestName+".sig"): release.signature,
		downloadURL(m.Version, m.File):              binary,
	}
	c := New(hex.EncodeToString(pub))
	c.http.Transport = feed
	got, err := c.Check(t.Context(), "0.9.0")
	if err != nil || got == nil || got.Version != m.Version || !got.CanDownload() || got.Notes != m.Notes || got.Size != m.Size {
		t.Fatalf("signed release: %+v, %v", got, err)
	}
	if latest, err := c.Check(t.Context(), m.Version); err != nil || latest != nil {
		t.Fatalf("an equal version must not be selected: %+v, %v", latest, err)
	}
	target := filepath.Join(t.TempDir(), "program.exe")
	if err := c.download(t.Context(), m, target, nil); err != nil {
		t.Fatal(err)
	}
	if data, err := os.ReadFile(target); err != nil || !bytes.Equal(data, binary) {
		t.Fatalf("download: %q, %v", data, err)
	}
	feed[downloadURL(m.Version, m.File)] = bytes.Repeat([]byte{'X'}, len(binary))
	if err := c.download(t.Context(), m, filepath.Join(t.TempDir(), "altered.exe"), nil); err == nil {
		t.Fatal("altered executable accepted")
	}
	feed[downloadURL(m.Version, manifestName+".sig")] = make([]byte, ed25519.SignatureSize)
	if r, err := c.Check(t.Context(), "0.9.0"); err != nil || r == nil || r.CanDownload() || r.ManualReason == "" {
		t.Fatalf("bad signature must only permit manual download: %+v, %v", r, err)
	}
}

func TestManifestRejectsSignedWrongTargetAndVersion(t *testing.T) {
	pub, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	r, m := signedFixture(t, key, "0.5.0", []byte("candidate"))
	if _, err := verifyManifest(r.manifest, r.signature, pub, "0.5.1"); err == nil {
		t.Fatal("manifest taken from a different tag was accepted")
	}
	m.File = "../update.exe"
	raw, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := verifyManifest(raw, ed25519.Sign(key, raw), pub, r.Version); err == nil {
		t.Fatal("unexpected destination filename was accepted")
	}
}

func TestCheckReportsNetworkFailure(t *testing.T) {
	c := New("")
	c.http.Transport = fixtureHTTP{}
	if r, err := c.Check(context.Background(), "0.4.0"); err == nil || r != nil {
		t.Fatalf("network failure is not an up-to-date result: %+v, %v", r, err)
	}
}
