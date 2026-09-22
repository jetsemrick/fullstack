package yahoo

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"time"
	_ "time/tzdata"
)

const quoteURL = "https://query1.finance.yahoo.com/v7/finance/quote"

// MajorIndexSymbols are S&P 500, Dow Jones, and Nasdaq Composite.
var MajorIndexSymbols = []string{"^GSPC", "^DJI", "^IXIC"}

// IndexQuote is one major-index row returned by /api/market-context.
type IndexQuote struct {
	Symbol        string   `json:"symbol"`
	ShortName     string   `json:"shortName"`
	Price         *float64 `json:"price"`
	ChangePercent *float64 `json:"changePercent"`
}

// QuoteResult is the normalized market-context payload.
type QuoteResult struct {
	ErrorMessage *string
	MarketState  *string
	Indexes      []IndexQuote
}

func emptyQuote(message string) QuoteResult {
	return QuoteResult{ErrorMessage: &message, Indexes: []IndexQuote{}}
}

// ParseQuoteResponse reads a Yahoo v7 quote payload.
func ParseQuoteResponse(body any) QuoteResult {
	root, ok := asObject(body)
	if !ok {
		return emptyQuote("Invalid JSON")
	}
	qr, ok := asObject(root["quoteResponse"])
	if !ok {
		return emptyQuote("Missing quote response")
	}
	if errStr, ok := qr["error"].(string); ok && errStr != "" {
		return emptyQuote(errStr)
	}
	result, ok := qr["result"].([]any)
	if !ok {
		return emptyQuote("Malformed quote results")
	}

	var marketState *string
	indexes := make([]IndexQuote, 0, len(result))
	for _, item := range result {
		q := parseQuoteItem(item)
		if q == nil {
			continue
		}
		indexes = append(indexes, *q)
		obj, _ := asObject(item)
		if obj != nil && obj["symbol"] == "^GSPC" {
			if ms, ok := obj["marketState"].(string); ok {
				marketState = &ms
			}
		}
	}
	if len(indexes) == 0 {
		return emptyQuote("No index quotes parsed")
	}

	bySymbol := make(map[string]IndexQuote, len(indexes))
	for _, row := range indexes {
		bySymbol[row.Symbol] = row
	}
	ordered := make([]IndexQuote, 0, len(MajorIndexSymbols))
	for _, sym := range MajorIndexSymbols {
		if row, ok := bySymbol[sym]; ok {
			ordered = append(ordered, row)
		}
	}
	if marketState == nil {
		for _, item := range result {
			obj, ok := asObject(item)
			if !ok {
				continue
			}
			if ms, ok := obj["marketState"].(string); ok {
				marketState = &ms
				break
			}
		}
	}
	out := indexes
	if len(ordered) > 0 {
		out = ordered
	}
	return QuoteResult{MarketState: marketState, Indexes: out}
}

func parseQuoteItem(raw any) *IndexQuote {
	o, ok := asObject(raw)
	if !ok {
		return nil
	}
	symbol, ok := o["symbol"].(string)
	if !ok || symbol == "" {
		return nil
	}
	shortName := symbol
	if s, ok := o["shortName"].(string); ok {
		shortName = s
	} else if s, ok := o["shortname"].(string); ok {
		shortName = s
	}
	return &IndexQuote{
		Symbol:        symbol,
		ShortName:     shortName,
		Price:         pickNumber(o["regularMarketPrice"]),
		ChangePercent: pickNumber(o["regularMarketChangePercent"]),
	}
}

type chartIndex struct {
	IndexQuote
	MarketState *string
}

func parseIndexFromChartBody(body any) *chartIndex {
	root, ok := asObject(body)
	if !ok {
		return nil
	}
	chart, ok := asObject(root["chart"])
	if !ok {
		return nil
	}
	result, ok := chart["result"].([]any)
	if !ok || len(result) == 0 {
		return nil
	}
	first, ok := asObject(result[0])
	if !ok {
		return nil
	}
	meta, ok := asObject(first["meta"])
	if !ok {
		return nil
	}
	symbol, ok := meta["symbol"].(string)
	if !ok || symbol == "" {
		return nil
	}
	shortName := symbol
	if s, ok := meta["shortName"].(string); ok {
		shortName = s
	} else if s, ok := meta["longName"].(string); ok {
		shortName = s
	}
	price := pickNumber(meta["regularMarketPrice"])
	prev := pickNumber(meta["chartPreviousClose"])
	if prev == nil {
		prev = pickNumber(meta["previousClose"])
	}
	var changePercent *float64
	if price != nil && prev != nil && *prev != 0 {
		pct := ((*price - *prev) / *prev) * 100
		changePercent = &pct
	}
	var marketState *string
	if ms, ok := meta["marketState"].(string); ok {
		marketState = &ms
	}
	return &chartIndex{
		IndexQuote: IndexQuote{
			Symbol:        symbol,
			ShortName:     shortName,
			Price:         price,
			ChangePercent: changePercent,
		},
		MarketState: marketState,
	}
}

// InferUSCashMarketState approximates the US cash session in America/New_York.
// It ignores exchange holidays, matching the previous API.
func InferUSCashMarketState(now time.Time) string {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		return "CLOSED"
	}
	local := now.In(loc)
	if local.Weekday() == time.Saturday || local.Weekday() == time.Sunday {
		return "CLOSED"
	}
	hm := local.Hour()*60 + local.Minute()
	const (
		preOpen   = 4 * 60
		rthOpen   = 9*60 + 30
		rthClose  = 16 * 60
		postClose = 20 * 60
	)
	switch {
	case hm >= rthOpen && hm < rthClose:
		return "REGULAR"
	case hm >= preOpen && hm < rthOpen:
		return "PRE_MARKET"
	case hm >= rthClose && hm < postClose:
		return "POST_MARKET"
	default:
		return "CLOSED"
	}
}

func fetchMajorIndexQuotesViaChart(ctx context.Context, client *http.Client) QuoteResult {
	rows := make([]*chartIndex, len(MajorIndexSymbols))
	var wg sync.WaitGroup
	for i, symbol := range MajorIndexSymbols {
		wg.Add(1)
		go func(i int, symbol string) {
			defer wg.Done()
			u, err := url.Parse(chartBase + "/" + url.PathEscape(symbol))
			if err != nil {
				return
			}
			q := u.Query()
			q.Set("range", "1d")
			q.Set("interval", "1d")
			u.RawQuery = q.Encode()
			status, payload, err := getJSON(ctx, client, u.String())
			if err != nil || payload == nil {
				return
			}
			row := parseIndexFromChartBody(payload)
			if row == nil || status < 200 || status >= 300 {
				return
			}
			rows[i] = row
		}(i, symbol)
	}
	wg.Wait()

	var marketState *string
	for _, row := range rows {
		if row != nil && row.Symbol == "^GSPC" && row.MarketState != nil {
			marketState = row.MarketState
			break
		}
	}
	if marketState == nil {
		for _, row := range rows {
			if row != nil && row.MarketState != nil {
				marketState = row.MarketState
				break
			}
		}
	}

	indexes := make([]IndexQuote, 0, len(MajorIndexSymbols))
	for i, sym := range MajorIndexSymbols {
		row := rows[i]
		if row == nil || row.Symbol != sym {
			continue
		}
		indexes = append(indexes, row.IndexQuote)
	}
	if len(indexes) == 0 {
		return emptyQuote("No benchmark quotes")
	}
	if marketState == nil {
		inferred := InferUSCashMarketState(time.Now())
		marketState = &inferred
	}
	return QuoteResult{MarketState: marketState, Indexes: indexes}
}

func fetchMajorIndexQuotesViaV7(ctx context.Context, client *http.Client) (QuoteResult, error) {
	u, err := url.Parse(quoteURL)
	if err != nil {
		return QuoteResult{}, err
	}
	q := u.Query()
	q.Set("symbols", joinSymbols(MajorIndexSymbols))
	u.RawQuery = q.Encode()
	status, payload, err := getJSON(ctx, client, u.String())
	if err != nil {
		return QuoteResult{}, err
	}
	if payload == nil {
		msg := fmt.Sprintf("Invalid response (%d)", status)
		return emptyQuote(msg), nil
	}
	parsed := ParseQuoteResponse(payload)
	if (status < 200 || status >= 300) && parsed.ErrorMessage == nil {
		msg := fmt.Sprintf("HTTP %d", status)
		parsed.ErrorMessage = &msg
	}
	return parsed, nil
}

// FetchMajorIndexQuotes tries the v7 quote endpoint, then per-symbol v8 chart meta.
func FetchMajorIndexQuotes(ctx context.Context, client *http.Client) (QuoteResult, error) {
	if client == nil {
		client = http.DefaultClient
	}
	v7, err := fetchMajorIndexQuotesViaV7(ctx, client)
	if err != nil {
		return QuoteResult{}, err
	}
	if v7.ErrorMessage == nil && len(v7.Indexes) > 0 {
		return v7, nil
	}
	viaChart := fetchMajorIndexQuotesViaChart(ctx, client)
	if len(viaChart.Indexes) > 0 {
		viaChart.ErrorMessage = nil
		return viaChart, nil
	}
	msg := "No benchmark quotes"
	if v7.ErrorMessage != nil {
		msg = *v7.ErrorMessage
	} else if viaChart.ErrorMessage != nil {
		msg = *viaChart.ErrorMessage
	}
	return emptyQuote(msg), nil
}

func joinSymbols(symbols []string) string {
	out := ""
	for i, s := range symbols {
		if i > 0 {
			out += ","
		}
		out += s
	}
	return out
}
