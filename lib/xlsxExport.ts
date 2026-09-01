import * as XLSX from "xlsx"

/** Builds a single-sheet workbook from row objects and downloads it. */
export function downloadXlsx(
  rows: Record<string, string | number | null>[],
  filename: string,
  sheetName: string
) {
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  XLSX.writeFile(workbook, filename)
}
