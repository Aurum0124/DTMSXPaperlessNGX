import React from 'react';
import { COLORS } from '../../constants/uiConstants.js';

export function DashboardSimpleStatCard({ label, value, icon, onClick, style: styleProp }) {
  const Wrapper = onClick ? 'button' : 'div';
  const base = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '14px 16px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: COLORS.WHITE,
    textAlign: 'left',
    font: 'inherit',
    width: '100%',
    minWidth: 0,
    minHeight: 0,
    boxSizing: 'border-box',
    cursor: onClick ? 'pointer' : 'default',
    transition: 'background-color 0.15s ease',
  };
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      style={{ ...base, ...(styleProp || {}) }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.backgroundColor = '#f8fafc';
      }}
      onMouseLeave={(e) => {
        if (onClick) e.currentTarget.style.backgroundColor = COLORS.WHITE;
      }}
    >
      <span style={{ flexShrink: 0, color: '#94a3b8', marginTop: 2 }} aria-hidden>
        {icon}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: 4,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: '#0f172a',
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
          }}
        >
          {value}
        </div>
      </div>
    </Wrapper>
  );
}

export function DashboardInsightRow({ label, value }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        background: '#f8fafc',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{value}</div>
    </div>
  );
}
