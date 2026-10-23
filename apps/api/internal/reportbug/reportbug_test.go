package reportbug

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"testing"

	"github.com/jetsemrick/fullstack/apps/api/internal/contract"
)

// fakeBun puts a `bun` shell script on PATH that prints stdout verbatim.
func fakeBun(t *testing.T, stdout string, exitCode int) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("shell script stub requires a POSIX shell")
	}
	dir := t.TempDir()
	// Builtins only: PATH is narrowed to dir below.
	script := "#!/bin/sh\nwhile read -r _; do :; done\nprintf '%s' '" + stdout + "'\nexit " + strconv.Itoa(exitCode) + "\n"
	if err := os.WriteFile(filepath.Join(dir, "bun"), []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir)
	t.Setenv("CURSOR_API_KEY", "test-key")
}

func TestBunRunnerSuccess(t *testing.T) {
	fakeBun(t, "sdk log line\n{\"runId\":\"run-1\",\"status\":\"finished\",\"result\":\"ok\"}\n", 0)
	res, err := NewBunRunner("agent.ts", t.TempDir())(context.Background(), "fix it")
	if err != nil {
		t.Fatal(err)
	}
	if res.RunID != "run-1" || res.Status != "finished" || res.Result != "ok" {
		t.Fatalf("got %+v", res)
	}
}

func TestBunRunnerBridgeError(t *testing.T) {
	fakeBun(t, "{\"errorCode\":\"UPSTREAM\",\"errorMessage\":\"rate limited\"}\n", 0)
	_, err := NewBunRunner("agent.ts", t.TempDir())(context.Background(), "fix it")
	if CodeOf(err) != contract.CodeUpstream || err.Error() != "rate limited" {
		t.Fatalf("got %v (%s)", err, CodeOf(err))
	}
}

func TestBunRunnerCrash(t *testing.T) {
	fakeBun(t, "", 1)
	_, err := NewBunRunner("agent.ts", t.TempDir())(context.Background(), "fix it")
	if CodeOf(err) != contract.CodeInternal {
		t.Fatalf("got %v", err)
	}
}

func TestBunRunnerMissingKey(t *testing.T) {
	t.Setenv("CURSOR_API_KEY", "  ")
	_, err := NewBunRunner("agent.ts", t.TempDir())(context.Background(), "fix it")
	if CodeOf(err) != contract.CodeConfig {
		t.Fatalf("got %v", err)
	}
}
