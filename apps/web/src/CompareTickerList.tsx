import type { GetPricesResponse } from "@stock/shared";
import type { CompareSeries } from "./priceChartData";

function formatPrice(v: number | null, currency: string | null): string {
  if (v == null) return "—";
  const num = v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${num} ${currency}` : num;
}

type CompareTickerListProps = {
  series: CompareSeries[];
  dataByTicker: Record<string, GetPricesResponse>;
};

export function CompareTickerList({ series, dataByTicker }: CompareTickerListProps) {
  return (
    <div className="compare-metrics">
      <p className="compare-mode-label">Percent change from first visible point (indexed to 100)</p>
      <ul className="compare-ticker-list" aria-label="Compared symbols">
        {series.map((s) => {
          const data = dataByTicker[s.ticker];
          if (!data) return null;
          return (
            <li key={s.ticker} className="compare-ticker-item">
              <span className="compare-ticker-swatch" style={{ backgroundColor: s.color }} aria-hidden />
              <span className="compare-ticker-symbol">{s.ticker}</span>
              <span className="compare-ticker-price">{formatPrice(data.lastPrice, data.currency)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
