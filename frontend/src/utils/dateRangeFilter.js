/**
 * Client-side date range for document `added` / `created` (same rules as useSearchState).
 * @param {string} docDate - ISO or parseable date string
 * @param {string} dateFrom - yyyy-mm-dd or ''
 * @param {string} dateTo - yyyy-mm-dd or ''
 */
export function documentMatchesDateRange(docDate, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  if (!docDate) return false;
  const d = new Date(docDate);
  if (isNaN(d.getTime())) return false;
  const dayStart = (y, m, day) => new Date(y, m, day).getTime();
  const docDay = dayStart(d.getFullYear(), d.getMonth(), d.getDate());
  if (dateFrom) {
    const [y, m, day] = dateFrom.split('-').map(Number);
    if (docDay < dayStart(y, m - 1, day)) return false;
  }
  if (dateTo) {
    const [y, m, day] = dateTo.split('-').map(Number);
    if (docDay > dayStart(y, m - 1, day)) return false;
  }
  return true;
}

export function filterFilesByDateRange(files, dateFrom, dateTo) {
  if (!Array.isArray(files)) return [];
  if (!dateFrom && !dateTo) return files;
  return files.filter((doc) => documentMatchesDateRange(doc.added || doc.created, dateFrom, dateTo));
}
