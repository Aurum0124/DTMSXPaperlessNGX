import React from 'react';
import { STATUS_MIX_ARCHIVE } from '../../constants/uiConstants.js';

function StatusBadge({ status, variant = 'default', showNeedsActionBadge = true }) {
  if (status === 'Needs Action' && !showNeedsActionBadge) {
    return null;
  }
  const getStatusConfig = (status) => {
    switch (status) {
      case 'Needs Action':
        return { color: '#0c5460', bg: '#d1ecf1' };
      case 'Approved':
      case 'Action Taken':
        return { color: '#155724', bg: '#d4edda' };
      case 'Rejected':
        return { color: '#a71d2a', bg: '#f8d7da' };
      case 'For Archiving':
        return { color: STATUS_MIX_ARCHIVE.FOR_ARCHIVING_BADGE_FG, bg: STATUS_MIX_ARCHIVE.FOR_ARCHIVING_BADGE_BG };
      case 'Archived':
        return { color: STATUS_MIX_ARCHIVE.ARCHIVED_BADGE_FG, bg: STATUS_MIX_ARCHIVE.ARCHIVED_BADGE_BG };
      case 'Under Review':
      default:
        return { color: '#856404', bg: '#fff3cd' };
    }
  };
  const config = getStatusConfig(status);
  const isCard = variant === 'card';
  return (
    <span style={{
      padding: isCard ? '5px 10px' : '2px 5px',
      borderRadius: isCard ? 6 : 4,
      fontSize: isCard ? 11 : 9,
      fontWeight: 600,
      color: config.color,
      backgroundColor: config.bg,
      letterSpacing: '0.02em',
    }}>
      {status}
    </span>
  );
}

export default StatusBadge; 