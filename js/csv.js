// RFC 4180 CSV with UTF-8 BOM and CRLF so Excel opens Japanese/Korean text correctly.
function cell(v) {
  let s = v == null ? "" : String(v);
  // ponytail: neutralise spreadsheet formulas (=, @, "+x", "-x"); plain phone/number-like values are left alone.
  if (/^[=@\t\r]/.test(s) || /^[+-](?![\d\s().-]*$)/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(rows, columns) {
  const lines = [columns.map(cell).join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(","));
  return "﻿" + lines.join("\r\n");
}
