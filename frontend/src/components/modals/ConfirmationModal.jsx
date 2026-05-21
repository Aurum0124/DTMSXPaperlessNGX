import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { COLORS } from '../../constants/uiConstants.js';

/**
 * ConfirmationModal – reusable confirmation dialog (same shell as Upload / Release / Document Lookup).
 * Renders into document.body via portal so overlay isn't clipped by parent overflow/scroll.
 */
function ConfirmationModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  if (!open) return null;

  const primary = COLORS.PRIMARY;
  const muted = '#6c757d';

  const content = (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 5000,
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
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
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
            id="confirmation-modal-title"
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 500,
              color: primary,
              lineHeight: 1.2,
              paddingRight: 12,
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
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
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            padding: '20px 20px 16px',
            overflowY: 'auto',
            flex: '1 1 auto',
            minHeight: 0,
          }}
        >
          <p
            style={{
              margin: 0,
              color: muted,
              fontSize: 14,
              lineHeight: 1.5,
              textAlign: 'left',
            }}
          >
            {message}
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
          <button
            type="button"
            onClick={onCancel}
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
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              color: '#fff',
              background: danger ? COLORS.ERROR : primary,
              border: '1px solid transparent',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

export default ConfirmationModal;
