// Package yahoo fetches and defensively parses unofficial Yahoo Finance chart and quote endpoints.
package yahoo

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"time"
)

const (
	DefaultChartBase = "https://query1.finance.yahoo.com/v8/finance/chart"
	DefaultQuoteURL  = "https://query1.finance.yahoo.com/v7/finance/quote"
	userAgent        = "Mozilla/5.0 (compatible; StockVisualizer/1.0)"
	maxBodyBytes     = 32 << 20
)

type Client struct {
	HTTP      *http.Client
	ChartBase string
	QuoteURL  string
}

func NewClient() *Client {
	return &Client{
		HTTP:      &http.Client{Timeout: 20 * time.Second},
		ChartBase: DefaultChartBase,
		QuoteURL:  DefaultQuoteURL,
	}
}

// chartURL matches the TS encodeURIComponent path segment (e.g. ^GSPC -> %5EGSPC).
func (c *Client) chartURL(symbol string, params url.Values) string {
	return c.ChartBase + "/" + url.QueryEscape(symbol) + "?" + params.Encode()
}

type upstreamResponse struct {
	status int
	ok     bool
	body   any
	// jsonErr is set when the body is not valid JSON.
	jsonErr error
}

// get performs a GET and decodes JSON. A non-nil error means the request itself failed (network, timeout).
func (c *Client) get(ctx context.Context, rawURL string) (upstreamResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return upstreamResponse{}, err
	}
	req.Header.Set("User-Agent", userAgent)
	res, err := c.HTTP.Do(req)
	if err != nil {
		return upstreamResponse{}, err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, maxBodyBytes))
	if err != nil {
		return upstreamResponse{}, err
	}
	out := upstreamResponse{status: res.StatusCode, ok: res.StatusCode >= 200 && res.StatusCode < 300}
	var body any
	if err := json.Unmarshal(data, &body); err != nil {
		out.jsonErr = err
		return out, nil
	}
	out.body = body
	return out, nil
}

func asObject(v any) (map[string]any, bool) {
	m, ok := v.(map[string]any)
	return m, ok
}

func asString(v any) (string, bool) {
	s, ok := v.(string)
	return s, ok
}

func asNumber(v any) (float64, bool) {
	f, ok := v.(float64)
	return f, ok
}

func numPtr(v any) *float64 {
	if f, ok := asNumber(v); ok {
		return &f
	}
	return nil
}

func strPtr(v any) *string {
	if s, ok := asString(v); ok {
		return &s
	}
	return nil
}
