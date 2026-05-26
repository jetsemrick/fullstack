import type { GetPricesResponse } from "@stock/shared";
import type { CompareSeries } from "./priceChartData";
import { colorForCompareInput } from "./compareColors";
import { resolveCompareColor } from "./priceChartData";

function formatPrice(v: number | null, currency: string | null): string {
  if (v == null) return "—";
  const num = v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${num} ${currency}` : num;
}

type CompareTickerListProps = {
  series: CompareSeries[];
  dataByTicker: Record<string, GetPricesResponse>;
  colorsByTicker: Record<string, string>;
  onColorChange: (ticker: string, color: string) => void;
};

export function CompareTickerList({
  series,
  dataByTicker,
  colorsByTicker,
  onColorChange,
}: CompareTickerListProps) {
  return (
    <ul className="compare-ticker-list" aria-label="Compared symbols">
      {series.map((s, index) => {
        const data = dataByTicker[s.ticker];
        if (!data) return null;
        const color = resolveCompareColor(s.ticker, index, colorsByTicker);
        return (
          <li key={s.ticker} className="compare-ticker-item">
            <label className="compare-ticker-color" title={`Change color for ${s.ticker}`}>
              <input
                type="color"
                className="compare-ticker-color__input"
                value={colorForCompareInput(color)}
                onChange={(e) => onColorChange(s.ticker, e.target.value)}
                aria-label={`Line color for ${s.ticker}`}
              />
              <span className="compare-ticker-swatch" style={{ backgroundColor: color }} aria-hidden />
            </label>
            <span className="compare-ticker-symbol">{s.ticker}</span>
            <span className="compare-ticker-price">{formatPrice(data.lastPrice, data.currency)}</span>
          </li>
        );
      })}
    </ul>
  );
}
