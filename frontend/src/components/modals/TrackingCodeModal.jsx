import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiCall } from '../../services/api.js';
import { API_ENDPOINTS } from '../../constants/index.js';
import { suggestTitleFromContent } from '../../services/titleSuggestion.js';

/**
 * Post-upload document info: left panel (tracking code + AI status), main form (title, type, submitted by).
 */

function SuggestedBadge() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        color: '#055160',
        background: '#cff4fc',
        border: '1px solid #9eeaf9',
        padding: '2px 8px',
        borderRadius: 4,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
      Suggested
    </span>
  );
}

function TrackingCodeModal({
  pendingTrackingCodeDoc,
  trackingCode,
  processingStatus,
  onClose,
  onSave,
}) {
  const [hidePublicRouteOnTracker, setHidePublicRouteOnTracker] = useState(false);
  const prevDocIdRef = useRef(null);

  const [title, setTitle] = useState('');
  const [suggestedTitles, setSuggestedTitles] = useState([]);
  const [suggestedDocumentTypeId, setSuggestedDocumentTypeId] = useState(null);
  const [paperlessDocumentTypes, setPaperlessDocumentTypes] = useState([]);
  const [documentTypeId, setDocumentTypeId] = useState(null);

  const [submittedBy, setSubmittedBy] = useState('');
  const [suggestedSubmittedBy, setSuggestedSubmittedBy] = useState(null);

  const [suggestionsError, setSuggestionsError] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    const id = pendingTrackingCodeDoc?.id;
    if (id !== prevDocIdRef.current) {
      prevDocIdRef.current = id;
      setHidePublicRouteOnTracker(false);
    }
  }, [pendingTrackingCodeDoc?.id]);

  useEffect(() => {
    if (!pendingTrackingCodeDoc) return;
    const currentTitle = pendingTrackingCodeDoc.title || pendingTrackingCodeDoc.filename || 'Document';
    setTitle(currentTitle);
    setSuggestedTitles([]);
    setSuggestedDocumentTypeId(null);
    setDocumentTypeId(null);
    setSubmittedBy('');
    setSuggestedSubmittedBy(null);
    setSuggestionsError(null);
    setLoadingSuggestions(true);
    let cancelled = false;

    const run = async () => {
      try {
        const dtRes = await apiCall(API_ENDPOINTS.DOCUMENT_TYPES);
        if (cancelled) return;
        const dtResults = dtRes?.results ?? (Array.isArray(dtRes) ? dtRes : []);
        const docTypes = dtResults.map((t) => ({ id: t.id ?? t.pk, name: (t.name ?? t.slug ?? '').trim() })).filter((t) => t.name);
        setPaperlessDocumentTypes(docTypes);
        if (docTypes.length > 0) setDocumentTypeId(docTypes[0].id);
      } catch {
        if (!cancelled) setPaperlessDocumentTypes([]);
      }

      try {
        const data = await apiCall(API_ENDPOINTS.DOCUMENT_SUMMARY(pendingTrackingCodeDoc.id));
        if (cancelled) return;
        const titles = data?.suggested_titles;
        if (Array.isArray(titles) && titles.length > 0) {
          setSuggestedTitles(titles);
          setTitle((prev) => (prev === currentTitle ? titles[0] : prev));
        } else {
          try {
            const doc = await apiCall(API_ENDPOINTS.DOCUMENT_DETAIL(pendingTrackingCodeDoc.id));
            if (cancelled) return;
            const suggested = suggestTitleFromContent(doc?.content, currentTitle);
            setSuggestedTitles([suggested]);
            setTitle((prev) => (prev === currentTitle ? suggested : prev));
          } catch {
            setSuggestedTitles([currentTitle]);
          }
        }
        const suggestedTypes = data?.suggested_document_types;
        if (Array.isArray(suggestedTypes) && suggestedTypes.length > 0) {
          const id = suggestedTypes[0]?.id ?? suggestedTypes[0];
          setDocumentTypeId(id);
          setSuggestedDocumentTypeId(id);
        }
        const suggestedSubmitter = data?.suggested_submitted_by;
        if (typeof suggestedSubmitter === 'string' && suggestedSubmitter.trim()) {
          setSuggestedSubmittedBy(suggestedSubmitter.trim());
          setSubmittedBy((prev) => (prev === '' ? suggestedSubmitter.trim() : prev));
        }
        if (data?.error) setSuggestionsError(data.error);
      } catch {
        if (cancelled) return;
        setSuggestionsError('Suggestions unavailable');
        setSuggestedTitles([currentTitle]);
        try {
          const doc = await apiCall(API_ENDPOINTS.DOCUMENT_DETAIL(pendingTrackingCodeDoc.id));
          if (cancelled) return;
          const suggested = suggestTitleFromContent(doc?.content, currentTitle);
          setTitle(suggested);
          setSuggestedTitles([suggested]);
        } catch {
          setSuggestedTitles([currentTitle]);
        }
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [pendingTrackingCodeDoc?.id]);

  const handleSave = useCallback(() => {
    onSave(trackingCode, title, documentTypeId, submittedBy, {
      hidePublicRoute: hidePublicRouteOnTracker,
    });
  }, [onSave, hidePublicRouteOnTracker, trackingCode, title, documentTypeId, submittedBy]);

  useEffect(() => {
    if (!pendingTrackingCodeDoc) return;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      if (processingStatus) return;
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pendingTrackingCodeDoc, processingStatus, onClose]);

  if (!pendingTrackingCodeDoc) {
    return null;
  }

  const canDismiss = !processingStatus;
  const primary = '#2a5196';
  const borderInput = '#ced4da';
  const muted = '#6c757d';

  const chipBase = {
    padding: '6px 12px',
    fontSize: 13,
    borderRadius: 4,
    fontWeight: 500,
    color: '#212529',
    textAlign: 'left',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    cursor: processingStatus ? 'not-allowed' : 'pointer',
  };

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 4000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
      }}
      onClick={() => {
        if (canDismiss) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracking-code-modal-title"
        style={{
          background: '#fff',
          borderRadius: 6,
          width: '100%',
          maxWidth: 880,
          boxShadow: '0 0.5rem 1rem rgba(0, 0, 0, 0.15)',
          border: '1px solid rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'min(90vh, 100%)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #dee2e6',
            flexShrink: 0,
          }}
        >
          <h2
            id="tracking-code-modal-title"
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 500,
              color: primary,
              lineHeight: 1.2,
            }}
          >
            Document info
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '4px 8px',
              margin: '-4px -8px 0 0',
              fontSize: 22,
              lineHeight: 1,
              color: muted,
              cursor: canDismiss ? 'pointer' : 'not-allowed',
              opacity: canDismiss ? 1 : 0.5,
            }}
            aria-label="Close"
            disabled={!canDismiss}
          >
            ×
          </button>
        </div>

        <form
          id="tracking-doc-info-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (trackingCode && !processingStatus) handleSave();
          }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 auto',
            minHeight: 0,
          }}
        >
          <div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>
            <aside
              style={{
                width: 240,
                flexShrink: 0,
                borderRight: '1px solid #dee2e6',
                padding: '20px 16px',
                background: '#f8f9fa',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                overflowY: 'auto',
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                  Tracking code
                </div>
                <div
                  style={{
                    padding: '10px 12px',
                    fontSize: 15,
                    borderRadius: 4,
                    border: `1px solid ${borderInput}`,
                    background: '#fff',
                    color: '#212529',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 600,
                  }}
                >
                  {trackingCode || '—'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                  AI suggestions
                </div>
                {loadingSuggestions && (
                  <p style={{ color: muted, fontSize: 13, margin: 0 }}>Analyzing OCR text…</p>
                )}
                {!loadingSuggestions && suggestionsError && (
                  <p style={{ color: muted, fontSize: 13, margin: 0 }}>{suggestionsError}</p>
                )}
                {!loadingSuggestions && !suggestionsError && (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#212529', lineHeight: 1.5 }}>
                    <li>{suggestedTitles[0] ? 'Title ready' : 'Title pending'}</li>
                    <li>{suggestedDocumentTypeId != null ? 'Document type suggested' : 'Pick document type'}</li>
                    <li>{suggestedSubmittedBy ? 'Submitted by suggested' : 'Submitted by optional'}</li>
                  </ul>
                )}
                {suggestedSubmittedBy && !loadingSuggestions && (
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: muted, lineHeight: 1.4 }}>
                    Suggested: <strong style={{ color: '#212529' }}>{suggestedSubmittedBy}</strong>
                  </p>
                )}
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  fontSize: 13,
                  color: '#212529',
                  cursor: processingStatus ? 'not-allowed' : 'pointer',
                  marginTop: 'auto',
                }}
              >
                <input
                  type="checkbox"
                  checked={hidePublicRouteOnTracker}
                  onChange={(e) => setHidePublicRouteOnTracker(e.target.checked)}
                  disabled={!!processingStatus}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <span>
                  <span style={{ display: 'block', fontWeight: 500 }}>Untracked document</span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: muted }}>
                    Hidden on public tracker only.
                  </span>
                </span>
              </label>
            </aside>

            <div style={{ flex: '1 1 auto', padding: '20px 20px 0', overflowY: 'auto', minWidth: 0 }}>
              <p style={{ margin: '0 0 16px', color: muted, fontSize: 14, lineHeight: 1.5 }}>
                Review title, document type, and who submitted the letter, then save.
              </p>

              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 6 }}>
                Document title
              </label>
              {suggestedTitles.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {suggestedTitles.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTitle(t)}
                      disabled={!!processingStatus}
                      style={{
                        ...chipBase,
                        border: title === t ? `2px solid ${primary}` : `1px solid ${borderInput}`,
                        background: title === t ? 'rgba(42, 81, 150, 0.08)' : '#fff',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Or type a title"
                disabled={!!processingStatus}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: 14,
                  borderRadius: 4,
                  border: `1px solid ${borderInput}`,
                  color: '#212529',
                  marginBottom: 16,
                  boxSizing: 'border-box',
                }}
              />

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 6 }}>
                Document type
                {suggestedDocumentTypeId != null && <SuggestedBadge />}
              </label>
              {paperlessDocumentTypes.length === 0 && !loadingSuggestions && (
                <p style={{ color: muted, fontSize: 13, marginBottom: 12 }}>No document types yet. Add them in Paperless settings.</p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {paperlessDocumentTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setDocumentTypeId(type.id)}
                    disabled={!!processingStatus}
                    style={{
                      padding: '8px 14px',
                      fontSize: 13,
                      fontWeight: 500,
                      borderRadius: 4,
                      border: documentTypeId === type.id ? `2px solid ${primary}` : `1px solid ${borderInput}`,
                      background: documentTypeId === type.id ? 'rgba(42, 81, 150, 0.08)' : '#fff',
                      color: '#212529',
                      cursor: processingStatus ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {type.name}
                  </button>
                ))}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 6 }}>
                Submitted by
                {suggestedSubmittedBy && submittedBy === suggestedSubmittedBy && <SuggestedBadge />}
              </label>
              {suggestedSubmittedBy && (
                <button
                  type="button"
                  onClick={() => setSubmittedBy(suggestedSubmittedBy)}
                  disabled={!!processingStatus}
                  style={{
                    ...chipBase,
                    display: 'inline-block',
                    marginBottom: 8,
                    border: submittedBy === suggestedSubmittedBy ? `2px solid ${primary}` : `1px solid ${borderInput}`,
                    background: submittedBy === suggestedSubmittedBy ? 'rgba(42, 81, 150, 0.08)' : '#fff',
                  }}
                >
                  {suggestedSubmittedBy}
                </button>
              )}
              <input
                type="text"
                value={submittedBy}
                onChange={(e) => setSubmittedBy(e.target.value)}
                placeholder="Person or organization who sent the letter"
                disabled={!!processingStatus}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: 14,
                  borderRadius: 4,
                  border: `1px solid ${borderInput}`,
                  color: '#212529',
                  marginBottom: 16,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              padding: '16px 20px',
              borderTop: '1px solid #dee2e6',
              background: '#fff',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={!!processingStatus}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                fontWeight: 500,
                color: '#212529',
                background: '#fff',
                border: '1px solid #ced4da',
                borderRadius: 4,
                cursor: processingStatus ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!trackingCode || !!processingStatus}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                fontWeight: 500,
                color: '#fff',
                background: !trackingCode || processingStatus ? '#6c757d' : primary,
                border: '1px solid transparent',
                borderRadius: 4,
                cursor: !trackingCode || processingStatus ? 'not-allowed' : 'pointer',
              }}
            >
              {processingStatus ? processingStatus : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TrackingCodeModal;
