package yahoo

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestParseChartFixture(t *testing.T) {
	var body any
	if err := json.Unmarshal(readFixture(t, "minimal-chart.json"), &body); err != nil {
		t.Fatal(err)
	}
	out := ParseChart(body)
	if out.ErrorMessage != nil {
		t.Fatalf("error: %s", *out.ErrorMessage)
	}
	if out.Currency == nil || *out.Currency != "USD" {
		t.Fatalf("currency: %#v", out.Currency)
	}
	if out.Symbol == nil || *out.Symbol != "AAPL" {
		t.Fatalf("symbol: %#v", out.Symbol)
	}
	if out.LastPrice == nil || *out.LastPrice != 198.5 {
		t.Fatalf("lastPrice: %#v", out.LastPrice)
	}
	if len(out.Points) != 2 {
		t.Fatalf("points: %d", len(out.Points))
	}
	if out.Points[0].Timestamp != 1700000000 || out.Points[0].Close != 198.1 || out.Points[0].Volume == nil || *out.Points[0].Volume != 1000000 {
		t.Fatalf("point0: %+v", out.Points[0])
	}
	if out.Points[1].Timestamp != 1700086400 || out.Points[1].Close != 198.5 || out.Points[1].Volume == nil || *out.Points[1].Volume != 1100000 {
		t.Fatalf("point1: %+v", out.Points[1])
	}
}

func TestParseChartInvalidShape(t *testing.T) {
	out := ParseChart(nil)
	if out.ErrorMessage == nil || *out.ErrorMessage != "Invalid JSON" {
		t.Fatalf("got %#v", out.ErrorMessage)
	}
	if len(out.Points) != 0 {
		t.Fatalf("points: %d", len(out.Points))
	}
}

func TestParseChartErrorObject(t *testing.T) {
	out := ParseChart(map[string]any{
		"chart": map[string]any{
			"error": map[string]any{"description": "Invalid symbol"},
		},
	})
	if out.ErrorMessage == nil || *out.ErrorMessage != "Invalid symbol" {
		t.Fatalf("got %#v", out.ErrorMessage)
	}
	if len(out.Points) != 0 {
		t.Fatalf("points: %d", len(out.Points))
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
