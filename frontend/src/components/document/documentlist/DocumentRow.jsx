import React from 'react';
import { StatusBadge, ArchiveStateBadges, UntrackedBadge } from '../index.js';
import { COLORS, BORDER_RADIUS } from '../../../constants/index.js';
import { formatDocumentDate } from '../../../utils/formatDocumentDate.js';
import { PageIcon, CalendarIcon } from './documentMeta.jsx';

function renderCopyStateBadge(copyState) {
  const v = String(copyState ?? '').trim();
  if (!v) return null;
  const isDigitalPending = v.toLowerCase().includes('digital') && v.toLowerCase().includes('pending');
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        color: isDigitalPending ? '#1e3a8a' : '#495057',
        backgroundColor: isDigitalPending ? '#dbeafe' : '#e9ecef',
        letterSpacing: '0.01em',
      }}
      title="Document copy state"
    >
      {v}
    </span>
  );
}

/** Cap OCR/content length for list DOM (Paperless still returns full `content` on list in many setups). */
const ONELINE_CONTENT_MAX_CHARS = 2400;
/** Fixed one-liner card row height (px) — body content is clamped inside this. */
const ONELINE_CARD_HEIGHT_PX = 168;
/** Lines of extracted text below the title (within fixed card height). */
const ONELINE_CONTENT_LINE_CLAMP = 4;

function getOnelineContentPreview(content) {
  const raw = typeof content === 'string' ? content.trim() : '';
  if (!raw) return '';
  if (raw.length <= ONELINE_CONTENT_MAX_CHARS) return raw;
  return `${raw.slice(0, ONELINE_CONTENT_MAX_CHARS)}…`;
}

/**
 * DocumentRow Component
 *
 * Paperless-ngx style: thumbnail + title row (oneline) or compact list row.
 */

function DocumentRow({
  document: f,
  index: i,
  viewType,
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
  if (viewType === 'oneline') {
    const title = f.title || f.trackingCode || '—';
    const documentTypeName = f.documentTypeBadgePending ? '…' : (f.documentTypeName ?? '—');
    const hasSecondaryTitle = Boolean(f.title && f.trackingCode !== f.title && f.title !== 'No tracking code');
    const contentPreview = getOnelineContentPreview(f.content);
    return (
      <div
        key={i}
        style={{
          display: 'flex',
          alignItems: 'stretch',
          minHeight: ONELINE_CARD_HEIGHT_PX,
          maxHeight: ONELINE_CARD_HEIGHT_PX,
          height: ONELINE_CARD_HEIGHT_PX,
          background: hoveredCard === i ? '#f8fafc' : COLORS.BG_PRIMARY,
          border: `1px solid ${hoveredCard === i ? COLORS.BORDER_MEDIUM : COLORS.BORDER_LIGHT}`,
          borderRadius: BORDER_RADIUS.LG,
          boxShadow: hoveredCard === i ? '0 2px 8px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.05)',
          cursor: 'pointer',
          width: '100%',
          minWidth: 0,
          transition: 'box-shadow 0.15s, border-color 0.15s, background 0.15s',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
        onMouseEnter={() => onHoverCard(i)}
        onMouseLeave={() => onHoverCard(null)}
        onClick={() => onViewDocument(f)}
      >
        {/* Thumbnail - left */}
        <div style={{
          width: 140,
          minWidth: 140,
          flexShrink: 0,
          borderRight: `1px solid ${COLORS.BORDER_LIGHT}`,
          borderRadius: `${BORDER_RADIUS.LG}px 0 0 ${BORDER_RADIUS.LG}px`,
          overflow: 'hidden',
          background: COLORS.BG_SECONDARY,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {imgLoading[f.id] && !imgErrors[f.id] && (
            <div className="spinner" style={{
              width: '28px', height: '28px',
              border: '3px solid #e3e7ef',
              borderTop: '3px solid #2a5196',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          )}
          {!imgErrors[f.id] && (
            <img
              src={`/api/thumb/${f.id}`}
              alt=""
              loading="lazy"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: imgLoading[f.id] ? 'none' : 'block',
              }}
              onLoad={() => onImageLoad(f.id, false)}
              onError={() => { onImageError(f.id, true); onImageLoad(f.id, false); }}
              onLoadStart={() => onImageLoadStart(f.id, true)}
            />
          )}
          {imgErrors[f.id] && (
            <div style={{ color: '#bfc4d1', fontSize: 24 }}>{getFileTypeIcon(f.title || f.filename || '')}</div>
          )}
        </div>
        {/* Card body — Paperless large card: title → content excerpt → tracking + meta */}
        <div style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          padding: '12px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          background: hoveredCard === i ? '#f8fafc' : '#f8f9fa',
          borderLeft: 'none',
        }}>
          {/* Title + status (card-title row) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
            <h5 style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 600,
              color: COLORS.TEXT_PRIMARY,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: '1 1 200px',
              minWidth: 0,
            }}>
              {hasSecondaryTitle
                ? f.title
                : (f.trackingCode && f.trackingCode !== 'No tracking code' ? f.trackingCode : title)}
            </h5>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
              <StatusBadge status={f.status} showNeedsActionBadge={f.showNeedsActionBadge !== false} />
              <ArchiveStateBadges markedForArchiving={f.markedForArchiving} archiveDrawerName={f.archiveDrawerName} archiveFolderName={f.archiveFolderName} archiveReference={f.archiveReference} />
              {f.isUntrackedPublic ? <UntrackedBadge /> : null}
              {renderCopyStateBadge(f.copyState)}
            </div>
          </div>
          {/* Extracted text — multiple lines under title; clamped so row stays fixed height */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <p
              className="document-oneline-content"
              title={contentPreview ? contentPreview.slice(0, 800) : undefined}
              style={{
                margin: 0,
                width: '100%',
                minWidth: 0,
                fontSize: 13,
                lineHeight: 1.45,
                color: '#5c636a',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: ONELINE_CONTENT_LINE_CLAMP,
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              }}
            >
              {contentPreview || 'No extracted text yet.'}
            </p>
          </div>
          {/* Tracking + type / date / pages */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              width: '100%',
              minWidth: 0,
              flexShrink: 0,
            }}
          >
            {hasSecondaryTitle ? (
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  color: COLORS.TEXT_MUTED,
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  flex: '1 1 140px',
                  minWidth: 0,
                }}
              >
                {f.trackingCode && f.trackingCode !== 'No tracking code' ? f.trackingCode : '—'}
              </p>
            ) : (
              <span style={{ flex: '1 1 auto', minWidth: 0 }} aria-hidden />
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 14,
                rowGap: 8,
                flexShrink: 0,
                maxWidth: '100%',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 14,
                  color: COLORS.TEXT_MUTED,
                  flexShrink: 0,
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z" /></svg>
                {documentTypeName}
              </span>
              {(f.added || f.created) && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 14,
                    color: COLORS.TEXT_MUTED,
                    flexShrink: 0,
                  }}
                >
                  <CalendarIcon />
                  {formatDocumentDate(f.added || f.created)}
                </span>
              )}
              {f.pageCount != null && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 14,
                    color: COLORS.TEXT_MUTED,
                    flexShrink: 0,
                  }}
                >
                  <PageIcon />
                  {f.pageCount} {f.pageCount === 1 ? 'page' : 'pages'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List view (grid card) - one row per info
  const listRow = (label, content) => (
    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 22 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: COLORS.TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: 70 }}>{label}</span>
      <span style={{ fontSize: 12, color: COLORS.TEXT_PRIMARY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{content}</span>
    </div>
  );

  return (
    <div
      key={i}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        background: COLORS.BG_PRIMARY,
        border: `1px solid ${hoveredCard === i ? COLORS.BORDER_MEDIUM : COLORS.BORDER_LIGHT}`,
        borderRadius: BORDER_RADIUS.MD,
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        padding: '10px 12px',
        cursor: 'pointer',
        width: '100%',
        minWidth: 0,
        transition: 'box-shadow 0.15s, border-color 0.15s',
        boxSizing: 'border-box',
      }}
      onMouseEnter={() => onHoverCard(i)}
      onMouseLeave={() => onHoverCard(null)}
    >
      {listRow('Tracking', f.trackingCode || '—')}
      {listRow('Status', (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <StatusBadge status={f.status} showNeedsActionBadge={f.showNeedsActionBadge !== false} />
          <ArchiveStateBadges markedForArchiving={f.markedForArchiving} archiveDrawerName={f.archiveDrawerName} archiveFolderName={f.archiveFolderName} archiveReference={f.archiveReference} />
          {f.isUntrackedPublic ? <UntrackedBadge /> : null}
          {renderCopyStateBadge(f.copyState)}
        </span>
      ))}
      {f.pageCount != null && listRow('Pages', (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <PageIcon pageCount={f.pageCount} />
          {f.pageCount} {f.pageCount === 1 ? 'page' : 'pages'}
        </span>
      ))}
      {(f.added || f.created) && listRow('Date', (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <CalendarIcon />
          {formatDocumentDate(f.added || f.created)}
        </span>
      ))}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
        <button
          style={{
            padding: '6px 12px',
            fontSize: 12,
            backgroundColor: '#28a745',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '500',
          }}
          onClick={() => onViewDocument(f)}
        >View</button>
      </div>
    </div>
  );
}

export default DocumentRow; 