package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jetsemrick/fullstack/apps/api/internal/contract"
	"github.com/jetsemrick/fullstack/apps/api/internal/reportbug"
	"github.com/jetsemrick/fullstack/apps/api/internal/yahoo"
)

const testOrigin = "http://localhost:5173"

func readFixture(t *testing.T, name string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

// newTestServer wires the API to a fake Yahoo host. Unhandled upstream paths return 404.
func newTestServer(t *testing.T, upstream http.HandlerFunc) *Server {
	t.Helper()
	if upstream == nil {
		upstream = func(w http.ResponseWriter, r *http.Request) {
			t.Errorf("unexpected upstream request %s", r.URL)
			http.NotFound(w, r)
		}
	}
	yahooSrv := httptest.NewServer(upstream)
	t.Cleanup(yahooSrv.Close)
	return &Server{
		Yahoo: &yahoo.Client{
			HTTP:      yahooSrv.Client(),
			ChartBase: yahooSrv.URL + "/v8/finance/chart",
			QuoteURL:  yahooSrv.URL + "/v7/finance/quote",
		},
		CORSOrigin: testOrigin,
		ReportBug: func(context.Context, string) (contract.ReportBugResponse, error) {
			t.Error("unexpected report-bug run")
			return contract.ReportBugResponse{}, nil
		},
	}
}

func do(t *testing.T, s *Server, method, target, body string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != testOrigin {
		t.Errorf("CORS origin = %q, want %q", got, testOrigin)
	}
	var parsed map[string]any
	if strings.HasPrefix(rec.Header().Get("Content-Type"), "application/json") {
		if err := json.Unmarshal(rec.Body.Bytes(), &parsed); err != nil {
			t.Fatalf("invalid JSON body %q: %v", rec.Body.String(), err)
		}
	}
	return rec, parsed
}

func expectError(t *testing.T, rec *httptest.ResponseRecorder, body map[string]any, status int, code contract.ErrorCode) {
	t.Helper()
	if rec.Code != status {
		t.Errorf("status = %d, want %d (body %s)", rec.Code, status, rec.Body.String())
	}
	if body["code"] != string(code) {
		t.Errorf("code = %v, want %s", body["code"], code)
	}
	if _, ok := body["error"].(string); !ok {
		t.Errorf("missing error message in %v", body)
	}
}

func TestHealth(t *testing.T) {
	rec, body := do(t, newTestServer(t, nil), http.MethodGet, "/api/health", "")
	if rec.Code != http.StatusOK || body["ok"] != true {
		t.Fatalf("got %d %v", rec.Code, body)
	}
}

func TestOptionsPreflight(t *testing.T) {
	rec, _ := do(t, newTestServer(t, nil), http.MethodOptions, "/api/prices", "")
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Methods") != "GET, POST, OPTIONS" {
		t.Errorf("allow-methods = %q", rec.Header().Get("Access-Control-Allow-Methods"))
	}
}

func TestUnknownRouteIs404(t *testing.T) {
	rec, _ := do(t, newTestServer(t, nil), http.MethodGet, "/api/nope", "")
	if rec.Code != http.StatusNotFound || rec.Body.String() != "Not found" {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
	rec, _ = do(t, newTestServer(t, nil), http.MethodPost, "/api/health", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("POST /api/health status = %d, want 404", rec.Code)
	}
}

func TestPricesValidation(t *testing.T) {
	cases := []string{
		"/api/prices?ticker=!!!",
		"/api/prices?ticker=" + strings.Repeat("A", 33),
		"/api/prices?ticker=AAPL&range=invalid",
		"/api/prices?ticker=AAPL&range=",
		"/api/prices?ticker=AAPL&interval=7d",
	}
	for _, target := range cases {
		t.Run(target, func(t *testing.T) {
			rec, body := do(t, newTestServer(t, nil), http.MethodGet, target, "")
			expectError(t, rec, body, http.StatusBadRequest, contract.CodeValidation)
		})
	}
}

func TestPricesSuccess(t *testing.T) {
	fixture := readFixture(t, "minimal-chart.json")
	var gotPath string
	var gotQuery url.Values
	s := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotQuery = r.URL.EscapedPath(), r.URL.Query()
		if r.Header.Get("User-Agent") == "" {
			t.Error("missing User-Agent")
		}
		_, _ = w.Write([]byte(fixture))
	})
	rec, body := do(t, s, http.MethodGet, "/api/prices?ticker=aapl", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	if gotPath != "/v8/finance/chart/AAPL" || gotQuery.Get("range") != "max" || gotQuery.Get("interval") != "1d" {
		t.Errorf("upstream request = %s?%s", gotPath, gotQuery.Encode())
	}
	if body["ticker"] != "AAPL" || body["currency"] != "USD" || body["lastPrice"] != 198.5 {
		t.Errorf("body = %v", body)
	}
	if _, has := body["range"]; has {
		t.Error("unexpected range field")
	}
	series := body["series"].([]any)
	if len(series) != 2 {
		t.Fatalf("len(series) = %d", len(series))
	}
	first := series[0].(map[string]any)
	if first["close"] != 198.1 || first["timestamp"] != float64(1700000000) || first["volume"] != float64(1000000) {
		t.Errorf("series[0] = %v", first)
	}
}

func TestPricesDefaultsTickerAndForwardsRangeInterval(t *testing.T) {
	fixture := readFixture(t, "minimal-chart.json")
	s := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v8/finance/chart/AAPL" || r.URL.Query().Get("range") != "5d" || r.URL.Query().Get("interval") != "5m" {
			t.Errorf("upstream request = %s", r.URL)
		}
		_, _ = w.Write([]byte(fixture))
	})
	rec, _ := do(t, s, http.MethodGet, "/api/prices?range=5d&interval=5m", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestPricesEscapesIndexSymbol(t *testing.T) {
	s := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.EscapedPath() != "/v8/finance/chart/%5EGSPC" {
			t.Errorf("escaped path = %s", r.URL.EscapedPath())
		}
		_, _ = w.Write([]byte(readFixture(t, "minimal-chart.json")))
	})
	if rec, _ := do(t, s, http.MethodGet, "/api/prices?ticker=^GSPC", ""); rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestPricesUpstreamErrors(t *testing.T) {
	chartFixture := readFixture(t, "minimal-chart.json")
	cases := []struct {
		name   string
		status int
		body   string
		want   int
		code   contract.ErrorCode
	}{
		{"chart error object", http.StatusNotFound, `{"chart":{"result":null,"error":{"code":"Not Found","description":"No data found, symbol may be delisted"}}}`, http.StatusNotFound, contract.CodeNotFound},
		{"non-JSON body", http.StatusTooManyRequests, "Too Many Requests", http.StatusNotFound, contract.CodeNotFound},
		{"HTTP error with series", http.StatusServiceUnavailable, chartFixture, http.StatusBadGateway, contract.CodeUpstream},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(c.status)
				_, _ = w.Write([]byte(c.body))
			})
			rec, body := do(t, s, http.MethodGet, "/api/prices?ticker=ZZZZ", "")
			expectError(t, rec, body, c.want, c.code)
		})
	}
}

func TestPricesNetworkFailureIs500(t *testing.T) {
	s := newTestServer(t, nil)
	s.Yahoo.ChartBase = "http://127.0.0.1:1/v8/finance/chart"
	rec, body := do(t, s, http.MethodGet, "/api/prices?ticker=AAPL", "")
	expectError(t, rec, body, http.StatusInternalServerError, contract.CodeInternal)
	if body["details"] == nil {
		t.Error("expected details")
	}
}

func TestMarketContextViaV7(t *testing.T) {
	fixture := readFixture(t, "minimal-quote.json")
	s := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v7/finance/quote" || r.URL.Query().Get("symbols") != "^GSPC,^DJI,^IXIC" {
			t.Errorf("unexpected upstream request %s", r.URL)
		}
		_, _ = w.Write([]byte(fixture))
	})
	rec, body := do(t, s, http.MethodGet, "/api/market-context", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	if body["marketState"] != "REGULAR" {
		t.Errorf("marketState = %v", body["marketState"])
	}
	assertIndexSymbols(t, body)
}

func TestMarketContextFallsBackToChartWhenV7Blocked(t *testing.T) {
	shortNames := map[string]string{"^GSPC": "S&P 500", "^DJI": "Dow", "^IXIC": "NASDAQ"}
	s := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v7/finance/quote" {
			_, _ = w.Write([]byte(`{"finance":{"result":null,"error":{"code":"Unauthorized","description":"blocked"}}}`))
			return
		}
		sym, ok := strings.CutPrefix(r.URL.Path, "/v8/finance/chart/")
		if !ok {
			http.NotFound(w, r)
			return
		}
		body, _ := json.Marshal(map[string]any{"chart": map[string]any{"result": []any{map[string]any{"meta": map[string]any{
			"symbol": sym, "shortName": shortNames[sym], "regularMarketPrice": 100, "chartPreviousClose": 80, "marketState": "REGULAR",
		}}}, "error": nil}})
		_, _ = w.Write(body)
	})
	rec, body := do(t, s, http.MethodGet, "/api/market-context", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	if body["marketState"] != "REGULAR" {
		t.Errorf("marketState = %v", body["marketState"])
	}
	assertIndexSymbols(t, body)
	first := body["indexes"].([]any)[0].(map[string]any)
	if first["price"] != float64(100) || first["changePercent"] != float64(25) || first["shortName"] != "S&P 500" {
		t.Errorf("indexes[0] = %v", first)
	}
}

func TestMarketContextAllUpstreamFailuresIs502(t *testing.T) {
	s := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte("forbidden"))
	})
	rec, body := do(t, s, http.MethodGet, "/api/market-context", "")
	expectError(t, rec, body, http.StatusBadGateway, contract.CodeUpstream)
	if body["error"] != "Invalid response (403)" {
		t.Errorf("error = %v", body["error"])
	}
}

func assertIndexSymbols(t *testing.T, body map[string]any) {
	t.Helper()
	indexes, _ := body["indexes"].([]any)
	var got []string
	for _, i := range indexes {
		got = append(got, i.(map[string]any)["symbol"].(string))
	}
	if strings.Join(got, ",") != "^GSPC,^DJI,^IXIC" {
		t.Errorf("index symbols = %v", got)
	}
}

func TestReportBugValidation(t *testing.T) {
	cases := map[string]string{
		"invalid JSON":   "{",
		"array body":     "[]",
		"null body":      "null",
		"non-string":     `{"message":5}`,
		"blank message":  `{"message":"   "}`,
		"too long":       `{"message":"` + strings.Repeat("a", 4001) + `"}`,
		"too long emoji": `{"message":"` + strings.Repeat("😀", 2001) + `"}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			rec, parsed := do(t, newTestServer(t, nil), http.MethodPost, "/api/report-bug", body)
			expectError(t, rec, parsed, http.StatusBadRequest, contract.CodeValidation)
		})
	}
}

func TestReportBugMissingKeyIs503(t *testing.T) {
	t.Setenv("CURSOR_API_KEY", "")
	s := newTestServer(t, nil)
	s.ReportBug = reportbug.NewBunRunner("unused.ts", ".")
	rec, body := do(t, s, http.MethodPost, "/api/report-bug", `{"message":"Fix the chart legend"}`)
	expectError(t, rec, body, http.StatusServiceUnavailable, contract.CodeConfig)
}

func TestReportBugOutcomes(t *testing.T) {
	cases := []struct {
		name   string
		res    contract.ReportBugResponse
		err    error
		status int
		code   contract.ErrorCode
	}{
		{name: "finished", res: contract.ReportBugResponse{RunID: "run-1", Status: "finished", Result: "done"}, status: http.StatusOK},
		{name: "run error", res: contract.ReportBugResponse{RunID: "run-2", Status: "error", Error: "boom"}, status: http.StatusBadGateway},
		{name: "sdk error", err: &reportbug.Error{Code: contract.CodeUpstream, Message: "rate limited"}, status: http.StatusBadGateway, code: contract.CodeUpstream},
		{name: "internal", err: &reportbug.Error{Code: contract.CodeInternal, Message: "bridge crashed"}, status: http.StatusInternalServerError, code: contract.CodeInternal},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s := newTestServer(t, nil)
			var gotMessage string
			s.ReportBug = func(_ context.Context, msg string) (contract.ReportBugResponse, error) {
				gotMessage = msg
				return c.res, c.err
			}
			rec, body := do(t, s, http.MethodPost, "/api/report-bug", `{"message":"  Fix the legend  "}`)
			if gotMessage != "Fix the legend" {
				t.Errorf("message = %q, want trimmed", gotMessage)
			}
			if c.err != nil {
				expectError(t, rec, body, c.status, c.code)
				return
			}
			if rec.Code != c.status || body["runId"] != c.res.RunID || body["status"] != c.res.Status {
				t.Errorf("got %d %v", rec.Code, body)
			}
		})
	}
}
