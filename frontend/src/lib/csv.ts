type Cell = string | number | boolean | null | undefined;

/** Builds a CSV (UTF-8 with BOM so Excel opens it correctly) and downloads it. Cells starting with = + - @ are neutralised against spreadsheet formula injection. */
export function downloadCsv(filename: string, header: string[], rows: Cell[][]): void {
  const esc = (v: Cell) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Fetches every page (100 per page, at most 50 pages) of a paged endpoint. */
export async function fetchAllPages<T>(load: (page: number) => Promise<{ items: T[]; total: number }>): Promise<T[]> {
  const out: T[] = [];
  for (let p = 1; p <= 50; p++) {
    const r = await load(p);
    out.push(...r.items);
    if (out.length >= r.total || r.items.length === 0) break;
  }
  return out;
}
