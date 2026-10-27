export function pickupCsvCell(value: string | null | undefined) {
  let text=value??"";
  // Shop names are external input; keep spreadsheets from treating them as formulas.
  if (/^[\t\r\n]|^\s*[=+@-]/u.test(text)) text="'"+text;
  return `"${text.replace(/"/g,'""')}"`;
}
