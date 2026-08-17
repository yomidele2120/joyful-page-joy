export function formatNaira(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w ]+/g, '')
    .replace(/ +/g, '-');
}

<<<<<<< HEAD
// "1.2K", "3.4M" style compact counts — used for shopper/follower-style
// stats where the exact number matters less than the sense of scale.
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
=======
// Compact counts for marketplace stats, e.g. 1200 -> "1.2K"
export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value ?? 0);
>>>>>>> 2febcb3d7aad58cf1d3d1f6567ff79008232febd
}
