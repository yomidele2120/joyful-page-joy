import * as XLSX from 'xlsx';

export type ProductImportRow = { name: string; price: number };

const normalizedHeader = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');

export async function parseProductImportFile(file: File): Promise<{
  rows: ProductImportRow[];
  sourceType: 'csv' | 'excel';
}> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Upload files must be 10 MB or smaller.');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('The selected file has no worksheets.');
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
  if (data.length < 2) throw new Error('Include a header row and at least one product row.');
  const headers = data[0].map(normalizedHeader);
  const nameIndex = headers.findIndex(value => ['name', 'product', 'productname', 'title'].includes(value));
  const priceIndex = headers.findIndex(value => ['price', 'sellingprice', 'clientprice', 'clientsellingprice'].includes(value));
  if (nameIndex < 0 || priceIndex < 0) {
    throw new Error('The file must have product name and client selling price columns (for example: Product Name, Selling Price).');
  }

  const rows: ProductImportRow[] = [];
  const seen = new Set<string>();
  for (let index = 1; index < data.length; index++) {
    const row = data[index];
    const name = String(row[nameIndex] ?? '').trim();
    const rawPrice = String(row[priceIndex] ?? '').trim().replace(/,/g, '');
    if (!name && !rawPrice) continue;
    if (!name || name.length > 250) throw new Error(`Row ${index + 1}: product name is missing or longer than 250 characters.`);
    if (!/^\d+(?:\.\d{1,2})?$/.test(rawPrice)) {
      throw new Error(`Row ${index + 1}: client selling price must be a non-negative number with up to 2 decimal places.`);
    }
    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price > 9999999999.99) {
      throw new Error(`Row ${index + 1}: client selling price is outside the supported range.`);
    }
    const key = name.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) throw new Error(`Row ${index + 1}: "${name}" appears more than once in this file.`);
    seen.add(key);
    rows.push({ name, price });
  }
  if (!rows.length) throw new Error('No product rows were found.');
  if (rows.length > 1000) throw new Error('A single upload can contain at most 1,000 products.');
  return { rows, sourceType: /\.csv$/i.test(file.name) ? 'csv' : 'excel' };
}
