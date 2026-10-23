package yahoo

import (
	"context"
	"fmt"
	"net/url"

	"github.com/jetsemrick/fullstack/apps/api/internal/contract"
)

type ChartResult struct {
	// ErrorMessage is empty on success.
	ErrorMessage string
	Points       []contract.PricePoint
	Currency     *string
	LastPrice    *float64
	Symbol       *string
}

// ParseChart normalizes a decoded Yahoo v8 chart payload into a close-based price series.
func ParseChart(body any) ChartResult {
	root, ok := asObject(body)
	if !ok {
		return ChartResult{ErrorMessage: "Invalid JSON"}
	}
	chart, ok := asObject(root["chart"])
	if !ok {
		return ChartResult{ErrorMessage: "Missing chart"}
	}
	if errObj, ok := asObject(chart["error"]); ok {
		if d, present := errObj["description"]; present {
			if s, ok := asString(d); ok {
				return ChartResult{ErrorMessage: s}
			}
			return ChartResult{ErrorMessage: "Chart error"}
		}
	}
	results, ok := chart["result"].([]any)
	if !ok || len(results) == 0 {
		return ChartResult{ErrorMessage: "No data for symbol"}
	}
	first, _ := asObject(results[0])

	var currency, symbol *string
	var lastPrice *float64
	if meta, ok := asObject(first["meta"]); ok {
		currency = strPtr(meta["currency"])
		symbol = strPtr(meta["symbol"])
		lastPrice = numPtr(meta["regularMarketPrice"])
		if lastPrice == nil {
			lastPrice = numPtr(meta["chartPreviousClose"])
		}
	}
	out := ChartResult{Currency: currency, LastPrice: lastPrice, Symbol: symbol}

	timestamps, ok := first["timestamp"].([]any)
	if !ok || len(timestamps) == 0 {
		out.ErrorMessage = "No series data"
		return out
	}
	closes, volumes, ok := extractQuoteArrays(first["indicators"])
	if !ok || len(closes) != len(timestamps) {
		out.ErrorMessage = "Malformed quote data"
		return out
	}

	points := make([]contract.PricePoint, 0, len(timestamps))
	for i, rawTs := range timestamps {
		ts, ok := asNumber(rawTs)
		if !ok {
			continue
		}
		closeVal, ok := asNumber(closes[i])
		if !ok {
			continue
		}
		var volume *float64
		if volumes != nil && i < len(volumes) {
			volume = numPtr(volumes[i])
		}
		points = append(points, contract.PricePoint{Timestamp: ts, Close: closeVal, Volume: volume})
	}
	if len(points) == 0 {
		out.ErrorMessage = "No price points"
		return out
	}
	out.Points = points
	return out
}

func extractQuoteArrays(indicators any) (closes []any, volumes []any, ok bool) {
	ind, ok := asObject(indicators)
	if !ok {
		return nil, nil, false
	}
	quotes, ok := ind["quote"].([]any)
	if !ok || len(quotes) == 0 {
		return nil, nil, false
	}
	q0, ok := asObject(quotes[0])
	if !ok {
		return nil, nil, false
	}
	closes, ok = q0["close"].([]any)
	if !ok {
		return nil, nil, false
	}
	volumes, _ = q0["volume"].([]any)
	return closes, volumes, true
}

// FetchChart loads a chart for ticker. Empty rangeParam/interval fall back to the shared defaults (max / 1d).
func (c *Client) FetchChart(ctx context.Context, ticker, rangeParam, interval string) (ChartResult, error) {
	if rangeParam == "" {
		rangeParam = contract.DefaultRange
	}
	if interval == "" {
		interval = contract.DefaultInterval
	}
	params := url.Values{}
	params.Set("range", rangeParam)
	params.Set("interval", interval)
	res, err := c.get(ctx, c.chartURL(ticker, params))
	if err != nil {
		return ChartResult{}, err
	}
	if res.jsonErr != nil {
		return ChartResult{ErrorMessage: fmt.Sprintf("Invalid response (%d)", res.status)}, nil
	}
	parsed := ParseChart(res.body)
	if !res.ok && parsed.ErrorMessage == "" {
		parsed.ErrorMessage = fmt.Sprintf("HTTP %d", res.status)
	}
	return parsed, nil
}
