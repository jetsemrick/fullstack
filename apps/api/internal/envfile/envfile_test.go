package envfile

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoad(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".env")
	content := "# comment\n\nENVFILE_PLAIN = value\nENVFILE_DQ=\"quoted value\"\nENVFILE_SQ='single'\nENVFILE_SET=from-file\n=novalue\nbroken\n"
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ENVFILE_SET", "from-env")
	for _, k := range []string{"ENVFILE_PLAIN", "ENVFILE_DQ", "ENVFILE_SQ"} {
		t.Setenv(k, "")
		os.Unsetenv(k)
	}
	if err := Load(path); err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"ENVFILE_PLAIN": "value",
		"ENVFILE_DQ":    "quoted value",
		"ENVFILE_SQ":    "single",
		"ENVFILE_SET":   "from-env",
	}
	for k, v := range want {
		if got := os.Getenv(k); got != v {
			t.Errorf("%s = %q, want %q", k, got, v)
		}
	}
}

func TestLoadMissingFile(t *testing.T) {
	if err := Load(filepath.Join(t.TempDir(), "missing.env")); err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
}
