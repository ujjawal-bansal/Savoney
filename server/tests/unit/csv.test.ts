import { describe, expect, it } from 'vitest';
import { parseCsv, parseTransactionCsv, toCsv } from '../../src/lib/csv.js';

describe('toCsv', () => {
  it('quotes fields and escapes embedded quotes', () => {
    const csv = toCsv([{ a: 'plain', b: 'has "quotes"' }], ['a', 'b']);
    expect(csv).toBe('"a","b"\r\n"plain","has ""quotes"""');
  });

  it('neutralises formula injection', () => {
    // A title beginning with = would execute as a formula on open in Excel or
    // Sheets, so it is prefixed with an apostrophe.
    const csv = toCsv(
      [{ title: '=cmd|calc' }, { title: '+1+1' }, { title: '@SUM(A1)' }],
      ['title'],
    );
    expect(csv).toContain('"\'=cmd|calc"');
    expect(csv).toContain('"\'+1+1"');
    expect(csv).toContain('"\'@SUM(A1)"');
  });
});

describe('parseCsv', () => {
  it('keeps commas that sit inside quoted fields', () => {
    // A naive split(',') would break this row into three cells.
    expect(parseCsv('a,b\n"one, two",three')).toEqual([
      ['a', 'b'],
      ['one, two', 'three'],
    ]);
  });

  it('handles escaped quotes and CRLF line endings', () => {
    expect(parseCsv('a\r\n"say ""hi"""\r\n')).toEqual([['a'], ['say "hi"']]);
  });

  it('strips a UTF-8 BOM so the first header name is usable', () => {
    expect(parseCsv('\uFEFFdate,title')).toEqual([['date', 'title']]);
  });

  it('drops entirely blank rows', () => {
    expect(parseCsv('a\n\n\nb')).toEqual([['a'], ['b']]);
  });
});

describe('parseTransactionCsv', () => {
  const header = 'date,title,amount,type,category,notes';

  it('parses valid rows into minor units', () => {
    const result = parseTransactionCsv(
      `${header}\n2026-03-01,Coffee,4.50,expense,Dining,morning`,
      'USD',
    );

    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]).toMatchObject({
      title: 'Coffee',
      amountMinor: 450,
      type: 'expense',
      category: 'Dining',
      notes: 'morning',
    });
  });

  it('reports missing required columns rather than guessing', () => {
    const result = parseTransactionCsv('date,title\n2026-03-01,Coffee', 'USD');
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]!.message).toContain('amount');
  });

  it('collects per-row errors instead of failing the whole import', () => {
    const result = parseTransactionCsv(
      [
        header,
        '2026-03-01,Good row,10.00,expense,Food,',
        'not-a-date,Bad date,10.00,expense,Food,',
        '2026-03-02,Bad type,10.00,sideways,Food,',
        '2026-03-03,Bad amount,abc,expense,Food,',
        '2026-03-04,X,10.00,expense,Food,',
      ].join('\n'),
      'USD',
    );

    // One good row survives; each bad row is reported by line number.
    expect(result.rows).toHaveLength(1);
    expect(result.errors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
  });

  it('strips currency symbols and takes the absolute amount', () => {
    const result = parseTransactionCsv(
      `${header}\n2026-03-01,Refund,"$1,234.56",income,Salary,`,
      'USD',
    );
    expect(result.rows[0]!.amountMinor).toBe(123_456);
  });

  it('reports an empty file', () => {
    expect(parseTransactionCsv('', 'USD').errors[0]!.message).toContain('empty');
  });
});
