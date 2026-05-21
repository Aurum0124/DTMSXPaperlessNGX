function localDateKey(d) {
  const x = new Date(d);
  if (isNaN(x.getTime())) return null;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function shortLabel(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  const parts = String(yyyyMmDd).split('-');
  if (parts.length !== 3) return String(yyyyMmDd);
  const [y, m, d] = parts.map(Number);
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime())) return String(yyyyMmDd);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function parseLocalDay(yyyyMmDd) {
  const parts = String(yyyyMmDd).split('-');
  if (parts.length !== 3) return new Date(NaN);
  const [y, m, d] = parts.map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

const MAX_CHART_DAYS = 366;

/**
 * Daily counts by `added` or `created` (local calendar days).
 * @param {object} [options] - `{ numDays }` rolling window, or `{ dateFrom, dateTo }` (yyyy-mm-dd) for explicit range.
 * @param {number} [legacyNumDays] - If second arg is a number, same as `{ numDays: n }`.
 */
export function buildDailyDocumentCounts(files, options = {}) {
  const opts = typeof options === 'number' ? { numDays: options } : (options || {});
  const numDays = opts.numDays ?? 30;
  const { dateFrom, dateTo } = opts;

  const counts = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dateFrom || dateTo) {
    let startD;
    let endD;
    if (dateFrom && dateTo) {
      startD = parseLocalDay(dateFrom);
      endD = parseLocalDay(dateTo);
      if (endD < startD) [startD, endD] = [endD, startD];
    } else if (dateFrom) {
      startD = parseLocalDay(dateFrom);
      endD = new Date(today);
    } else {
      endD = parseLocalDay(dateTo);
      startD = new Date(endD);
      startD.setDate(startD.getDate() - (numDays - 1));
    }
    let iter = new Date(startD);
    let n = 0;
    while (iter <= endD && n < MAX_CHART_DAYS) {
      const key = localDateKey(iter);
      if (key) counts.set(key, 0);
      iter.setDate(iter.getDate() + 1);
      n++;
    }
  } else {
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = localDateKey(d);
      if (key) counts.set(key, 0);
    }
  }

  for (const f of files) {
    const raw = f.added || f.created;
    if (!raw) continue;
    const dt = new Date(raw);
    if (isNaN(dt.getTime())) continue;
    const key = localDateKey(dt);
    if (counts.has(key)) counts.set(key, counts.get(key) + 1);
  }
  return [...counts.entries()].map(([date, count]) => ({
    date,
    label: shortLabel(date) || String(date),
    count: Number.isFinite(count) ? count : Number(count) || 0,
  }));
}
