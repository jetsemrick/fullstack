package yahoo

import (
	"encoding/json"
	"testing"
	"time"
)

func TestParseQuoteResponseFixture(t *testing.T) {
	var body any
	if err := json.Unmarshal(readFixture(t, "minimal-quote.json"), &body); err != nil {
		t.Fatal(err)
	}
	out := ParseQuoteResponse(body)
	if out.ErrorMessage != nil {
		t.Fatalf("error: %s", *out.ErrorMessage)
	}
	if out.MarketState == nil || *out.MarketState != "REGULAR" {
		t.Fatalf("marketState: %#v", out.MarketState)
	}
	if len(out.Indexes) != 3 {
		t.Fatalf("indexes: %d", len(out.Indexes))
	}
	want := []string{"^GSPC", "^DJI", "^IXIC"}
	for i, sym := range want {
		if out.Indexes[i].Symbol != sym {
			t.Fatalf("index %d: %s", i, out.Indexes[i].Symbol)
		}
	}
}

func TestInferUSCashMarketStateWeekend(t *testing.T) {
	// Saturday 15:00 UTC is still Saturday morning in New York.
	saturday := time.Date(2026, 9, 19, 15, 0, 0, 0, time.UTC)
	if got := InferUSCashMarketState(saturday); got != "CLOSED" {
		t.Fatalf("weekend: %s", got)
	}
	// Wednesday 14:00 UTC is 10:00 EDT.
	regular := time.Date(2026, 9, 16, 14, 0, 0, 0, time.UTC)
	if got := InferUSCashMarketState(regular); got != "REGULAR" {
		t.Fatalf("regular: %s", got)
	}
}
