import React, { useEffect, useRef } from 'react';

const COLORS = {
  primary: '#2a5196',
  primaryLight: '#3d6ab5',
  text: '#1f2937',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  white: '#fff',
};

/**
 * TrackerNotFoundModal
 *
 * Shown when a tracking code search returns no document.
 */
function TrackerNotFoundModal({ open, trackingCode, onClose, showFooterClose = true }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (open && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  const displayCode = trackingCode?.trim() || '';
  const primary = COLORS.primary;
  const muted = '#6c757d';

  return (
    <div
      role="presentation"
      onClick={onClose}
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
        animation: 'fadeIn 0.2s',
      }}
    >
      <div
        role="dialog"
        aria-labelledby="tracker-not-found-title"
        aria-describedby="tracker-not-found-desc"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 6,
          width: '100%',
          maxWidth: 520,
          maxHeight: 'min(90vh, 100%)',
          boxShadow: '0 0.5rem 1rem rgba(0, 0, 0, 0.15)',
          border: '1px solid rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
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
            id="tracker-not-found-title"
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 500,
              color: primary,
              lineHeight: 1.2,
            }}
          >
            No Document Found
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '4px 8px',
              margin: '-4px -8px 0 0',
              fontSize: 22,
              lineHeight: 1,
              color: '#6c757d',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '20px 20px 16px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0, textAlign: 'left' }}>
          {displayCode && (
            <p
              style={{
                margin: '0 0 12px',
                fontSize: 14,
                color: muted,
                fontFamily: 'ui-monospace, monospace',
                wordBreak: 'break-all',
              }}
            >
              {displayCode}
            </p>
          )}
          <p
            id="tracker-not-found-desc"
            style={{
              margin: 0,
              fontSize: 14,
              color: muted,
              lineHeight: 1.5,
            }}
          >
            Check the code and try again, or the document may not be in the system yet.
          </p>
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
          {showFooterClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              color: '#212529',
              background: '#fff',
              border: '1px solid #ced4da',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
          )}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              color: '#fff',
              background: primary,
              border: '1px solid transparent',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = COLORS.primaryLight;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = primary;
            }}
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

export default TrackerNotFoundModal;
