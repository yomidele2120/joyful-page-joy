import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseProductImportFile } from '../productImportFile';

const testRows = Array.from({ length: 10 }, (_, index) => [`Fixture item ${index + 1}`, (index + 1) * 125.25]);

function fileFromBytes(name: string, bytes: Uint8Array | ArrayBuffer): File {
  const exactBytes = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes.slice();
  return {
    name,
    arrayBuffer: async () => exactBytes.buffer.slice(exactBytes.byteOffset, exactBytes.byteOffset + exactBytes.byteLength),
  } as File;
}

describe('parseProductImportFile', () => {
  it('parses 10 CSV rows and preserves each client selling price', async () => {
    const csv = [
      'Product Name,Selling Price',
      ...testRows.map(([name, price]) => `${name},${price}`),
    ].join('\r\n');
    const parsed = await parseProductImportFile(fileFromBytes('fixtures.csv', new TextEncoder().encode(csv)));
    expect(parsed.sourceType).toBe('csv');
    expect(parsed.rows).toHaveLength(10);
    expect(parsed.rows.map(row => row.price)).toEqual(testRows.map(([, price]) => price));
  });

  it('accepts repeated products, optional product columns, and separate specification columns', async () => {
    const csv = [
      'Product Name,Selling Price,Brand,Category,Description,SKU,Stock,Color,Storage',
      'Phone Model A,125.50,Acme,Phones,Sample description,PHONE-A,8,Black,128GB',
      'Phone Model A,125.50,Acme,Phones,,PHONE-A,0,White,256GB',
    ].join('\r\n');
    const parsed = await parseProductImportFile(fileFromBytes('products.csv', new TextEncoder().encode(csv)));
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      name: 'Phone Model A',
      price: 125.5,
      brand: 'Acme',
      categoryName: 'Phones',
      description: 'Sample description',
      sku: 'PHONE-A',
      stockQuantity: 8,
      specs: { Color: 'Black', Storage: '128GB' },
    });
    expect(parsed.rows[1]).toMatchObject({
      name: 'Phone Model A',
      specs: { Color: 'White', Storage: '256GB' },
    });
  });

  it('parses 10 Excel rows and preserves each client selling price', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([['Product Name', 'Selling Price'], ...testRows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Products');
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array | ArrayBuffer;
    const parsed = await parseProductImportFile(fileFromBytes('fixtures.xlsx', bytes));
    expect(parsed.sourceType).toBe('excel');
    expect(parsed.rows).toHaveLength(10);
    expect(parsed.rows.map(row => row.price)).toEqual(testRows.map(([, price]) => price));
  });

  it('accepts 1,000 rows and rejects uploads above the limit', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => `Fixture item ${index + 1},100`);
    const file = (length: number) => fileFromBytes('fixtures.csv', new TextEncoder().encode([
      'Product Name,Selling Price', ...rows.slice(0, length),
    ].join('\n')));

    await expect(parseProductImportFile(file(1000))).resolves.toMatchObject({ rows: { length: 1000 } });
    await expect(parseProductImportFile(file(1001))).rejects.toThrow('at most 1,000 products');
  });
});
