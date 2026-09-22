package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"stock.dev/api/internal/httpapi"
)

func main() {
	loadRootEnv()
	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}
	if _, err := strconv.Atoi(port); err != nil {
		log.Fatalf("[api] invalid PORT %q", port)
	}
	cors := os.Getenv("CORS_ORIGIN")
	if cors == "" {
		cors = "http://localhost:5173"
	}
	handler := &httpapi.Handler{
		CORSOrigin: cors,
		Client:     &http.Client{Timeout: 20 * time.Second},
	}
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      60 * time.Second,
	}
	keyState := "missing"
	if strings.TrimSpace(os.Getenv("CURSOR_API_KEY")) != "" {
		keyState = "set"
	}
	log.Printf("[api] listening on http://localhost:%s (CORS: %s; CURSOR_API_KEY: %s)", port, cors, keyState)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

// loadRootEnv reads the monorepo-root .env without overriding variables already set.
func loadRootEnv() {
	root, err := findRepoRoot()
	if err != nil {
		return
	}
	text, err := os.ReadFile(filepath.Join(root, ".env"))
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(text), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		eq := strings.IndexByte(trimmed, '=')
		if eq <= 0 {
			continue
		}
		key := strings.TrimSpace(trimmed[:eq])
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		value := strings.TrimSpace(trimmed[eq+1:])
		if len(value) >= 2 {
			if (value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'') {
				value = value[1 : len(value)-1]
			}
		}
		_ = os.Setenv(key, value)
	}
}

func findRepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		webPkg := filepath.Join(dir, "apps", "web", "package.json")
		rootPkg := filepath.Join(dir, "package.json")
		if fileExists(webPkg) && fileExists(rootPkg) {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", os.ErrNotExist
		}
		dir = parent
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
