import React from 'react';
import { StatusBadge, ArchiveStateBadges, UntrackedBadge } from '../index.js';
import { COLORS, BORDER_RADIUS, SHADOWS, TRANSITIONS } from '../../../constants/index.js';
import { formatDocumentDate } from '../../../utils/formatDocumentDate.js';

function renderCopyStateBadge(copyState) {
  const v = String(copyState ?? '').trim();
  if (!v) return null;
  const isDigitalPending = v.toLowerCase().includes('digital') && v.toLowerCase().includes('pending');
  return (
    <span
      style={{
        padding: '5px 10px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        color: isDigitalPending ? '#1e3a8a' : '#495057',
        backgroundColor: isDigitalPending ? '#dbeafe' : '#e9ecef',
        letterSpacing: '0.02em',
      }}
      title="Document copy state"
    >
      {v}
    </span>
  );
}

/**
 * DocumentCard Component
 *
 * Matches Paperless-ngx small card: doc-img-container, card-body bg-light, card-footer with icon buttons.
 */
function DocumentCard({
  document: f,
  index: i,
  hoveredCard,
  imgLoading,
  imgErrors,
  onHoverCard,
  onViewDocument,
  onImageLoad,
  onImageError,
  onImageLoadStart,
  getFileTypeIcon
}) {
  return (
    <div
      key={i}
      style={{
        position: 'relative',
        zIndex: hoveredCard === i ? 5 : 1,
        backgroundColor: COLORS.BG_PRIMARY,
        border: `1px solid ${COLORS.BORDER_LIGHT}`,
        borderRadius: BORDER_RADIUS.LG,
        boxShadow: hoveredCard === i ? SHADOWS.CARD_HOVER : SHADOWS.CARD,
        overflow: 'hidden',
        cursor: 'pointer',
        width: '100%',
        minWidth: 0,
        height: '100%',
        minHeight: 280,
        display: 'flex',
        flexDirection: 'column',
        transform: hoveredCard === i ? 'translateY(-4px)' : 'translateY(0)',
        transition: `box-shadow ${TRANSITIONS.NORMAL}, transform ${TRANSITIONS.NORMAL}`,
      }}
      onMouseEnter={() => onHoverCard(i)}
      onMouseLeave={() => onHoverCard(null)}
      onClick={() => onViewDocument(f)}
    >
      {/* doc-img-container - Paperless */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1',
          minHeight: 180,
          background: COLORS.BG_SECONDARY,
          overflow: 'hidden',
          borderBottom: `1px solid ${COLORS.BORDER_LIGHT}`,
          borderTopLeftRadius: BORDER_RADIUS.LG,
          borderTopRightRadius: BORDER_RADIUS.LG,
        }}
      >
        {imgLoading[f.id] && !imgErrors[f.id] && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" style={{ width: 28, height: 28, border: `2px solid ${COLORS.BORDER_LIGHT}`, borderTopColor: COLORS.PRIMARY, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}
        {!imgErrors[f.id] && (
          <img
            src={`/api/thumb/${f.id}`}
            alt={f.title}
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'top left',
              display: imgLoading[f.id] ? 'none' : 'block',
            }}
            onLoad={() => onImageLoad(f.id, false)}
            onError={() => { onImageError(f.id, true); onImageLoad(f.id, false); }}
            onLoadStart={() => onImageLoadStart(f.id, true)}
          />
        )}
        {imgErrors[f.id] && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.TEXT_LIGHT, fontSize: 36 }}>
            {getFileTypeIcon(f.title || f.filename || '')}
          </div>
        )}
        <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <StatusBadge status={f.status} variant="card" showNeedsActionBadge={f.showNeedsActionBadge !== false} />
          <ArchiveStateBadges
            markedForArchiving={f.markedForArchiving}
            archiveDrawerName={f.archiveDrawerName}
            archiveFolderName={f.archiveFolderName}
            archiveReference={f.archiveReference}
            variant="card"
          />
          {f.isUntrackedPublic ? <UntrackedBadge variant="card" /> : null}
          {(f.documentTypeBadgePending || (f.documentTypeName && f.documentTypeName !== '—')) && (
            <span
              title={f.documentTypeBadgePending ? 'Loading document type…' : undefined}
              aria-busy={f.documentTypeBadgePending ? true : undefined}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                color: '#495057',
                backgroundColor: '#e9ecef',
                letterSpacing: '0.02em',
                opacity: f.documentTypeBadgePending ? 0.72 : 1,
              }}
            >
              {f.documentTypeBadgePending ? '…' : f.documentTypeName}
            </span>
          )}
          {renderCopyStateBadge(f.copyState)}
        </div>
      </div>

      {/* card-footer - title, tracking code, date, pages */}
      <div style={{
        padding: '10px 12px',
        borderTop: `1px solid ${COLORS.BORDER_LIGHT}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: COLORS.TEXT_PRIMARY,
          lineHeight: 1.35,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'break-word',
        }}>
          {f.title || f.filename || 'Untitled'}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.TEXT_PRIMARY }}>{f.trackingCode || '—'}</div>
        {(f.added || f.created) && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: COLORS.TEXT_MUTED }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
              <path d="M11 6.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1z" />
              <path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4H1z" />
            </svg>
            <span>{formatDocumentDate(f.added || f.created)}</span>
          </span>
        )}
        {f.pageCount != null && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: COLORS.TEXT_MUTED }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
              <path d="M13 0H6a2 2 0 0 0-2 2 2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2 2 2 0 0 0 2-2V2a2 2 0 0 0-2-2m0 13V4a2 2 0 0 0-2-2H5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1M3 4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
            </svg>
            <span>{f.pageCount} {f.pageCount === 1 ? 'page' : 'pages'}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export default DocumentCard; 