function normalize(title: string): string {
  return title
    .toLowerCase()
    // Punctuation becomes a space, not empty — otherwise hyphenated words
    // collapse together ("Spreadsheet-to-Integrated" -> "spreadsheettointegrated")
    // and fail to match a differently-punctuated near-duplicate.
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Cheap programmatic safety net on top of the "don't repeat these" instruction
// given to Claude — pure TypeScript, so it can't be talked around by injected
// content in the gathered signal. Catches exact and near-identical titles
// (ignoring case/punctuation/whitespace); not fuzzy semantic matching.
export function isDuplicateTitle(candidate: string, existingTitles: string[]): boolean {
  const normalizedCandidate = normalize(candidate)
  return existingTitles.some((existing) => normalize(existing) === normalizedCandidate)
}
