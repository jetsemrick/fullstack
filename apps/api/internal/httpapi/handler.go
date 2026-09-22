package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"unicode/utf8"

	"stock.dev/api/internal/yahoo"
)

const reportBugMaxLen = 4000

var tickerRE = regexp.MustCompile(`^[A-Za-z0-9._^=-]{1,32}$`)

var allowedRange = map[string]struct{}{
	"1d": {}, "5d": {}, "1mo": {}, "3mo": {}, "6mo": {},
	"1y": {}, "2y": {}, "5y": {}, "10y": {}, "ytd": {}, "max": {},
}

var allowedInterval = map[string]struct{}{
	"1m": {}, "2m": {}, "5m": {}, "15m": {}, "30m": {}, "60m": {}, "90m": {},
	"1h": {}, "1d": {}, "5d": {}, "1wk": {}, "1mo": {}, "3mo": {},
}

// Handler serves the Stock Visualizer API.
type Handler struct {
	CORSOrigin string
	Client     *http.Client
}

type errorBody struct {
	Error   string  `json:"error"`
	Code    string  `json:"code"`
	Details *string `json:"details,omitempty"`
}

type pricesResponse struct {
	Ticker    string             `json:"ticker"`
	Currency  *string            `json:"currency"`
	LastPrice *float64           `json:"lastPrice"`
	Series    []yahoo.PricePoint `json:"series"`
}

type marketResponse struct {
	MarketState *string            `json:"marketState"`
	Indexes     []yahoo.IndexQuote `json:"indexes"`
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		h.writeHeaders(w, http.StatusNoContent)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	switch {
	case r.URL.Path == "/api/health" && r.Method == http.MethodGet:
		h.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	case r.URL.Path == "/api/prices" && r.Method == http.MethodGet:
		h.prices(w, r)
	case r.URL.Path == "/api/market-context" && r.Method == http.MethodGet:
		h.marketContext(w, r)
	case r.URL.Path == "/api/report-bug" && r.Method == http.MethodPost:
		h.reportBug(w, r)
	default:
		h.writeHeaders(w, http.StatusNotFound)
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("Not found"))
	}
}

func (h *Handler) prices(w http.ResponseWriter, r *http.Request) {
	ticker := normalizeTicker(r.URL.Query().Get("ticker"))
	if !tickerRE.MatchString(ticker) {
		h.writeJSON(w, http.StatusBadRequest, errorBody{Error: "Invalid ticker format", Code: "VALIDATION"})
		return
	}
	q := r.URL.Query()
	var rangeVal, interval string
	if q.Has("range") {
		rangeVal = q.Get("range")
		if _, ok := allowedRange[rangeVal]; !ok {
			h.writeJSON(w, http.StatusBadRequest, errorBody{Error: "Invalid range parameter", Code: "VALIDATION"})
			return
		}
	}
	if q.Has("interval") {
		interval = q.Get("interval")
		if _, ok := allowedInterval[interval]; !ok {
			h.writeJSON(w, http.StatusBadRequest, errorBody{Error: "Invalid interval parameter", Code: "VALIDATION"})
			return
		}
	}
	yahooResult, err := yahoo.FetchChart(r.Context(), h.Client, ticker, yahoo.ChartOpts{Range: rangeVal, Interval: interval})
	if err != nil {
		h.writeJSON(w, http.StatusInternalServerError, errorBody{
			Error:   "Failed to load prices",
			Code:    "INTERNAL",
			Details: strPtr(err.Error()),
		})
		return
	}
	if yahooResult.ErrorMessage != nil {
		status := http.StatusBadGateway
		code := "UPSTREAM"
		if len(yahooResult.Points) == 0 {
			status = http.StatusNotFound
			code = "NOT_FOUND"
		}
		h.writeJSON(w, status, errorBody{Error: *yahooResult.ErrorMessage, Code: code})
		return
	}
	symbol := ticker
	if yahooResult.Symbol != nil {
		symbol = *yahooResult.Symbol
	}
	series := yahooResult.Points
	if series == nil {
		series = []yahoo.PricePoint{}
	}
	h.writeJSON(w, http.StatusOK, pricesResponse{
		Ticker:    symbol,
		Currency:  yahooResult.Currency,
		LastPrice: yahooResult.LastPrice,
		Series:    series,
	})
}

func (h *Handler) marketContext(w http.ResponseWriter, r *http.Request) {
	y, err := yahoo.FetchMajorIndexQuotes(r.Context(), h.Client)
	if err != nil {
		h.writeJSON(w, http.StatusInternalServerError, errorBody{
			Error:   "Failed to load market context",
			Code:    "INTERNAL",
			Details: strPtr(err.Error()),
		})
		return
	}
	if y.ErrorMessage != nil || len(y.Indexes) == 0 {
		msg := "No benchmark quotes"
		if y.ErrorMessage != nil {
			msg = *y.ErrorMessage
		}
		h.writeJSON(w, http.StatusBadGateway, errorBody{Error: msg, Code: "UPSTREAM"})
		return
	}
	h.writeJSON(w, http.StatusOK, marketResponse{MarketState: y.MarketState, Indexes: y.Indexes})
}

func (h *Handler) reportBug(w http.ResponseWriter, r *http.Request) {
	raw, err := readJSONObject(r)
	if err != nil {
		var ve validationError
		if errors.As(err, &ve) {
			h.writeJSON(w, http.StatusBadRequest, errorBody{Error: ve.Error(), Code: "VALIDATION"})
			return
		}
		h.writeJSON(w, http.StatusBadRequest, errorBody{Error: "Invalid JSON body", Code: "VALIDATION"})
		return
	}
	message, apiErr := validateReportMessage(raw)
	if apiErr != nil {
		h.writeJSON(w, http.StatusBadRequest, *apiErr)
		return
	}
	key := strings.TrimSpace(os.Getenv("CURSOR_API_KEY"))
	if key == "" {
		h.writeJSON(w, http.StatusServiceUnavailable, errorBody{
			Error:   "Cursor API key not configured",
			Code:    "CONFIG",
			Details: strPtr("CURSOR_API_KEY is not configured"),
		})
		return
	}
	_ = message
	h.writeJSON(w, http.StatusNotImplemented, errorBody{
		Error: "Report bug agent is not available in the Go API",
		Code:  "INTERNAL",
	})
}

type validationError struct{ msg string }

func (e validationError) Error() string { return e.msg }

func readJSONObject(r *http.Request) (any, error) {
	defer r.Body.Close()
	body, err := io.ReadAll(io.LimitReader(r.Body, 64<<10))
	if err != nil {
		return nil, err
	}
	if len(body) == 0 {
		return nil, validationError{msg: "Invalid JSON body"}
	}
	var raw any
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, validationError{msg: "Invalid JSON body"}
	}
	switch raw.(type) {
	case map[string]any:
		return raw, nil
	default:
		return nil, validationError{msg: "Body must be an object"}
	}
}

func validateReportMessage(raw any) (string, *errorBody) {
	obj, ok := raw.(map[string]any)
	if !ok {
		return "", &errorBody{Error: "Body must be an object", Code: "VALIDATION"}
	}
	messageRaw, exists := obj["message"]
	message, ok := messageRaw.(string)
	if !exists || !ok {
		return "", &errorBody{Error: "message must be a string", Code: "VALIDATION"}
	}
	message = strings.TrimSpace(message)
	if message == "" {
		return "", &errorBody{Error: "message is required", Code: "VALIDATION"}
	}
	if utf8.RuneCountInString(message) > reportBugMaxLen {
		return "", &errorBody{Error: "message must be at most 4000 characters", Code: "VALIDATION"}
	}
	return message, nil
}

func normalizeTicker(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "AAPL"
	}
	return strings.ToUpper(trimmed)
}

func (h *Handler) corsOrigin() string {
	if h.CORSOrigin != "" {
		return h.CORSOrigin
	}
	return "http://localhost:5173"
}

func (h *Handler) writeHeaders(w http.ResponseWriter, _ int) {
	w.Header().Set("Access-Control-Allow-Origin", h.corsOrigin())
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "content-type")
}

func (h *Handler) writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	h.writeHeaders(w, status)
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(body)
}

func strPtr(s string) *string { return &s }
