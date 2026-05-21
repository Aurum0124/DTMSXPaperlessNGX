import React from 'react';
import { STATUS_MIX_ARCHIVE } from '../../constants/uiConstants.js';

/**
 * Shows physical-archive workflow labels: pending "For Archiving" vs filed "Archived" (drawer assigned).
 * Timestamp ("Archived at") lives in the document viewer Status panel only — not here.
 */
function ArchiveStateBadges({
  markedForArchiving,
  archiveDrawerName,
  archiveFolderName,
  archiveReference,
  variant = 'default',
}) {
  const locationLabel = archiveFolderName || archiveDrawerName;
  const archived = Boolean(archiveReference || locationLabel);
  const forArchiving = Boolean(markedForArchiving) && !archived;
  if (!forArchiving && !archived) return null;

  const isCard = variant === 'card';
  const pill = (label, color, bg, title) => (
    <span
      key={label}
      title={title || undefined}
      style={{
        padding: isCard ? '5px 10px' : '2px 8px',
        borderRadius: isCard ? 6 : 4,
        fontSize: isCard ? 11 : 9,
        fontWeight: 600,
        color,
        backgroundColor: bg,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );

  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {forArchiving &&
        pill(
          'For Archiving',
          STATUS_MIX_ARCHIVE.FOR_ARCHIVING_BADGE_FG,
          STATUS_MIX_ARCHIVE.FOR_ARCHIVING_BADGE_BG,
          'Marked for physical archive; choose a drawer when archiving'
        )}
      {archived &&
        pill(
          'Archived',
          STATUS_MIX_ARCHIVE.ARCHIVED_BADGE_FG,
          STATUS_MIX_ARCHIVE.ARCHIVED_BADGE_BG,
          [archiveReference, locationLabel].filter(Boolean).join(' · ') || 'Filed in archive'
        )}
    </span>
  );
}

export default ArchiveStateBadges;
