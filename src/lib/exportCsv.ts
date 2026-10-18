// Download a table as a CSV file that opens correctly in Excel and Google Sheets.
// - A byte-order mark makes Excel read accents and the naira sign properly.
// - Cells that start with = + - @ are prefixed with an apostrophe so a spreadsheet can never run them
//   as a formula (search words come from the public, so they must not be trusted).

export type CsvCell = string | number | boolean | null | undefined;

export function csvEscape(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' ? String(value) : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(head: string[], rows: CsvCell[][]): string {
  return [head, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, head: string[], rows: CsvCell[][]): void {
  const blob = new Blob(['\ufeff' + toCsv(head, rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File-name friendly date, e.g. 2026-10-20 */
export const stamp = () => new Date().toISOString().slice(0, 10);
