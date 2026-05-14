/**
 * Portfolio valuation and P&L aggregation.
 *
 * Rounding: callers format for display (e.g. 2 decimal places). Row market values
 * and P&L are summed in IEEE-754 double precision; totals should match the sum of
 * unformatted row values within ~1e-8 relative error for typical share sizes.
 */

export interface PortfolioHoldingInput {
  ticker: string;
  shares: number;
  /** Cost per share; when null, P&L for that row is not computed */
  averageCostPerShare: number | null;
}

export interface HoldingValuationRow extends PortfolioHoldingInput {
  lastPrice: number | null;
}

export interface PortfolioTotals {
  totalMarketValue: number;
  /** Sum of (shares * averageCost) where averageCost is set; 0 if none */
  totalCostBasis: number;
  /** Unrealized P&L rows only where both lastPrice and averageCost exist */
  totalUnrealizedPl: number | null;
}

export function aggregatePortfolioTotals(rows: HoldingValuationRow[]): PortfolioTotals {
  let totalMarketValue = 0;
  let totalCostBasis = 0;
  let plParts: number[] = [];

  for (const row of rows) {
    if (row.lastPrice != null && Number.isFinite(row.lastPrice) && row.shares > 0) {
      totalMarketValue += row.shares * row.lastPrice;
    }
    if (row.averageCostPerShare != null && Number.isFinite(row.averageCostPerShare) && row.shares > 0) {
      totalCostBasis += row.shares * row.averageCostPerShare;
    }
    if (
      row.lastPrice != null &&
      Number.isFinite(row.lastPrice) &&
      row.averageCostPerShare != null &&
      Number.isFinite(row.averageCostPerShare) &&
      row.shares > 0
    ) {
      const mv = row.shares * row.lastPrice;
      const cost = row.shares * row.averageCostPerShare;
      plParts.push(mv - cost);
    }
  }

  const totalUnrealizedPl = plParts.length > 0 ? plParts.reduce((a, b) => a + b, 0) : null;

  return { totalMarketValue, totalCostBasis, totalUnrealizedPl };
}

export function rowMarketValue(shares: number, lastPrice: number | null): number | null {
  if (lastPrice == null || !Number.isFinite(lastPrice) || shares <= 0) return null;
  return shares * lastPrice;
}

export function rowUnrealizedPl(
  shares: number,
  lastPrice: number | null,
  averageCostPerShare: number | null,
): number | null {
  if (
    lastPrice == null ||
    !Number.isFinite(lastPrice) ||
    averageCostPerShare == null ||
    !Number.isFinite(averageCostPerShare) ||
    shares <= 0
  ) {
    return null;
  }
  return shares * lastPrice - shares * averageCostPerShare;
}
