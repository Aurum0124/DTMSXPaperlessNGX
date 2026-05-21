import React from 'react';
import { STATUS_PUBLIC_TRACKING } from '../../constants/uiConstants.js';

/**
 * Shown when a document is opted out of the public tracker (Laravel + optional Paperless "Public tracking" field).
 */
function UntrackedBadge({ variant = 'default' }) {
  const isCard = variant === 'card';
  return (
    <span
      title="Hidden from public tracker; staff lookup still works"
      style={{
        padding: isCard ? '5px 10px' : '2px 8px',
        borderRadius: isCard ? 6 : 4,
        fontSize: isCard ? 11 : 9,
        fontWeight: 600,
        color: STATUS_PUBLIC_TRACKING.UNTRACKED_BADGE_FG,
        backgroundColor: STATUS_PUBLIC_TRACKING.UNTRACKED_BADGE_BG,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      Untracked
    </span>
  );
}

export default UntrackedBadge;
