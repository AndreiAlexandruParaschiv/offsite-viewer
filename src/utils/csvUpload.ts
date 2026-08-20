const SITE_ID_COL = 'site id';

export interface CsvImportResult {
  matched: string[];
  unmatched: string[];
  error?: string;
}

// Minimal RFC 4180-aware splitter: handles quoted fields (including commas
// and escaped double-quotes inside them).
function splitCsvRow(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cols.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

export function parseCsvForSites(
  text: string,
  siteIdMap: Map<string, string>,
): CsvImportResult {
  const lines = text.split(/\r?\n/);

  // Locate the header row by exact column match (not substring) so a header
  // like "Customer Site ID" doesn't produce colIdx = -1 and silently unmatches
  // every row.
  let headerIdx = -1;
  let colIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const headers = splitCsvRow(lines[i]).map((h) => h.trim().toLowerCase());
    const idx = headers.indexOf(SITE_ID_COL);
    if (idx !== -1) { headerIdx = i; colIdx = idx; break; }
  }

  if (headerIdx === -1) {
    return { matched: [], unmatched: [], error: "CSV must have a 'Site ID' column." };
  }

  const matched: string[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();

  for (const raw of lines.slice(headerIdx + 1)) {
    if (!raw.trim()) continue;
    const cell = (splitCsvRow(raw)[colIdx] ?? '').trim();
    if (!cell || seen.has(cell)) continue;
    seen.add(cell);
    const baseUrl = siteIdMap.get(cell);
    if (baseUrl) {
      matched.push(baseUrl);
    } else {
      unmatched.push(cell);
    }
  }

  return { matched, unmatched };
}
