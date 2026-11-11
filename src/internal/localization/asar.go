package localization

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strconv"
)

func digest(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

// Keep Electron's member and property order so the output also matches the
// existing Node builder's fingerprints.
type property struct {
	key string
	raw json.RawMessage
}
type object []property

func decodeObject(raw []byte) (object, error) {
	d := json.NewDecoder(bytes.NewReader(raw))
	if start, err := d.Token(); err != nil || start != json.Delim('{') {
		return nil, errors.New("预期为 JSON 对象")
	}
	out := object{}
	seen := map[string]bool{}
	for d.More() {
		key, err := d.Token()
		if err != nil {
			return nil, err
		}
		name, ok := key.(string)
		if !ok || seen[name] {
			return nil, errors.New("JSON 属性重复或无效")
		}
		seen[name] = true
		var value json.RawMessage
		if err := d.Decode(&value); err != nil {
			return nil, err
		}
		out = append(out, property{name, value})
	}
	if _, err := d.Token(); err != nil {
		return nil, err
	}
	if _, err := d.Token(); err != io.EOF {
		return nil, errors.New("JSON 对象后存在额外数据")
	}
	sort.SliceStable(out, func(i, j int) bool { return jsIndex(out[i].key) < jsIndex(out[j].key) })
	return out, nil
}

func jsIndex(s string) uint64 {
	const last = 1<<32 - 1
	n, err := strconv.ParseUint(s, 10, 32)
	if err != nil || strconv.FormatUint(n, 10) != s {
		return last
	}
	return n
}

func jsonBytes(v any) []byte {
	var b bytes.Buffer
	e := json.NewEncoder(&b)
	e.SetEscapeHTML(false)
	if err := e.Encode(v); err != nil {
		panic(err)
	}
	return bytes.TrimSuffix(b.Bytes(), []byte("\n"))
}

func (o object) encode() []byte {
	var b bytes.Buffer
	b.WriteByte('{')
	for i, p := range o {
		if i > 0 {
			b.WriteByte(',')
		}
		b.Write(jsonBytes(p.key))
		b.WriteByte(':')
		b.Write(p.raw)
	}
	b.WriteByte('}')
	return b.Bytes()
}

func (o object) get(key string) json.RawMessage {
	for _, p := range o {
		if p.key == key {
			return p.raw
		}
	}
	return nil
}
func (o *object) set(key string, raw json.RawMessage) {
	for i := range *o {
		if (*o)[i].key == key {
			(*o)[i].raw = raw
			return
		}
	}
	*o = append(*o, property{key, raw})
}

type integrity struct {
	Algorithm string   `json:"algorithm"`
	Hash      string   `json:"hash"`
	BlockSize int      `json:"blockSize"`
	Blocks    []string `json:"blocks"`
}

func checksums(data []byte, block int) integrity {
	out := integrity{"SHA256", digest(data), block, []string{}}
	for len(data) != 0 {
		n := min(block, len(data))
		out.Blocks = append(out.Blocks, digest(data[:n]))
		data = data[n:]
	}
	return out
}

type member struct {
	key    string
	meta   object
	data   []byte
	dir    []*member
	packed bool
}
type archive struct {
	root  object
	tree  []*member
	files map[string]*member
}

func readASAR(b []byte) (*archive, error) {
	if len(b) < 16 || binary.LittleEndian.Uint32(b) != 4 {
		return nil, errors.New("ASAR 文件头无效")
	}
	start := 8 + int(binary.LittleEndian.Uint32(b[4:]))
	end := 16 + int(binary.LittleEndian.Uint32(b[12:]))
	if start > len(b) || end > start {
		return nil, errors.New("ASAR 文件头越界")
	}
	root, err := decodeObject(b[16:end])
	if err != nil {
		return nil, err
	}
	a := &archive{root: root, files: map[string]*member{}}
	var walk func(json.RawMessage, string, int) ([]*member, error)
	walk = func(raw json.RawMessage, prefix string, depth int) ([]*member, error) {
		if depth > 128 {
			return nil, errors.New("ASAR 目录层级过深")
		}
		items, err := decodeObject(raw)
		if err != nil {
			return nil, err
		}
		tree := make([]*member, 0, len(items))
		for _, item := range items {
			meta, err := decodeObject(item.raw)
			if err != nil {
				return nil, err
			}
			m := &member{key: item.key, meta: meta}
			name := prefix + item.key
			switch {
			case meta.get("files") != nil:
				m.dir, err = walk(meta.get("files"), name+"/", depth+1)
				if err != nil {
					return nil, err
				}
			case bytes.Equal(meta.get("unpacked"), []byte("true")) || meta.get("link") != nil:
			default:
				var offset string
				var size int
				if json.Unmarshal(meta.get("offset"), &offset) != nil || json.Unmarshal(meta.get("size"), &size) != nil {
					return nil, fmt.Errorf("ASAR 文件项无效：%s", name)
				}
				pos, err := strconv.Atoi(offset)
				if err != nil || size < 0 || pos < 0 || pos > len(b)-start || size > len(b)-start-pos {
					return nil, fmt.Errorf("ASAR 文件项越界：%s", name)
				}
				m.data = b[start+pos : start+pos+size]
				if raw := meta.get("integrity"); raw != nil {
					var check integrity
					if json.Unmarshal(raw, &check) != nil || check.Algorithm != "SHA256" || check.BlockSize <= 0 || digest(m.data) != check.Hash {
						return nil, fmt.Errorf("ASAR 文件项校验失败：%s", name)
					}
				}
				m.packed = true
				a.files[name] = m
			}
			tree = append(tree, m)
		}
		return tree, nil
	}
	a.tree, err = walk(root.get("files"), "", 0)
	return a, err
}

func (a *archive) write() []byte {
	var offset int
	var blocks [][]byte
	var walk func([]*member) []byte
	walk = func(tree []*member) []byte {
		items := object{}
		for _, m := range tree {
			if m.dir != nil {
				m.meta.set("files", walk(m.dir))
			} else if m.packed {
				m.meta.set("offset", jsonBytes(strconv.Itoa(offset)))
				m.meta.set("size", jsonBytes(len(m.data)))
				if raw := m.meta.get("integrity"); raw != nil {
					var old integrity
					_ = json.Unmarshal(raw, &old)
					m.meta.set("integrity", jsonBytes(checksums(m.data, old.BlockSize)))
				}
				blocks = append(blocks, m.data)
				offset += len(m.data)
			}
			items.set(m.key, m.meta.encode())
		}
		return items.encode()
	}
	a.root.set("files", walk(a.tree))
	header := a.root.encode()
	padded := (len(header) + 7) &^ 3
	out := make([]byte, 12+padded, 12+padded+offset)
	binary.LittleEndian.PutUint32(out, 4)
	binary.LittleEndian.PutUint32(out[4:], uint32(4+padded))
	binary.LittleEndian.PutUint32(out[8:], uint32(padded))
	binary.LittleEndian.PutUint32(out[12:], uint32(len(header)))
	copy(out[16:], header)
	for _, data := range blocks {
		out = append(out, data...)
	}
	return out
}
