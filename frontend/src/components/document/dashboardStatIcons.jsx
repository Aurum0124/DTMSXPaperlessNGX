import React from 'react';

const statIconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const DASHBOARD_STAT_ICONS = {
  docs: (
    <svg {...statIconProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  ),
  office: (
    <svg {...statIconProps}>
      <path d="M3 21h18" />
      <path d="M5 21V10l7-4 7 4v11" />
      <path d="M9 21v-5h6v5" />
    </svg>
  ),
  transit: (
    <svg {...statIconProps}>
      <path d="M1 12h11v6H1z" />
      <path d="M12 15h3l3 3v3H12" />
      <circle cx="5.5" cy="19.5" r="1.75" fill="none" />
      <circle cx="18.5" cy="19.5" r="1.75" fill="none" />
    </svg>
  ),
  alert: (
    <svg {...statIconProps}>
      <path d="M12 3 2 19h20L12 3z" />
      <path d="M12 9v5M12 16h.01" />
    </svg>
  ),
  calendar: (
    <svg {...statIconProps}>
      <rect x="3" y="4" width="18" height="18" rx="2" fill="none" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
};
