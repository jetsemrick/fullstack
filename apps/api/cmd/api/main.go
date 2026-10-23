// Command api serves the Stock Visualizer HTTP API (default port 3001).
package main

import (
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jetsemrick/fullstack/apps/api/internal/envfile"
	"github.com/jetsemrick/fullstack/apps/api/internal/reportbug"
	"github.com/jetsemrick/fullstack/apps/api/internal/server"
	"github.com/jetsemrick/fullstack/apps/api/internal/yahoo"
)

// findRepoRoot walks up from the working directory so the API works from the repo root or apps/api.
func findRepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "apps", "api", "go.mod")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", errors.New("could not locate monorepo root (apps/api/go.mod)")
		}
		dir = parent
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	repoRoot, err := findRepoRoot()
	if err != nil {
		log.Fatalf("[api] %v", err)
	}
	if err := envfile.Load(filepath.Join(repoRoot, ".env")); err != nil {
		log.Fatalf("[api] loading .env: %v", err)
	}

	port := envOr("PORT", "3001")
	cors := envOr("CORS_ORIGIN", "http://localhost:5173")
	srv := &server.Server{
		Yahoo:      yahoo.NewClient(),
		CORSOrigin: cors,
		ReportBug:  reportbug.NewBunRunner(filepath.Join(repoRoot, "apps", "api", "agent", "report-bug.ts"), repoRoot),
	}

	keyState := "missing"
	if strings.TrimSpace(os.Getenv("CURSOR_API_KEY")) != "" {
		keyState = "set"
	}
	log.Printf("[api] listening on http://localhost:%s (CORS: %s; CURSOR_API_KEY: %s)", port, cors, keyState)

	// No write timeout: report-bug agent runs can take minutes and are bounded by the request context.
	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           srv,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Fatal(httpServer.ListenAndServe())
}
