import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { COLORS } from '../../constants/uiConstants.js';

const tooltipStyle = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
};

function ChartTooltip({ active, payload, label, countDescription }) {
  if (!active || !payload?.length) return null;
  const firstPayload = payload[0];
  const countRaw = firstPayload?.payload?.count ?? firstPayload?.value;
  const v = Number.isFinite(Number(countRaw)) ? Number(countRaw) : 0;
  const safeLabel = String(
    label || firstPayload?.payload?.label || firstPayload?.payload?.date || ''
  ).trim();
  if (!safeLabel) return null;
  const line2 =
    typeof countDescription === 'function'
      ? countDescription(v)
      : `${v} ${v === 1 ? 'document' : 'documents'} added`;
  return (
    <div style={tooltipStyle}>
      <div style={{ fontWeight: 600, color: '#0f172a' }}>{safeLabel}</div>
      <div style={{ color: '#64748b', marginTop: 2 }}>{line2}</div>
    </div>
  );
}

/**
 * Line chart for daily document additions (analytics-style).
 * When there are many days, X-axis skips labels (preserveStartEnd); per-day dots are hidden
 * so you do not see a circle with no date beneath it. Hover still shows date + count.
 */
export default function DashboardActivityLineChart({ data, countDescription }) {
  const safeData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data
      .filter((d) => d && (d.label || d.date))
      .map((d) => ({
        ...d,
        label: d.label || d.date || '',
        count: Number.isFinite(Number(d.count)) ? Number(d.count) : 0,
      }));
  }, [data]);

  const hasData = safeData.length > 0;
  const n = safeData.length;

  /** One X tick per point so every visible dot has a date below it. */
  const labelEveryPoint = n > 0 && n <= 45;
  /** Original chart: line only + hover when ticks are sparse (no orphan dots). */
  const showPerDayDots = labelEveryPoint;

  if (!hasData) {
    return (
      <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', padding: '24px 0' }}>
        No timeline data yet.
      </p>
    );
  }

  const bottomMargin = labelEveryPoint ? (n > 14 ? 52 : 8) : 4;
  const tickAngle = labelEveryPoint && n > 14 ? -35 : 0;
  const tickFontSize = labelEveryPoint && n > 14 ? 9 : 10;

  return (
    <div style={{ width: '100%', height: 260, contain: 'layout style' }}>
      <ResponsiveContainer width="100%" height="100%" debounce={280}>
        <LineChart data={safeData} margin={{ top: 8, right: 12, left: 4, bottom: bottomMargin }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{
              fontSize: tickFontSize,
              fill: '#64748b',
              ...(tickAngle ? { angle: tickAngle, textAnchor: 'end', dy: tickAngle ? 8 : 0 } : {}),
            }}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
            interval={labelEveryPoint ? 0 : 'preserveStartEnd'}
            minTickGap={labelEveryPoint ? 0 : 8}
            tickFormatter={(v) => (v != null && v !== '' ? String(v) : '')}
          />
          <YAxis
            allowDecimals={false}
            domain={[0, (dataMax) => Math.max(dataMax, 1)]}
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
            width={36}
          />
          <Tooltip content={(props) => <ChartTooltip {...props} countDescription={countDescription} />} />
          <Line
            type="monotone"
            dataKey="count"
            name="Added"
            stroke={COLORS.PRIMARY}
            strokeWidth={2}
            dot={
              showPerDayDots
                ? { r: 3, fill: COLORS.PRIMARY, strokeWidth: 0 }
                : false
            }
            activeDot={{ r: 5, fill: COLORS.PRIMARY, stroke: '#fff', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
