// Rebuild natural reading lines from one PDF.js page's text items.
// Shared by browser uploads and Node benchmarks so both see identical text.
export function pageText(items) {
  // Group glyphs by baseline and sort horizontally to recover natural lines.
  const rows = [];
  for (const item of items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const y = item.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((row) =>
      row.items
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((item, i, items) => {
          if (!i) return item.str;
          const previous = items[i - 1];
          const gap =
            item.transform[4] - previous.transform[4] - previous.width;
          return (gap > 16 ? "   " : " ") + item.str;
        })
        .join(""),
    )
    .join("\n");
}
