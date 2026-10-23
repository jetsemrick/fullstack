package yahoo

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func loadFixture(t *testing.T, name string) any {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	var body any
	if err := json.Unmarshal(data, &body); err != nil {
		t.Fatal(err)
	}
	return body
}

func decode(t *testing.T, s string) any {
	t.Helper()
	var body any
	if err := json.Unmarshal([]byte(s), &body); err != nil {
		t.Fatal(err)
	}
	return body
}

func TestParseChartMinimalFixture(t *testing.T) {
	out := ParseChart(loadFixture(t, "minimal-chart.json"))
	if out.ErrorMessage != "" {
		t.Fatalf("unexpected error %q", out.ErrorMessage)
	}
	if out.Currency == nil || *out.Currency != "USD" {
		t.Errorf("currency = %v, want USD", out.Currency)
	}
	if out.Symbol == nil || *out.Symbol != "AAPL" {
		t.Errorf("symbol = %v, want AAPL", out.Symbol)
	}
	if out.LastPrice == nil || *out.LastPrice != 198.5 {
		t.Errorf("lastPrice = %v, want 198.5", out.LastPrice)
	}
	if len(out.Points) != 2 {
		t.Fatalf("len(points) = %d, want 2", len(out.Points))
	}
	want := []struct{ ts, close, volume float64 }{
		{1700000000, 198.1, 1000000},
		{1700086400, 198.5, 1100000},
	}
	for i, w := range want {
		p := out.Points[i]
		if p.Timestamp != w.ts || p.Close != w.close || p.Volume == nil || *p.Volume != w.volume {
			t.Errorf("points[%d] = {%v %v %v}, want %v", i, p.Timestamp, p.Close, p.Volume, w)
		}
	}
}

func TestParseChartInvalidShape(t *testing.T) {
	out := ParseChart(nil)
	if out.ErrorMessage != "Invalid JSON" || len(out.Points) != 0 {
		t.Fatalf("got %+v", out)
	}
}

func TestParseChartErrorObject(t *testing.T) {
	out := ParseChart(decode(t, `{"chart":{"error":{"description":"Invalid symbol"}}}`))
	if out.ErrorMessage != "Invalid symbol" || len(out.Points) != 0 {
		t.Fatalf("got %+v", out)
	}
}

func TestParseChartSkipsNullClosesAndFallsBackToPreviousClose(t *testing.T) {
	out := ParseChart(decode(t, `{"chart":{"result":[{
		"meta":{"chartPreviousClose":10},
		"timestamp":[1,2,3],
		"indicators":{"quote":[{"close":[1.5,null,2.5],"volume":[null,5]}]}
	}]}}`))
	if out.ErrorMessage != "" {
		t.Fatalf("unexpected error %q", out.ErrorMessage)
	}
	if out.LastPrice == nil || *out.LastPrice != 10 {
		t.Errorf("lastPrice = %v, want 10", out.LastPrice)
	}
	if out.Currency != nil || out.Symbol != nil {
		t.Errorf("expected nil currency/symbol, got %v %v", out.Currency, out.Symbol)
	}
	if len(out.Points) != 2 || out.Points[0].Volume != nil || out.Points[1].Volume != nil {
		t.Fatalf("points = %+v", out.Points)
	}
}

func TestParseChartMalformedQuote(t *testing.T) {
	out := ParseChart(decode(t, `{"chart":{"result":[{"timestamp":[1,2],"indicators":{"quote":[{"close":[1]}]}}]}}`))
	if out.ErrorMessage != "Malformed quote data" {
		t.Fatalf("got %q", out.ErrorMessage)
	}
}

func TestParseQuoteResponseFixture(t *testing.T) {
	out := ParseQuoteResponse(loadFixture(t, "minimal-quote.json"))
	if out.ErrorMessage != "" {
		t.Fatalf("unexpected error %q", out.ErrorMessage)
	}
	if out.MarketState == nil || *out.MarketState != "REGULAR" {
		t.Errorf("marketState = %v, want REGULAR", out.MarketState)
	}
	want := []string{"^GSPC", "^DJI", "^IXIC"}
	if len(out.Indexes) != len(want) {
		t.Fatalf("len(indexes) = %d, want 3", len(out.Indexes))
	}
	for i, sym := range want {
		if out.Indexes[i].Symbol != sym {
			t.Errorf("indexes[%d] = %s, want %s", i, out.Indexes[i].Symbol, sym)
		}
	}
}

func TestParseQuoteResponseOrdersMajorSymbols(t *testing.T) {
	out := ParseQuoteResponse(decode(t, `{"quoteResponse":{"result":[
		{"symbol":"^IXIC","shortname":"Nasdaq"},
		{"symbol":"^GSPC","marketState":"CLOSED"}
	]}}`))
	if len(out.Indexes) != 2 || out.Indexes[0].Symbol != "^GSPC" || out.Indexes[1].ShortName != "Nasdaq" {
		t.Fatalf("indexes = %+v", out.Indexes)
	}
	if out.Indexes[0].ShortName != "^GSPC" || out.Indexes[0].Price != nil {
		t.Errorf("expected symbol fallback shortName and nil price, got %+v", out.Indexes[0])
	}
	if out.MarketState == nil || *out.MarketState != "CLOSED" {
		t.Errorf("marketState = %v", out.MarketState)
	}
}

func TestParseQuoteResponseErrors(t *testing.T) {
	cases := map[string]string{
		`null`:                                   "Invalid JSON",
		`{"finance":{}}`:                         "Missing quote response",
		`{"quoteResponse":{"error":"blocked"}}`:  "blocked",
		`{"quoteResponse":{"result":null}}`:      "Malformed quote results",
		`{"quoteResponse":{"result":[{"x":1}]}}`: "No index quotes parsed",
	}
	for in, want := range cases {
		if got := ParseQuoteResponse(decode(t, in)).ErrorMessage; got != want {
			t.Errorf("ParseQuoteResponse(%s) error = %q, want %q", in, got, want)
		}
	}
}

func TestInferUSCashMarketState(t *testing.T) {
	cases := []struct {
		utc  string
		want string
	}{
		{"2026-10-24T15:00:00Z", "CLOSED"},      // Saturday
		{"2026-10-23T12:00:00Z", "PRE_MARKET"},  // 08:00 EDT
		{"2026-10-23T13:30:00Z", "REGULAR"},     // 09:30 EDT
		{"2026-10-23T20:00:00Z", "POST_MARKET"}, // 16:00 EDT
		{"2026-10-24T00:00:00Z", "CLOSED"},      // 20:00 EDT Friday
		{"2026-12-01T14:30:00Z", "REGULAR"},     // 09:30 EST
	}
	for _, c := range cases {
		now, err := time.Parse(time.RFC3339, c.utc)
		if err != nil {
			t.Fatal(err)
		}
		if got := InferUSCashMarketState(now); got != c.want {
			t.Errorf("InferUSCashMarketState(%s) = %s, want %s", c.utc, got, c.want)
		}
	}
}
