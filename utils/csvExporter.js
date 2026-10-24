/**
 * Helper to escape and serialize CSV values
 */
export const csvValue = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

/**
 * Streams formatted CSV attachment to the response
 */
export function sendCsv(res, filename, headers, rows) {
  res
    .type("text/csv")
    .attachment(filename)
    .send(
      [
        headers.map(csvValue).join(","),
        ...rows.map((row) => row.map(csvValue).join(",")),
      ].join("\n")
    );
}
export default sendCsv;
