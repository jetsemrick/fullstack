package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRejectsInvalidTicker(t *testing.T) {
	res := do(t, testHandler(nil), httptest.NewRequest(http.MethodGet, "/api/prices?ticker=!!!", nil))
	if res.Code != http.StatusBadRequest {
		t.Fatalf("status %d", res.Code)
	}
	assertCode(t, res.Body.Bytes(), "VALIDATION")
}

func TestRejectsInvalidRange(t *testing.T) {
	res := do(t, testHandler(nil), httptest.NewRequest(http.MethodGet, "/api/prices?ticker=AAPL&range=invalid", nil))
	if res.Code != http.StatusBadRequest {
		t.Fatalf("status %d", res.Code)
	}
	assertCode(t, res.Body.Bytes(), "VALIDATION")
}

func TestRejectsInvalidInterval(t *testing.T) {
	res := do(t, testHandler(nil), httptest.NewRequest(http.MethodGet, "/api/prices?ticker=AAPL&interval=2y", nil))
	if res.Code != http.StatusBadRequest {
		t.Fatalf("status %d", res.Code)
	}
	assertCode(t, res.Body.Bytes(), "VALIDATION")
}

func TestHealth(t *testing.T) {
	res := do(t, testHandler(nil), httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if res.Code != http.StatusOK {
		t.Fatalf("status %d", res.Code)
	}
	var body struct {
		OK bool `json:"ok"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if !body.OK {
		t.Fatal("expected ok")
	}
	if got := res.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Fatalf("cors: %s", got)
	}
}

func TestReportBugRejectsBlankMessage(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/report-bug", strings.NewReader(`{"message":"   "}`))
	req.Header.Set("Content-Type", "application/json")
	res := do(t, testHandler(nil), req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", res.Code, res.Body.String())
	}
	assertCode(t, res.Body.Bytes(), "VALIDATION")
}

func TestReportBugMissingKey(t *testing.T) {
	t.Setenv("CURSOR_API_KEY", "")
	req := httptest.NewRequest(http.MethodPost, "/api/report-bug", strings.NewReader(`{"message":"Fix the chart legend"}`))
	req.Header.Set("Content-Type", "application/json")
	res := do(t, testHandler(nil), req)
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d body %s", res.Code, res.Body.String())
	}
	assertCode(t, res.Body.Bytes(), "CONFIG")
}

func TestReportBugKeyPresentDoesNotRunAgent(t *testing.T) {
	t.Setenv("CURSOR_API_KEY", "test-key-not-sent")
	req := httptest.NewRequest(http.MethodPost, "/api/report-bug", strings.NewReader(`{"message":"Fix the chart legend"}`))
	req.Header.Set("Content-Type", "application/json")
	res := do(t, testHandler(nil), req)
	if res.Code != http.StatusNotImplemented {
		t.Fatalf("status %d body %s", res.Code, res.Body.String())
	}
	assertCode(t, res.Body.Bytes(), "INTERNAL")
	if strings.Contains(res.Body.String(), "test-key-not-sent") {
		t.Fatal("response leaked the API key")
	}
}

func TestPricesFromChartFixture(t *testing.T) {
	fixture := readFixture(t, "minimal-chart.json")
	h := testHandler(func(r *http.Request) (*http.Response, error) {
		if !strings.Contains(r.URL.Host, "finance.yahoo.com") {
			return textResponse(http.StatusNotFound, "not found"), nil
		}
		if strings.Contains(r.URL.Path, "/v8/finance/chart") {
			return jsonResponse(http.StatusOK, fixture), nil
		}
		return textResponse(http.StatusNotFound, "unsupported yahoo fixture"), nil
	})
	res := do(t, h, httptest.NewRequest(http.MethodGet, "/api/prices?ticker=AAPL", nil))
	if res.Code != http.StatusOK {
		t.Fatalf("status %d body %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["ticker"] != "AAPL" {
		t.Fatalf("ticker %#v", body["ticker"])
	}
	if _, ok := body["range"]; ok {
		t.Fatal("range should be absent")
	}
	series, ok := body["series"].([]any)
	if !ok || len(series) != 2 {
		t.Fatalf("series %#v", body["series"])
	}
	first := series[0].(map[string]any)
	if first["close"] != 198.1 {
		t.Fatalf("close %#v", first["close"])
	}
	if body["currency"] != "USD" {
		t.Fatalf("currency %#v", body["currency"])
	}
	if body["lastPrice"] != 198.5 {
		t.Fatalf("lastPrice %#v", body["lastPrice"])
	}
}

func TestMarketContextFromQuoteFixture(t *testing.T) {
	fixture := readFixture(t, "minimal-quote.json")
	h := testHandler(func(r *http.Request) (*http.Response, error) {
		if !strings.Contains(r.URL.Host, "finance.yahoo.com") {
			return textResponse(http.StatusNotFound, "not found"), nil
		}
		if strings.Contains(r.URL.Path, "/v7/finance/quote") {
			return jsonResponse(http.StatusOK, fixture), nil
		}
		return textResponse(http.StatusNotFound, "unsupported yahoo fixture"), nil
	})
	res := do(t, h, httptest.NewRequest(http.MethodGet, "/api/market-context", nil))
	if res.Code != http.StatusOK {
		t.Fatalf("status %d body %s", res.Code, res.Body.String())
	}
	var body struct {
		MarketState *string `json:"marketState"`
		Indexes     []struct {
			Symbol string `json:"symbol"`
		} `json:"indexes"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.MarketState == nil || *body.MarketState != "REGULAR" {
		t.Fatalf("marketState %#v", body.MarketState)
	}
	got := make([]string, len(body.Indexes))
	for i, row := range body.Indexes {
		got[i] = row.Symbol
	}
	want := []string{"^GSPC", "^DJI", "^IXIC"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("indexes %v", got)
	}
}

func TestMarketContextFallsBackToChart(t *testing.T) {
	h := testHandler(func(r *http.Request) (*http.Response, error) {
		u := r.URL.String()
		if !strings.Contains(r.URL.Host, "finance.yahoo.com") {
			return textResponse(http.StatusNotFound, "not found"), nil
		}
		if strings.Contains(u, "v7/finance/quote") {
			blocked := []byte(`{"finance":{"result":null,"error":{"code":"Unauthorized","description":"blocked"}}}`)
			return jsonResponse(http.StatusOK, blocked), nil
		}
		if strings.Contains(u, "v8/finance/chart") {
			decoded, err := url.PathUnescape(pathBase(r.URL.Path))
			if err != nil {
				decoded = "^GSPC"
			}
			short := decoded
			switch decoded {
			case "^GSPC":
				short = "S&P 500"
			case "^DJI":
				short = "Dow"
			case "^IXIC":
				short = "NASDAQ"
			}
			payload, err := json.Marshal(map[string]any{
				"chart": map[string]any{
					"result": []any{map[string]any{
						"meta": map[string]any{
							"symbol":             decoded,
							"shortName":          short,
							"regularMarketPrice": 100,
							"chartPreviousClose": 99,
							"marketState":        "REGULAR",
						},
					}},
					"error": nil,
				},
			})
			if err != nil {
				return textResponse(http.StatusInternalServerError, err.Error()), nil
			}
			return jsonResponse(http.StatusOK, payload), nil
		}
		return textResponse(http.StatusNotFound, "unsupported yahoo fixture"), nil
	})
	res := do(t, h, httptest.NewRequest(http.MethodGet, "/api/market-context", nil))
	if res.Code != http.StatusOK {
		t.Fatalf("status %d body %s", res.Code, res.Body.String())
	}
	var body struct {
		MarketState *string `json:"marketState"`
		Indexes     []struct {
			Symbol string  `json:"symbol"`
			Price  float64 `json:"price"`
		} `json:"indexes"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.MarketState == nil || *body.MarketState != "REGULAR" {
		t.Fatalf("marketState %#v", body.MarketState)
	}
	got := make([]string, len(body.Indexes))
	for i, row := range body.Indexes {
		got[i] = row.Symbol
	}
	if strings.Join(got, ",") != "^GSPC,^DJI,^IXIC" {
		t.Fatalf("indexes %v", got)
	}
	if len(body.Indexes) == 0 || body.Indexes[0].Price != 100 {
		t.Fatalf("price %#v", body.Indexes)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func testHandler(rt roundTripFunc) *Handler {
	var client *http.Client
	if rt != nil {
		client = &http.Client{Transport: rt}
	}
	return &Handler{CORSOrigin: "http://localhost:5173", Client: client}
}

func do(t *testing.T, h http.Handler, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func assertCode(t *testing.T, body []byte, code string) {
	t.Helper()
	var parsed struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.Code != code {
		t.Fatalf("code %s body %s", parsed.Code, body)
	}
}

func readFixture(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func jsonResponse(status int, body []byte) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(bytes.NewReader(body)),
	}
}

func textResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"text/plain"}},
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func pathBase(p string) string {
	if i := strings.LastIndex(p, "/"); i >= 0 {
		return p[i+1:]
	}
	return p
}
