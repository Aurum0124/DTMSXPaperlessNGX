import { useState, useEffect, useCallback } from 'react';
import { apiCall } from '../../services/api.js';
import TrackerDetailsModal from './TrackerDetailsModal.jsx';
import TrackerNotFoundModal from './TrackerNotFoundModal.jsx';
import { COLORS } from '../../constants/uiConstants.js';

/**
 * Staff document lookup in a modal (replaces full-page lookup view).
 * Shell aligned with Upload / Receive / Release modals.
 */
function StaffDocumentLookupModal({ open, onClose }) {
  const [trackingCode, setTrackingCode] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modalRefreshing, setModalRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [error, setError] = useState(null);

  const reset = useCallback(() => {
    setTrackingCode('');
    setResult(null);
    setLoading(false);
    setModalRefreshing(false);
    setJustRefreshed(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!justRefreshed) return;
    const t = setTimeout(() => setJustRefreshed(false), 1500);
    return () => clearTimeout(t);
  }, [justRefreshed]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiCall(
        `/api/tracker/document-lookup?tracking_code=${encodeURIComponent(trackingCode.trim())}`
      );
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const y = new Date().getFullYear();
  const primary = COLORS.PRIMARY;
  const muted = '#6c757d';
  const borderInput = '#ced4da';

  if (!open) return null;

  return (
    <>
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
          zIndex: 3000,
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
          aria-labelledby="staff-lookup-modal-title"
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
              id="staff-lookup-modal-title"
              style={{
                margin: 0,
                fontSize: '1.25rem',
                fontWeight: 500,
                color: primary,
                lineHeight: 1.2,
              }}
            >
              Document Lookup
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
                color: '#6c757d',
                cursor: 'pointer',
              }}
              aria-label="Close"
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
            <p style={{ margin: '0 0 16px', color: muted, fontSize: 14, lineHeight: 1.5 }}>
              Enter a tracking code to view status and routing.
            </p>

            <form id="staff-lookup-form" onSubmit={handleSubmit}>
              <input
                type="text"
                autoComplete="off"
                required
                placeholder={`e.g. TRK-${y}-00001`}
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
                aria-label="Tracking code"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  fontSize: 14,
                  border: `1px solid ${borderInput}`,
                  borderRadius: 4,
                  outline: 'none',
                }}
              />
            </form>

            {error && (
              <div
                style={{
                  marginTop: 16,
                  padding: '12px 14px',
                  background: '#f8d7da',
                  border: '1px solid #f5c2c7',
                  borderRadius: 4,
                  color: '#842029',
                  fontSize: 14,
                }}
              >
                {error}
              </div>
            )}
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
              Cancel
            </button>
            <button
              type="submit"
              form="staff-lookup-form"
              disabled={loading}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                fontWeight: 500,
                color: '#fff',
                background: loading ? '#6c757d' : primary,
                border: '1px solid transparent',
                borderRadius: 4,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Searching…' : 'Look up'}
            </button>
          </div>
        </div>
      </div>

      <TrackerDetailsModal
        open={!!(result?.document)}
        result={result}
        trackingCode={trackingCode}
        onClose={() => setResult(null)}
        isRefreshing={modalRefreshing}
        justRefreshed={justRefreshed}
        onRefresh={async () => {
          if (!trackingCode?.trim()) return;
          setModalRefreshing(true);
          setError(null);
          try {
            const data = await apiCall(
              `/api/tracker/document-lookup?tracking_code=${encodeURIComponent(trackingCode.trim())}`
            );
            setResult(data);
            setJustRefreshed(true);
          } catch (err) {
            setError(err.message);
          } finally {
            setModalRefreshing(false);
          }
        }}
      />

      <TrackerNotFoundModal
        open={!!(result && !result.document)}
        trackingCode={trackingCode}
        onClose={() => setResult(null)}
      />
    </>
  );
}

export default StaffDocumentLookupModal;
