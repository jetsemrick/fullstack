package yahoo

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
)

const (
	chartBase = "https://query1.finance.yahoo.com/v8/finance/chart"
	userAgent = "Mozilla/5.0 (compatible; StockVisualizer/1.0)"
	maxBody   = 8 << 20

	DefaultRange    = "max"
	DefaultInterval = "1d"
)

// PricePoint is one close on the series. Volume is null when Yahoo omits it.
type PricePoint struct {
	Timestamp int64    `json:"timestamp"`
	Close     float64  `json:"close"`
	Volume    *float64 `json:"volume"`
}

// ChartResult is the normalized chart parse, matching the former TypeScript parser.
type ChartResult struct {
	ErrorMessage *string
	Points       []PricePoint
	Currency     *string
	LastPrice    *float64
	Symbol       *string
}

func emptyChart(message string) ChartResult {
	return ChartResult{ErrorMessage: &message, Points: []PricePoint{}}
}

// ParseChart defensively reads a Yahoo v8 chart payload.
func ParseChart(body any) ChartResult {
	root, ok := asObject(body)
	if !ok {
		return emptyChart("Invalid JSON")
	}
	chart, ok := asObject(root["chart"])
	if !ok {
		return emptyChart("Missing chart")
	}
	if errObj, ok := asObject(chart["error"]); ok {
		if d, exists := errObj["description"]; exists {
			if s, ok := d.(string); ok {
				return emptyChart(s)
			}
			return emptyChart("Chart error")
		}
	}
	result, ok := chart["result"].([]any)
	if !ok || len(result) == 0 {
		return emptyChart("No data for symbol")
	}
	first, ok := asObject(result[0])
	if !ok {
		return emptyChart("No data for symbol")
	}
	meta, _ := asObject(first["meta"])
	currency := stringField(meta, "currency")
	symbol := stringField(meta, "symbol")
	var lastPrice *float64
	if meta != nil {
		lastPrice = pickNumber(meta["regularMarketPrice"])
		if lastPrice == nil {
			lastPrice = pickNumber(meta["chartPreviousClose"])
		}
	}
	timestamps, ok := first["timestamp"].([]any)
	if !ok || len(timestamps) == 0 {
		return ChartResult{
			ErrorMessage: strPtr("No series data"),
			Points:       []PricePoint{},
			Currency:     currency,
			LastPrice:    lastPrice,
			Symbol:       symbol,
		}
	}
	quote := extractQuoteArrays(first["indicators"])
	if quote == nil || len(quote.close) != len(timestamps) {
		return ChartResult{
			ErrorMessage: strPtr("Malformed quote data"),
			Points:       []PricePoint{},
			Currency:     currency,
			LastPrice:    lastPrice,
			Symbol:       symbol,
		}
	}
	points := make([]PricePoint, 0, len(timestamps))
	for i, rawTS := range timestamps {
		ts, ok := finiteFloat(rawTS)
		if !ok {
			continue
		}
		closeRaw := quote.close[i]
		if closeRaw == nil {
			continue
		}
		closeVal, ok := finiteFloat(closeRaw)
		if !ok {
			continue
		}
		var volume *float64
		if quote.volume != nil && i < len(quote.volume) {
			if quote.volume[i] == nil {
				volume = nil
			} else if v, ok := finiteFloat(quote.volume[i]); ok {
				volume = &v
			}
		}
		points = append(points, PricePoint{
			Timestamp: int64(ts),
			Close:     closeVal,
			Volume:    volume,
		})
	}
	if len(points) == 0 {
		return ChartResult{
			ErrorMessage: strPtr("No price points"),
			Points:       []PricePoint{},
			Currency:     currency,
			LastPrice:    lastPrice,
			Symbol:       symbol,
		}
	}
	return ChartResult{
		Points:    points,
		Currency:  currency,
		LastPrice: lastPrice,
		Symbol:    symbol,
	}
}

type quoteArrays struct {
	close  []any
	volume []any
}

func extractQuoteArrays(indicators any) *quoteArrays {
	obj, ok := asObject(indicators)
	if !ok {
		return nil
	}
	quoteArr, ok := obj["quote"].([]any)
	if !ok || len(quoteArr) == 0 {
		return nil
	}
	q0, ok := asObject(quoteArr[0])
	if !ok {
		return nil
	}
	closeArr, ok := q0["close"].([]any)
	if !ok {
		return nil
	}
	var volume []any
	if vol, ok := q0["volume"].([]any); ok {
		volume = vol
	}
	return &quoteArrays{close: closeArr, volume: volume}
}

// ChartOpts selects the Yahoo range and interval. Empty values use the defaults.
type ChartOpts struct {
	Range    string
	Interval string
}

// FetchChart loads and parses a Yahoo chart. Network failures are returned as errors;
// unusable payloads are ChartResult.ErrorMessage.
func FetchChart(ctx context.Context, client *http.Client, ticker string, opts ChartOpts) (ChartResult, error) {
	if client == nil {
		client = http.DefaultClient
	}
	rangeVal := opts.Range
	if rangeVal == "" {
		rangeVal = DefaultRange
	}
	interval := opts.Interval
	if interval == "" {
		interval = DefaultInterval
	}
	u, err := url.Parse(chartBase + "/" + url.PathEscape(ticker))
	if err != nil {
		return ChartResult{}, err
	}
	q := u.Query()
	q.Set("range", rangeVal)
	q.Set("interval", interval)
	u.RawQuery = q.Encode()

	status, payload, err := getJSON(ctx, client, u.String())
	if err != nil {
		return ChartResult{}, err
	}
	if payload == nil && status >= 0 {
		msg := fmt.Sprintf("Invalid response (%d)", status)
		return emptyChart(msg), nil
	}
	parsed := ParseChart(payload)
	if status < 200 || status >= 300 {
		if parsed.ErrorMessage == nil {
			msg := fmt.Sprintf("HTTP %d", status)
			parsed.ErrorMessage = &msg
		}
	}
	return parsed, nil
}

func getJSON(ctx context.Context, client *http.Client, rawURL string) (int, any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	res, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, maxBody))
	if err != nil {
		return res.StatusCode, nil, err
	}
	var payload any
	if err := json.Unmarshal(body, &payload); err != nil {
		return res.StatusCode, nil, nil
	}
	return res.StatusCode, payload, nil
}

func asObject(v any) (map[string]any, bool) {
	if v == nil {
		return nil, false
	}
	m, ok := v.(map[string]any)
	return m, ok
}

func stringField(obj map[string]any, key string) *string {
	if obj == nil {
		return nil
	}
	s, ok := obj[key].(string)
	if !ok {
		return nil
	}
	return &s
}

func pickNumber(v any) *float64 {
	n, ok := finiteFloat(v)
	if !ok {
		return nil
	}
	return &n
}

func finiteFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		if math.IsNaN(n) || math.IsInf(n, 0) {
			return 0, false
		}
		return n, true
	case json.Number:
		f, err := n.Float64()
		if err != nil || math.IsNaN(f) || math.IsInf(f, 0) {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}

func strPtr(s string) *string {
	return &s
}
