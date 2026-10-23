package yahoo

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"
	_ "time/tzdata"

	"github.com/jetsemrick/fullstack/apps/api/internal/contract"
)

type QuoteAggregate struct {
	// ErrorMessage is empty on success.
	ErrorMessage string
	MarketState  *string
	Indexes      []contract.MarketIndexQuote
}

var newYork = mustLoadLocation("America/New_York")

func mustLoadLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		panic(err)
	}
	return loc
}

// InferUSCashMarketState approximates the US equities session from the Eastern clock.
// Yahoo chart meta usually omits marketState; this ignores exchange holidays.
func InferUSCashMarketState(now time.Time) string {
	et := now.In(newYork)
	if wd := et.Weekday(); wd == time.Saturday || wd == time.Sunday {
		return "CLOSED"
	}
	hm := et.Hour()*60 + et.Minute()
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

func parseQuoteItem(raw any) (contract.MarketIndexQuote, bool) {
	o, ok := asObject(raw)
	if !ok {
		return contract.MarketIndexQuote{}, false
	}
	symbol, ok := asString(o["symbol"])
	if !ok || symbol == "" {
		return contract.MarketIndexQuote{}, false
	}
	shortName, ok := asString(o["shortName"])
	if !ok {
		if shortName, ok = asString(o["shortname"]); !ok {
			shortName = symbol
		}
	}
	return contract.MarketIndexQuote{
		Symbol:        symbol,
		ShortName:     shortName,
		Price:         numPtr(o["regularMarketPrice"]),
		ChangePercent: numPtr(o["regularMarketChangePercent"]),
	}, true
}

// ParseQuoteResponse parses a decoded Yahoo v7 quote payload for the major indexes.
func ParseQuoteResponse(body any) QuoteAggregate {
	root, ok := asObject(body)
	if !ok {
		return QuoteAggregate{ErrorMessage: "Invalid JSON"}
	}
	qr, ok := asObject(root["quoteResponse"])
	if !ok {
		return QuoteAggregate{ErrorMessage: "Missing quote response"}
	}
	if e, ok := asString(qr["error"]); ok && e != "" {
		return QuoteAggregate{ErrorMessage: e}
	}
	results, ok := qr["result"].([]any)
	if !ok {
		return QuoteAggregate{ErrorMessage: "Malformed quote results"}
	}

	var marketState *string
	indexes := []contract.MarketIndexQuote{}
	for _, item := range results {
		q, ok := parseQuoteItem(item)
		if !ok {
			continue
		}
		indexes = append(indexes, q)
		if q.Symbol == "^GSPC" {
			if ms := strPtr(item.(map[string]any)["marketState"]); ms != nil {
				marketState = ms
			}
		}
	}
	if len(indexes) == 0 {
		return QuoteAggregate{ErrorMessage: "No index quotes parsed"}
	}

	ordered := orderByMajorSymbols(indexes)
	if marketState == nil {
		for _, item := range results {
			if o, ok := asObject(item); ok {
				if ms := strPtr(o["marketState"]); ms != nil {
					marketState = ms
					break
				}
			}
		}
	}
	if len(ordered) == 0 {
		ordered = indexes
	}
	return QuoteAggregate{MarketState: marketState, Indexes: ordered}
}

func orderByMajorSymbols(indexes []contract.MarketIndexQuote) []contract.MarketIndexQuote {
	bySymbol := make(map[string]contract.MarketIndexQuote, len(indexes))
	for _, q := range indexes {
		if _, dup := bySymbol[q.Symbol]; !dup {
			bySymbol[q.Symbol] = q
		}
	}
	ordered := []contract.MarketIndexQuote{}
	for _, sym := range contract.MajorIndexSymbols {
		if q, ok := bySymbol[sym]; ok {
			ordered = append(ordered, q)
		}
	}
	return ordered
}

type chartIndexRow struct {
	quote       contract.MarketIndexQuote
	marketState *string
}

// parseIndexFromChart reads price vs previous close from v8 chart meta (used when v7 quote is blocked).
func parseIndexFromChart(body any) (chartIndexRow, bool) {
	root, ok := asObject(body)
	if !ok {
		return chartIndexRow{}, false
	}
	chart, ok := asObject(root["chart"])
	if !ok {
		return chartIndexRow{}, false
	}
	results, ok := chart["result"].([]any)
	if !ok || len(results) == 0 {
		return chartIndexRow{}, false
	}
	first, _ := asObject(results[0])
	meta, ok := asObject(first["meta"])
	if !ok {
		return chartIndexRow{}, false
	}
	symbol, ok := asString(meta["symbol"])
	if !ok || symbol == "" {
		return chartIndexRow{}, false
	}
	shortName, ok := asString(meta["shortName"])
	if !ok {
		if shortName, ok = asString(meta["longName"]); !ok {
			shortName = symbol
		}
	}
	price := numPtr(meta["regularMarketPrice"])
	prev := numPtr(meta["chartPreviousClose"])
	if prev == nil {
		prev = numPtr(meta["previousClose"])
	}
	var changePercent *float64
	if price != nil && prev != nil && *prev != 0 {
		pct := (*price - *prev) / *prev * 100
		changePercent = &pct
	}
	return chartIndexRow{
		quote:       contract.MarketIndexQuote{Symbol: symbol, ShortName: shortName, Price: price, ChangePercent: changePercent},
		marketState: strPtr(meta["marketState"]),
	}, true
}

func (c *Client) fetchMajorIndexQuotesViaChart(ctx context.Context, now time.Time) QuoteAggregate {
	rows := make([]*chartIndexRow, len(contract.MajorIndexSymbols))
	var wg sync.WaitGroup
	for i, sym := range contract.MajorIndexSymbols {
		wg.Add(1)
		go func(i int, sym string) {
			defer wg.Done()
			params := url.Values{}
			params.Set("range", "1d")
			params.Set("interval", "1d")
			res, err := c.get(ctx, c.chartURL(sym, params))
			if err != nil || res.jsonErr != nil || !res.ok {
				return
			}
			if row, ok := parseIndexFromChart(res.body); ok {
				rows[i] = &row
			}
		}(i, sym)
	}
	wg.Wait()

	find := func(sym string) *chartIndexRow {
		for _, r := range rows {
			if r != nil && r.quote.Symbol == sym {
				return r
			}
		}
		return nil
	}

	var marketState *string
	if r := find("^GSPC"); r != nil {
		marketState = r.marketState
	}
	if marketState == nil {
		for _, r := range rows {
			if r != nil && r.marketState != nil {
				marketState = r.marketState
				break
			}
		}
	}

	indexes := []contract.MarketIndexQuote{}
	for _, sym := range contract.MajorIndexSymbols {
		if r := find(sym); r != nil {
			indexes = append(indexes, r.quote)
		}
	}
	if len(indexes) == 0 {
		return QuoteAggregate{ErrorMessage: "No benchmark quotes"}
	}
	if marketState == nil {
		s := InferUSCashMarketState(now)
		marketState = &s
	}
	return QuoteAggregate{MarketState: marketState, Indexes: indexes}
}

func (c *Client) fetchMajorIndexQuotesViaV7(ctx context.Context) (QuoteAggregate, error) {
	params := url.Values{}
	params.Set("symbols", strings.Join(contract.MajorIndexSymbols, ","))
	res, err := c.get(ctx, c.QuoteURL+"?"+params.Encode())
	if err != nil {
		return QuoteAggregate{}, err
	}
	if res.jsonErr != nil {
		return QuoteAggregate{ErrorMessage: fmt.Sprintf("Invalid response (%d)", res.status)}, nil
	}
	parsed := ParseQuoteResponse(res.body)
	if !res.ok && parsed.ErrorMessage == "" {
		parsed.ErrorMessage = fmt.Sprintf("HTTP %d", res.status)
	}
	return parsed, nil
}

// FetchMajorIndexQuotes tries the v7 aggregate quote first (often blocked), then falls back to
// per-symbol v8 chart meta, the same pathway as /api/prices.
func (c *Client) FetchMajorIndexQuotes(ctx context.Context) (QuoteAggregate, error) {
	v7, err := c.fetchMajorIndexQuotesViaV7(ctx)
	if err != nil {
		return QuoteAggregate{}, err
	}
	if v7.ErrorMessage == "" && len(v7.Indexes) > 0 {
		return v7, nil
	}
	viaChart := c.fetchMajorIndexQuotesViaChart(ctx, time.Now())
	if len(viaChart.Indexes) > 0 {
		return viaChart, nil
	}
	msg := v7.ErrorMessage
	if msg == "" {
		msg = viaChart.ErrorMessage
	}
	if msg == "" {
		msg = "No benchmark quotes"
	}
	return QuoteAggregate{ErrorMessage: msg}, nil
}
