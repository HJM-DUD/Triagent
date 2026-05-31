export function printJson(value, writer = console.log) {
  writer(JSON.stringify(value, null, 2));
}

export function formatTable(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(String(header).length, ...rows.map((row) => String(row[index] ?? "").length))
  );
  const formatRow = (row) => row.map((cell, index) => String(cell ?? "").padEnd(widths[index])).join("  ");
  return [formatRow(headers), ...rows.map(formatRow)].join("\n");
}

export function printTable(headers, rows, writer = console.log) {
  writer(formatTable(headers, rows));
}
