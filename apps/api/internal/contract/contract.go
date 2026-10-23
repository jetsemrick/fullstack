// Package contract mirrors the JSON shapes in packages/shared/src (types.ts, constants.ts).
// Keep field names and nullability in sync with @stock/shared; the web client depends on them.
package contract

const (
	DefaultRange    = "max"
	DefaultInterval = "1d"
	DefaultTicker   = "AAPL"
)

// MajorIndexSymbols are the Yahoo symbols for S&P 500, Dow Jones Industrial Average, and Nasdaq Composite.
var MajorIndexSymbols = []string{"^GSPC", "^DJI", "^IXIC"}

type PricePoint struct {
	Timestamp float64  `json:"timestamp"`
	Close     float64  `json:"close"`
	Volume    *float64 `json:"volume"`
}

type GetPricesResponse struct {
	Ticker    string       `json:"ticker"`
	Currency  *string      `json:"currency"`
	LastPrice *float64     `json:"lastPrice"`
	Series    []PricePoint `json:"series"`
}

type ErrorCode string

const (
	CodeValidation ErrorCode = "VALIDATION"
	CodeUpstream   ErrorCode = "UPSTREAM"
	CodeNotFound   ErrorCode = "NOT_FOUND"
	CodeInternal   ErrorCode = "INTERNAL"
	CodeConfig     ErrorCode = "CONFIG"
)

type ApiErrorBody struct {
	Error   string    `json:"error"`
	Code    ErrorCode `json:"code"`
	Details string    `json:"details,omitempty"`
}

type ReportBugResponse struct {
	RunID  string `json:"runId"`
	Status string `json:"status"`
	Result string `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

type MarketIndexQuote struct {
	Symbol        string   `json:"symbol"`
	ShortName     string   `json:"shortName"`
	Price         *float64 `json:"price"`
	ChangePercent *float64 `json:"changePercent"`
}

type MarketContextResponse struct {
	MarketState *string            `json:"marketState"`
	Indexes     []MarketIndexQuote `json:"indexes"`
}
