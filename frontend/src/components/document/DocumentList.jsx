import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { apiCall } from '../../services/api.js';
import { API_ENDPOINTS } from '../../constants/apiEndpoints.js';
import { VIEW_TYPES } from '../../constants/index.js';
import { DocumentCard, DocumentRow } from './documentlist/index.js';
import { StatusBadge, ArchiveStateBadges, UntrackedBadge } from './index.js';
import { formatDocumentDate } from '../../utils/formatDocumentDate.js';
import { PageIcon, CalendarIcon } from './documentlist/documentMeta.jsx';
import { COLORS, BORDER_RADIUS } from '../../constants/index.js';
import { SEARCH_TYPES } from '../../hooks/useSearchState.js';

const viewTransitionStyle = {
  animation: 'documentListViewFade 0.2s ease-out',
};

/**
 * DocumentList Component
 * 
 * Renders the list of documents in either grid or list view
 * Handles filtering, search, and document interactions
 */

function DocumentList({
  files,
  searchTerm,
  searchType = SEARCH_TYPES.TRACKING_CODE,
  trackingCodeSearch,
  statusFilter,
  copyStateFilter,
  documentTypeFilter,
  dateFrom,
  dateTo,
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
  const [documentTypes, setDocumentTypes] = useState([]);
  const [documentTypesReady, setDocumentTypesReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    apiCall(API_ENDPOINTS.DOCUMENT_TYPES)
      .then((data) => {
        if (cancelled) return;
        const results = data?.results ?? (Array.isArray(data) ? data : []);
        setDocumentTypes(results.map((t) => ({ id: t.id ?? t.pk, name: t.name ?? t.slug ?? '' })).filter((t) => t.name));
      })
      .catch(() => { if (!cancelled) setDocumentTypes([]); })
      .finally(() => { if (!cancelled) setDocumentTypesReady(true); });
    return () => { cancelled = true; };
  }, []);

  const docTypeMap = useMemo(
    () => Object.fromEntries(documentTypes.map((t) => [String(t.id), t.name])),
    [documentTypes]
  );

  /** Resolve display name from id; while types are still loading, flag pending so badges stay visible (no pop-in). */
  const enrichWithDocType = useCallback(
    (f) => {
      if (f.documentTypeId == null) {
        return { ...f, documentTypeName: '—', documentTypeBadgePending: false };
      }
      const name = docTypeMap[String(f.documentTypeId)];
      if (name) return { ...f, documentTypeName: name, documentTypeBadgePending: false };
      if (!documentTypesReady) return { ...f, documentTypeName: '', documentTypeBadgePending: true };
      return { ...f, documentTypeName: '—', documentTypeBadgePending: false };
    },
    [docTypeMap, documentTypesReady]
  );

  const term = searchTerm ?? trackingCodeSearch ?? '';
  const filteredFiles = useMemo(() => {
    return files.filter(f => {
      const matchesSearch = searchType === SEARCH_TYPES.CONTENTS
        ? true
        : searchType === SEARCH_TYPES.TITLE
          ? (!term || [f.title, f.filename].some(v => v && String(v).toLowerCase().includes(term.toLowerCase())))
          : searchType === SEARCH_TYPES.CORRESPONDENT
            ? (!term || String(f.submittedBy ?? '').toLowerCase().includes(term.toLowerCase()))
            : (!term || (f.trackingCode && f.trackingCode.toLowerCase().includes(term.toLowerCase())));
      const matchesStatus = !statusFilter || f.status === statusFilter;
      const matchesCopyState = !copyStateFilter || String(f.copyState ?? '').trim() === copyStateFilter;
      const docTypeId = f.documentTypeId != null ? String(f.documentTypeId) : '';
      const matchesDocumentType = !documentTypeFilter || docTypeId === documentTypeFilter;
      const docDate = f.added || f.created;
      const matchesDate = (() => {
        if (!dateFrom && !dateTo) return true;
        if (!docDate) return false;
        const d = new Date(docDate);
        if (isNaN(d.getTime())) return false;
        const dayStart = (y, m, d) => new Date(y, m, d).getTime();
        const docDay = dayStart(d.getFullYear(), d.getMonth(), d.getDate());
        if (dateFrom) {
          const [y, m, d] = dateFrom.split('-').map(Number);
          if (docDay < dayStart(y, m - 1, d)) return false;
        }
        if (dateTo) {
          const [y, m, d] = dateTo.split('-').map(Number);
          if (docDay > dayStart(y, m - 1, d)) return false;
        }
        return true;
      })();
      return matchesSearch && matchesStatus && matchesCopyState && matchesDocumentType && matchesDate;
    });
  }, [files, searchType, term, statusFilter, copyStateFilter, documentTypeFilter, dateFrom, dateTo]);

  if (filteredFiles.length === 0) {
    return (
      <div style={{
        padding: 48,
        textAlign: 'center',
        color: '#64748b',
        fontSize: 15,
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>No documents found</div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Try adjusting filters or search terms</div>
      </div>
    );
  }

  if (viewType === VIEW_TYPES.GRID) {
    const CARD_WIDTH = 224;
    return (
      <div key={viewType} style={{ ...viewTransitionStyle, display: 'grid', gridTemplateColumns: `repeat(auto-fill, ${CARD_WIDTH}px)`, gap: '24px', width: '100%', minWidth: 0, padding: '6px 10px 0 10px', alignContent: 'start', overflow: 'visible', justifyContent: 'start' }}>
        {filteredFiles.map((f, i) => (
          <DocumentCard
            key={f.id}
            document={enrichWithDocType(f)}
            index={i}
            hoveredCard={hoveredCard}
            imgLoading={imgLoading}
            imgErrors={imgErrors}
            onHoverCard={onHoverCard}
            onViewDocument={onViewDocument}
            onImageLoad={onImageLoad}
            onImageError={onImageError}
            onImageLoadStart={onImageLoadStart}
            getFileTypeIcon={getFileTypeIcon}
          />
        ))}
      </div>
    );
  }

  if (viewType === VIEW_TYPES.ONELINE) {
    return (
      <div key={viewType} style={{ ...viewTransitionStyle, width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: '0 6px' }}>
        {filteredFiles.map((f, i) => (
          <DocumentRow
            key={f.id}
            document={enrichWithDocType(f)}
            index={i}
            viewType={viewType}
            hoveredCard={hoveredCard}
            imgLoading={imgLoading}
            imgErrors={imgErrors}
            onHoverCard={onHoverCard}
            onViewDocument={onViewDocument}
            onImageLoad={onImageLoad}
            onImageError={onImageError}
            onImageLoadStart={onImageLoadStart}
            getFileTypeIcon={getFileTypeIcon}
          />
        ))}
      </div>
    );
  }

  // List view - Paperless-style table (table-sm, align-middle, border, shadow-sm)
  const thStyle = { textAlign: 'left', padding: '16px 20px', fontWeight: 600, color: COLORS.TEXT_MUTED, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', verticalAlign: 'middle', borderBottom: `2px solid ${COLORS.BORDER_MEDIUM}` };
  const tdStyle = { padding: '16px 20px', verticalAlign: 'middle', borderBottom: `1px solid ${COLORS.BORDER_LIGHT}` };
  return (
    <div key={viewType} style={{ ...viewTransitionStyle, width: '100%', minWidth: 0, overflowX: 'auto', border: `1px solid ${COLORS.BORDER_LIGHT}`, borderRadius: BORDER_RADIUS.LG, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', background: '#fff' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
        <thead>
          <tr style={{ background: '#f8f9fa' }}>
            <th style={{ ...thStyle, minWidth: 90 }}>Tracking code</th>
            <th style={{ ...thStyle, minWidth: 180 }}>Title</th>
            <th style={{ ...thStyle, minWidth: 100 }}>Document type</th>
            <th style={{ ...thStyle, minWidth: 100 }}>Created</th>
            <th style={{ ...thStyle, width: 70 }}>Pages</th>
            <th style={{ ...thStyle, minWidth: 100 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {filteredFiles.map((f, i) => {
            const enriched = enrichWithDocType(f);
            const docTypeName = enriched.documentTypeBadgePending ? '…' : enriched.documentTypeName;
            const titleText = f.title || f.trackingCode || '—';
            return (
              <tr
                key={f.id}
                style={{
                  background: hoveredCard === i ? '#f8fafc' : undefined,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={() => onHoverCard(i)}
                onMouseLeave={() => onHoverCard(null)}
                onClick={() => onViewDocument(f)}
              >
                <td style={{ ...tdStyle, color: COLORS.TEXT_MUTED, fontSize: 14 }}>{f.trackingCode && f.trackingCode !== 'No tracking code' ? f.trackingCode : '—'}</td>
                <td style={{ ...tdStyle, width: '30%', minWidth: 180, color: COLORS.TEXT_PRIMARY, fontWeight: 500, overflowWrap: 'anywhere', fontSize: 15, whiteSpace: 'normal' }}>
                  {titleText}
                </td>
                <td style={{ ...tdStyle, color: COLORS.TEXT_MUTED, fontSize: 14 }}>
                  <a href="#" style={{ color: COLORS.PRIMARY, textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} title="Filter by document type">{docTypeName}</a>
                </td>
                <td style={{ ...tdStyle, color: COLORS.TEXT_MUTED, fontSize: 14 }}>{(f.added || f.created) ? formatDocumentDate(f.added || f.created) : '—'}</td>
                <td style={{ ...tdStyle, color: COLORS.TEXT_MUTED, fontSize: 14 }}>{f.pageCount != null ? f.pageCount : '—'}</td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                    <StatusBadge status={f.status} showNeedsActionBadge={f.showNeedsActionBadge !== false} />
                    <ArchiveStateBadges markedForArchiving={f.markedForArchiving} archiveDrawerName={f.archiveDrawerName} archiveFolderName={f.archiveFolderName} archiveReference={f.archiveReference} />
                    {enriched.isUntrackedPublic ? <UntrackedBadge /> : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default DocumentList; 