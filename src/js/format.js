/** Number formatting shared by both pages. Pure. */

const significant = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 2 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * Money at a sensible precision for its size. Per-request costs are often
 * fractions of a cent, and "$0.00" would hide exactly the differences this tool
 * exists to show, so small values keep two significant digits.
 */
export function usd(value) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '$0';
  const abs = Math.abs(value);
  if (abs >= 100) return `$${whole.format(value)}`;
  if (abs >= 1) return `$${value.toFixed(2)}`;
  if (abs >= 0.01) return `$${value.toFixed(4)}`;
  return `$${significant.format(value)}`;
}

export const tokens = (n) => (Number.isFinite(n) ? whole.format(n) : '—');

export function percent(share) {
  if (!Number.isFinite(share)) return '—';
  if (share === 0) return '0%';
  if (share < 0.0001) return '<0.01%';
  if (share < 0.01) return `${(share * 100).toFixed(2)}%`;
  if (share < 1) return `${(share * 100).toFixed(1)}%`;
  return `${Math.round(share * 100)}%`;
}

export function shortDate(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
