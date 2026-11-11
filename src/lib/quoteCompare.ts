// Side-by-side comparison of supplier quotations for one request.
export interface QuoteLike { id: string; unit_price: number; moq: number | null; lead_time: string | null }
export interface QuoteCompared<T extends QuoteLike> { quote: T; total: number; lowest: boolean; moqTooHigh: boolean; vsLowestPercent: number }

export function compareQuotes<T extends QuoteLike>(quotes: T[], quantity: number): QuoteCompared<T>[] {
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const valid = quotes.filter(q => Number.isFinite(q.unit_price) && q.unit_price >= 0);
  const lowest = valid.length ? Math.min(...valid.map(q => q.unit_price)) : 0;
  return valid
    .map(quote => ({
      quote,
      total: quote.unit_price * qty,
      lowest: quote.unit_price === lowest,
      moqTooHigh: quote.moq != null && quote.moq > qty,
      vsLowestPercent: lowest > 0 ? Math.round((quote.unit_price / lowest - 1) * 100) : 0,
    }))
    .sort((a, b) => a.quote.unit_price - b.quote.unit_price);
}
