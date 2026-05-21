import React, { useMemo } from 'react';
import { DOCUMENT_STATUSES } from '../../constants/index.js';
import { COLORS, SPACING, STATUS_MIX_ARCHIVE } from '../../constants/uiConstants.js';
import { filterFilesByDateRange } from '../../utils/dateRangeFilter.js';
import DashboardActivityLineChart from './DashboardActivityLineChart.jsx';
import { buildDailyDocumentCounts } from '../../utils/buildDailyDocumentCounts.js';
import { KPI_CARD_FLEX } from './dashboardKpi.js';
import { DASHBOARD_STAT_ICONS } from './dashboardStatIcons.jsx';
import { DashboardSimpleStatCard, DashboardInsightRow } from './dashboardShared.jsx';

// --- Helpers ---
const toDate = (d) => (d ? new Date(d) : null);

const isWithinDays = (date, days) => {
  if (!date) return false;
  const d = toDate(date);
  if (!d || isNaN(d.getTime())) return false;
  const cut = new Date();
  cut.setDate(cut.getDate() - days);
  return d >= cut;
};

const isToday = (date) => {
  if (!date) return false;
  const d = toDate(date);
  if (!d || isNaN(d.getTime())) return false;
  const today = new Date();
  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
};

/**
 * Department dashboard — KPI cards, insights, list panels.
 * Date filters share state with the documents view (same `added` / `created` rules as the list).
 */
function DashboardView({
  files,
  /** Filed-in-drawer archive rows (same shape as `files`); not included in main `files`. */
  archiveFiles = [],
  avgProcessingTimeLabel,
  dashboardStats,
  onStatClick,
  dateFrom = '',
  dateTo = '',
  onDateFromChange,
  onDateToChange,
}) {
  const hasDateFilter = !!(dateFrom || dateTo);

  const filteredFiles = useMemo(
    () => filterFilesByDateRange(files, dateFrom, dateTo),
    [files, dateFrom, dateTo]
  );

  const filteredArchiveFiles = useMemo(
    () => filterFilesByDateRange(archiveFiles, dateFrom, dateTo),
    [archiveFiles, dateFrom, dateTo]
  );

  /** Archiving uses the Paperless "Archiving" custom field (`markedForArchiving`), not Document Status. */
  const markedForArchiving = (f) => f.markedForArchiving === true;
  const underReview = filteredFiles.filter((f) => !markedForArchiving(f) && f.status === DOCUMENT_STATUSES.UNDER_REVIEW);
  const needsAction = filteredFiles.filter((f) => !markedForArchiving(f) && f.status === DOCUMENT_STATUSES.NEEDS_ACTION);
  const approved = filteredFiles.filter((f) => !markedForArchiving(f) && f.status === DOCUMENT_STATUSES.APPROVED);
  const rejected = filteredFiles.filter((f) => !markedForArchiving(f) && f.status === DOCUMENT_STATUSES.REJECTED);
  const forArchiving = filteredFiles.filter(markedForArchiving);
  /** Filed in an archive drawer (listed on Archive view), not on main Documents list. */
  const archived = filteredArchiveFiles.filter((f) => f.archiveDrawerId != null || f.archiveReference);
  const atOfficeCountFromStatuses =
    underReview.length +
    needsAction.length +
    approved.length +
    rejected.length +
    forArchiving.length +
    archived.length;

  const atOfficeFromApi = dashboardStats?.at_office_count ?? 0;
  const inTransitFromApi = dashboardStats?.in_transit_released_count ?? 0;
  const atOfficeCount = hasDateFilter
    ? atOfficeCountFromStatuses
    : dashboardStats != null
      ? atOfficeFromApi
      : Math.max(atOfficeFromApi, files.length + archiveFiles.length);
  const inTransitCount = inTransitFromApi;
  const cumulativeOriginated = dashboardStats?.cumulative_originated_count ?? 0;
  const receivedStillWithUs = dashboardStats?.received_still_with_us_count ?? 0;
  const currentWorkload = atOfficeCount + inTransitCount;
  const formulaTotal = cumulativeOriginated + receivedStillWithUs;
  const totalDocuments = hasDateFilter
    ? filteredFiles.length + filteredArchiveFiles.length
    : dashboardStats != null
      ? (formulaTotal > 0 ? formulaTotal : currentWorkload)
      : currentWorkload;
  const atOtherOffices = Math.max(0, totalDocuments - atOfficeCount - inTransitCount);

  const activityToday = hasDateFilter
    ? filteredFiles.filter((f) => isToday(f.added || f.created)).length
    : (dashboardStats?.activity_today ?? files.filter((f) => isToday(f.added || f.created)).length);
  const activityThisWeek = hasDateFilter
    ? filteredFiles.filter((f) => isWithinDays(f.added || f.created, 7)).length
    : (dashboardStats?.activity_this_week ?? files.filter((f) => isWithinDays(f.added || f.created, 7)).length);
  const activityThisMonth = hasDateFilter
    ? filteredFiles.filter((f) => isWithinDays(f.added || f.created, 30)).length
    : (dashboardStats?.activity_this_month ?? files.filter((f) => isWithinDays(f.added || f.created, 30)).length);
  const needsAttention = underReview.length + needsAction.length;

  const dailyActivitySeries = useMemo(() => {
    if (hasDateFilter) {
      return buildDailyDocumentCounts(filteredFiles, {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        numDays: 30,
      });
    }
    return buildDailyDocumentCounts(files, 30);
  }, [files, filteredFiles, hasDateFilter, dateFrom, dateTo]);

  const pct = (n) => (atOfficeCount > 0 ? Math.round((n / atOfficeCount) * 100) : 0);

  const insightWorkload = hasDateFilter
    ? `${filteredFiles.length + filteredArchiveFiles.length} in date range · ${inTransitCount} in transit (office-wide)`
    : atOtherOffices > 0
      ? `${atOfficeCount} at office · ${inTransitCount} in transit · ${atOtherOffices} elsewhere`
      : `${atOfficeCount} at office · ${inTransitCount} in transit`;

  const chartSubtitle = hasDateFilter
    ? `Daily count for the selected range (${dateFrom || 'start'} → ${dateTo || 'today'}) · loaded documents only`
    : 'Daily count for the last 30 days (based on documents currently loaded)';

  const clearDateFilter = () => {
    onDateFromChange?.('');
    onDateToChange?.('');
  };

  return (
    <div
      style={{
        flex: 1,
        alignSelf: 'stretch',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        margin: 0,
        padding: `${SPACING.SM} ${SPACING.LG} ${SPACING.XL}`,
        boxSizing: 'border-box',
        background: 'transparent',
      }}
    >
      {/* Header — Paperless-ngx style: h3 + smaller fw-normal welcome line (block mobile, inline md+) */}
      <div style={{ marginBottom: 28, width: '100%', minWidth: 0 }}>
        <h3 className="dashboard-paperless-h3">
          Dashboard{' '}
          <span className="dashboard-paperless-sub">
            Monitor document volume, routing, status mix, and office activity for your department.
          </span>
        </h3>
      </div>

      {/* KPI row */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <DashboardSimpleStatCard
          style={KPI_CARD_FLEX}
          label={hasDateFilter ? 'In range' : 'Total documents'}
          value={totalDocuments}
          icon={DASHBOARD_STAT_ICONS.docs}
          onClick={onStatClick ? () => onStatClick(null) : undefined}
        />
        <DashboardSimpleStatCard
          style={KPI_CARD_FLEX}
          label="At office"
          value={atOfficeCount}
          icon={DASHBOARD_STAT_ICONS.office}
          onClick={onStatClick ? () => onStatClick(null) : undefined}
        />
        <DashboardSimpleStatCard style={KPI_CARD_FLEX} label="In transit" value={inTransitCount} icon={DASHBOARD_STAT_ICONS.transit} />
        <DashboardSimpleStatCard style={KPI_CARD_FLEX} label="Needs attention" value={needsAttention} icon={DASHBOARD_STAT_ICONS.alert} />
        <DashboardSimpleStatCard style={KPI_CARD_FLEX} label="Added today" value={activityToday} icon={DASHBOARD_STAT_ICONS.calendar} />
        <DashboardSimpleStatCard style={KPI_CARD_FLEX} label="Added this week" value={activityThisWeek} icon={DASHBOARD_STAT_ICONS.calendar} />
        <DashboardSimpleStatCard
          style={KPI_CARD_FLEX}
          label={hasDateFilter ? 'Last 30 days' : 'Added this month'}
          value={activityThisMonth}
          icon={DASHBOARD_STAT_ICONS.calendar}
        />
      </div>

      {/* Middle: chart area + insights */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          marginBottom: 24,
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            flex: '1 1 420px',
            background: COLORS.WHITE,
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
            padding: 20,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Status mix — at office</div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.45 }}>
              For Archiving follows the archiving custom field (not Document Status). Archived counts documents filed in a drawer (Archive list). Under Review through Rejected exclude items marked for archiving to avoid double-counting.
            </div>
          </div>

          {atOfficeCount > 0 ? (
            <>
              <div style={{ display: 'flex', height: 18, borderRadius: 999, overflow: 'hidden', background: '#e2e8f0' }}>
                <div style={{ width: `${pct(underReview.length)}%`, minWidth: 0, background: '#eab308' }} title="Under Review" />
                <div style={{ width: `${pct(needsAction.length)}%`, minWidth: 0, background: '#0e7490' }} title="Needs Action" />
                <div style={{ width: `${pct(approved.length)}%`, minWidth: 0, background: '#059669' }} title="Approved" />
                <div style={{ width: `${pct(rejected.length)}%`, minWidth: 0, background: '#dc2626' }} title="Rejected" />
                <div style={{ width: `${pct(forArchiving.length)}%`, minWidth: 0, background: STATUS_MIX_ARCHIVE.FOR_ARCHIVING_BAR }} title="For Archiving" />
                <div style={{ width: `${pct(archived.length)}%`, minWidth: 0, background: STATUS_MIX_ARCHIVE.ARCHIVED_BAR }} title="Archived" />
              </div>
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: '#fafbfc',
                }}
              >
                {[
                  { name: 'Under Review', n: underReview.length, color: '#eab308' },
                  { name: 'Needs Action', n: needsAction.length, color: '#0e7490' },
                  { name: 'Approved', n: approved.length, color: '#059669' },
                  { name: 'Rejected', n: rejected.length, color: '#dc2626' },
                  { name: 'For Archiving', n: forArchiving.length, color: STATUS_MIX_ARCHIVE.FOR_ARCHIVING_BAR },
                  { name: 'Archived', n: archived.length, color: STATUS_MIX_ARCHIVE.ARCHIVED_BAR },
                ].map((row, i) => (
                  <div
                    key={row.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '11px 14px',
                      borderTop: i > 0 ? '1px solid #e2e8f0' : 'none',
                      background: COLORS.WHITE,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: row.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#334155' }}>{row.name}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexShrink: 0 }}>
                      <strong style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                        {row.n}
                      </strong>
                      <span style={{ fontSize: 13, color: '#94a3b8', fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'right' }}>
                        {pct(row.n)}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: '#94a3b8' }}>No documents at this office to show status mix.</p>
          )}
        </div>

        <div style={{ flex: '0 1 300px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <DashboardInsightRow label="Current workload" value={insightWorkload} />
          <DashboardInsightRow
            label="Received (all time)"
            value={hasDateFilter ? '— (office-wide)' : String(dashboardStats?.cumulative_received_count ?? 0)}
          />
          <DashboardInsightRow
            label="Originated (all time)"
            value={hasDateFilter ? '— (office-wide)' : String(dashboardStats?.cumulative_originated_count ?? 0)}
          />
          <DashboardInsightRow
            label="Avg processing time"
            value={hasDateFilter ? '— (office-wide)' : (avgProcessingTimeLabel ?? '—')}
          />
        </div>
      </div>

      {/* Activity trend — line chart; date range controls live here */}
      <div
        style={{
          background: COLORS.WHITE,
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
          padding: 20,
          marginBottom: 24,
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 8,
          }}
        >
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Documents added over time</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{chartSubtitle}</div>
          </div>
          {onDateFromChange && onDateToChange && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: 10,
                padding: '10px 12px',
                background: '#f8fafc',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
              }}
            >
              <div>
                <label htmlFor="dash-date-from" style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  From
                </label>
                <input
                  id="dash-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => onDateFromChange(e.target.value)}
                  max={dateTo || undefined}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    color: '#0f172a',
                    fontFamily: 'inherit',
                    background: COLORS.WHITE,
                  }}
                />
              </div>
              <div>
                <label htmlFor="dash-date-to" style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  To
                </label>
                <input
                  id="dash-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => onDateToChange(e.target.value)}
                  min={dateFrom || undefined}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    color: '#0f172a',
                    fontFamily: 'inherit',
                    background: COLORS.WHITE,
                  }}
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={clearDateFilter}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: COLORS.WHITE,
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
        {hasDateFilter && (
          <p style={{ margin: '0 0 14px', fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
            Chart and summary use each document’s <strong>added</strong> date. Same range as the document list. In transit and cumulative server totals stay office-wide.
          </p>
        )}
        <DashboardActivityLineChart data={dailyActivitySeries} />
      </div>
    </div>
  );
}

export default DashboardView;
