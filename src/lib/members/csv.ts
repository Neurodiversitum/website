// CSV export for the board view. Pure function, testable in Node.

/** Quotes every cell, so names with commas, quotes or line breaks stay intact. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  // A leading formula character would run in a spreadsheet; neutralise it.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/** UTF-8 CSV with a byte-order mark, semicolons (Excel in German locales) are not used: comma. */
export function csv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((row) => row.map(cell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function csvResponse(fileName: string, body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
