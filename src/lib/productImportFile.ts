import * as XLSX from 'xlsx';

export type ProductImportRow = {
  name: string;
  price: number;
  brand: string | null;
  categoryName: string | null;
  categoryId: string | null;
  description: string | null;
  imageUrl: string | null;
  sku: string | null;
  stockQuantity: number | null;
  specs: Record<string, string>;
};

const normalizedHeader = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
const knownHeaders = new Set([
  'name', 'product', 'productname', 'title', 'price', 'sellingprice', 'clientprice',
  'clientsellingprice', 'brand', 'category', 'categoryname', 'description',
  'categoryid', 'image', 'imageurl', 'sku', 'stock', 'stockquantity', 'quantity',
  'vendorid', 'isactive', 'isfeatured', 'badge', 'createdat', 'updatedat',
]);

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
    const valueFor = (aliases: string[]) => {
      const column = headers.findIndex(header => aliases.includes(header));
      const value = column < 0 ? '' : String(row[column] ?? '').trim();
      return value || null;
    };
    const stockValue = valueFor(['stock', 'stockquantity', 'quantity']);
    let stockQuantity: number | null = null;
    if (stockValue !== null) {
      if (!/^\d+$/.test(stockValue) || Number(stockValue) > 2147483647) {
        throw new Error(`Row ${index + 1}: stock quantity must be a non-negative whole number.`);
      }
      stockQuantity = Number(stockValue);
    }
    const specs: Record<string, string> = {};
    headers.forEach((header, column) => {
      const specName = String(data[0][column] ?? '').trim();
      const value = String(row[column] ?? '').trim();
      if (header && !knownHeaders.has(header) && specName && value) specs[specName] = value;
    });
    rows.push({
      name,
      price,
      brand: valueFor(['brand']),
      categoryName: valueFor(['category', 'categoryname']),
      categoryId: valueFor(['categoryid']),
      description: valueFor(['description']),
      imageUrl: valueFor(['image', 'imageurl']),
      sku: valueFor(['sku']),
      stockQuantity,
      specs,
    });
  }
  if (!rows.length) throw new Error('No product rows were found.');
  if (rows.length > 1000) throw new Error('A single upload can contain at most 1,000 products.');
  return { rows, sourceType: /\.csv$/i.test(file.name) ? 'csv' : 'excel' };
}
