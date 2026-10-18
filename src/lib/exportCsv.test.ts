import { describe, expect, it } from 'vitest';
import { csvEscape, toCsv } from './exportCsv';

describe('csvEscape', () => {
  it('leaves plain text alone and empties null', () => {
    expect(csvEscape('hello')).toBe('hello');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
    expect(csvEscape(12.5)).toBe('12.5');
  });
  it('quotes commas, quotes and new lines', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });
  it('defuses spreadsheet formulas', () => {
    expect(csvEscape('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvEscape('+1+1')).toBe("'+1+1");
    expect(csvEscape('@SUM(A1)')).toBe("'@SUM(A1)");
  });
  it('does not touch negative numbers', () => {
    expect(csvEscape(-5)).toBe('-5');
  });
});

describe('toCsv', () => {
  it('builds a header and rows', () => {
    expect(toCsv(['a', 'b'], [[1, 'x,y'], [2, null]])).toBe('a,b\r\n1,"x,y"\r\n2,');
  });
});
