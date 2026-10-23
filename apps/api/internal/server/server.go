// Package server implements the Stock Visualizer HTTP API with the same contracts as @stock/shared.
package server

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf16"

	"github.com/jetsemrick/fullstack/apps/api/internal/contract"
	"github.com/jetsemrick/fullstack/apps/api/internal/reportbug"
	"github.com/jetsemrick/fullstack/apps/api/internal/yahoo"
)

const (
	reportBugMaxLen = 4000
	// Large enough for a 4000-unit message even when fully \u-escaped.
	reportBugMaxBodyBytes = 64 << 10
)

// Yahoo chart query allowlists — reject unexpected values instead of forwarding.
var (
	allowedRange    = setOf("1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max")
	allowedInterval = setOf("1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo")
	tickerRe        = regexp.MustCompile(`^[A-Za-z0-9._^=-]{1,32}$`)
)

func setOf(values ...string) map[string]struct{} {
	m := make(map[string]struct{}, len(values))
	for _, v := range values {
		m[v] = struct{}{}
	}
	return m
}

type Server struct {
	Yahoo      *yahoo.Client
	CORSOrigin string
	ReportBug  reportbug.Runner
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORS(w.Header())
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	switch {
	case r.URL.Path == "/api/health" && r.Method == http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	case r.URL.Path == "/api/prices" && r.Method == http.MethodGet:
		s.handlePrices(w, r)
	case r.URL.Path == "/api/market-context" && r.Method == http.MethodGet:
		s.handleMarketContext(w, r)
	case r.URL.Path == "/api/report-bug" && r.Method == http.MethodPost:
		s.handleReportBug(w, r)
	default:
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_, _ = io.WriteString(w, "Not found")
	}
}

func (s *Server) setCORS(h http.Header) {
	h.Set("Access-Control-Allow-Origin", s.CORSOrigin)
	h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	h.Set("Access-Control-Allow-Headers", "content-type")
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string, code contract.ErrorCode, details string) {
	writeJSON(w, status, contract.ApiErrorBody{Error: message, Code: code, Details: details})
}

func normalizeTicker(raw string) string {
	t := strings.TrimSpace(raw)
	if t == "" {
		return contract.DefaultTicker
	}
	return strings.ToUpper(t)
}

func (s *Server) handlePrices(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	ticker := normalizeTicker(q.Get("ticker"))
	if !tickerRe.MatchString(ticker) {
		writeError(w, http.StatusBadRequest, "Invalid ticker format", contract.CodeValidation, "")
		return
	}
	rangeParam := q.Get("range")
	if q.Has("range") {
		if _, ok := allowedRange[rangeParam]; !ok {
			writeError(w, http.StatusBadRequest, "Invalid range parameter", contract.CodeValidation, "")
			return
		}
	}
	interval := q.Get("interval")
	if q.Has("interval") {
		if _, ok := allowedInterval[interval]; !ok {
			writeError(w, http.StatusBadRequest, "Invalid interval parameter", contract.CodeValidation, "")
			return
		}
	}

	res, err := s.Yahoo.FetchChart(r.Context(), ticker, rangeParam, interval)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to load prices", contract.CodeInternal, err.Error())
		return
	}
	if res.ErrorMessage != "" {
		if len(res.Points) == 0 {
			writeError(w, http.StatusNotFound, res.ErrorMessage, contract.CodeNotFound, "")
		} else {
			writeError(w, http.StatusBadGateway, res.ErrorMessage, contract.CodeUpstream, "")
		}
		return
	}
	body := contract.GetPricesResponse{
		Ticker:    ticker,
		Currency:  res.Currency,
		LastPrice: res.LastPrice,
		Series:    res.Points,
	}
	if res.Symbol != nil {
		body.Ticker = *res.Symbol
	}
	writeJSON(w, http.StatusOK, body)
}

func (s *Server) handleMarketContext(w http.ResponseWriter, r *http.Request) {
	res, err := s.Yahoo.FetchMajorIndexQuotes(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to load market context", contract.CodeInternal, err.Error())
		return
	}
	if res.ErrorMessage != "" || len(res.Indexes) == 0 {
		msg := res.ErrorMessage
		if msg == "" {
			msg = "No benchmark quotes"
		}
		writeError(w, http.StatusBadGateway, msg, contract.CodeUpstream, "")
		return
	}
	writeJSON(w, http.StatusOK, contract.MarketContextResponse{MarketState: res.MarketState, Indexes: res.Indexes})
}

func (s *Server) handleReportBug(w http.ResponseWriter, r *http.Request) {
	var raw any
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, reportBugMaxBodyBytes)).Decode(&raw); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON body", contract.CodeValidation, "")
		return
	}
	obj, ok := raw.(map[string]any)
	if !ok {
		writeError(w, http.StatusBadRequest, "Body must be an object", contract.CodeValidation, "")
		return
	}
	messageRaw, ok := obj["message"].(string)
	if !ok {
		writeError(w, http.StatusBadRequest, "message must be a string", contract.CodeValidation, "")
		return
	}
	message := strings.TrimSpace(messageRaw)
	if message == "" {
		writeError(w, http.StatusBadRequest, "message is required", contract.CodeValidation, "")
		return
	}
	// Length is measured in UTF-16 code units, matching the textarea maxLength in the web client.
	if len(utf16.Encode([]rune(message))) > reportBugMaxLen {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("message must be at most %d characters", reportBugMaxLen), contract.CodeValidation, "")
		return
	}

	res, err := s.ReportBug(r.Context(), message)
	if err != nil {
		switch reportbug.CodeOf(err) {
		case contract.CodeConfig:
			writeError(w, http.StatusServiceUnavailable, "Cursor API key not configured", contract.CodeConfig, err.Error())
		case contract.CodeUpstream:
			writeError(w, http.StatusBadGateway, "Failed to run edit agent", contract.CodeUpstream, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "Failed to run edit agent", contract.CodeInternal, err.Error())
		}
		return
	}
	if res.Status == "error" {
		writeJSON(w, http.StatusBadGateway, res)
		return
	}
	writeJSON(w, http.StatusOK, res)
}
