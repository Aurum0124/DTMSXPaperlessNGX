import React, { useState, useRef, useEffect } from 'react';
import { apiCall } from '../../services/api.js';
import { API_ENDPOINTS } from '../../constants/index.js';
import TrackingCodeInput from '../TrackingCodeInput.jsx';
import ConfirmationModal from './ConfirmationModal.jsx';
import { getCopyStateFieldIdAsync } from '../../services/customFields.js';

/**
 * ReceiveModal Component
 *
 * Opened when user clicks Receive. Prompts to scan document barcode.
 * When fixed routing is set for the document, only the correct office in the route can receive.
 * Wrong office shows "Wrong office!" and displays the fixed routing.
 */
function ReceiveModal({ open, tagInfo, allTags = [], onClose, onSuccess }) {
  const [scanInput, setScanInput] = useState('');
  const [status, setStatus] = useState('idle'); // idle | searching | success | error
  const [message, setMessage] = useState('');
  const [wrongOfficeRoute, setWrongOfficeRoute] = useState(null);
  const [pendingWrongOfficeReceive, setPendingWrongOfficeReceive] = useState(null); // { doc, code, fromTagId }
  const [pendingDigitalPhysicalReceive, setPendingDigitalPhysicalReceive] = useState(null); // { doc, code, fromTagId }
  const [inTransitCodes, setInTransitCodes] = useState([]);
  const inputRef = useRef(null);
  const copyStateFieldIdRef = useRef(null);

  const tagList = Array.isArray(allTags?.results) ? allTags.results : (Array.isArray(allTags) ? allTags : []);
  const tagIdToName = tagList.reduce((acc, t) => {
    const id = t?.id ?? t?.pk;
    if (id != null) acc[id] = t?.name ?? `Office ${id}`;
    return acc;
  }, {});

  useEffect(() => {
    if (open) {
      setScanInput('');
      setStatus('idle');
      setMessage('');
      setWrongOfficeRoute(null);
      setPendingWrongOfficeReceive(null);
      setPendingDigitalPhysicalReceive(null);
      setInTransitCodes([]);
      apiCall('/api/admin/stats?include_in_transit=1')
        .then((data) => {
          const list = data?.in_transit ?? [];
          setInTransitCodes(list.map((item) => item?.tracking_code).filter(Boolean));
        })
        .catch(() => setInTransitCodes([]));
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const code = scanInput.trim();
    if (!code || !tagInfo?.id) return;

    setStatus('searching');
    setMessage('');
      setWrongOfficeRoute(null);

    try {
      const url = `/api/documents/?custom_field_query=${encodeURIComponent(
        JSON.stringify(['Tracking Code', 'exact', code])
      )}`;
      const data = await apiCall(url);
      const results = data?.results ?? [];
      const doc = results[0];

      if (!doc) {
        setStatus('error');
        setMessage('Document not found. Please check the tracking code and try again.');
        return;
      }

      const transfersData = await apiCall(`/api/transfers?document_id=${doc.id}`);
      const transfers = transfersData?.transfers ?? [];
      const releases = transfers.filter(
        (t) => t?.type === 'release' || t?.type === 'digital_release' || t?.type === 'archive_release'
      );
      const lastRelease = releases.length > 0 ? releases[releases.length - 1] : null;

      const copyStateFieldId = copyStateFieldIdRef.current ?? (await getCopyStateFieldIdAsync().catch(() => null));
      if (copyStateFieldIdRef.current == null) copyStateFieldIdRef.current = copyStateFieldId;
      const copyStateField =
        copyStateFieldId != null
          ? (doc.custom_fields ?? []).find((f) => Number(f.field ?? f) === Number(copyStateFieldId))
          : null;
      const copyState = String(copyStateField?.value ?? '').toLowerCase();
      const isDigitalPending = copyState.includes('digital') && copyState.includes('pending');

      const docTagIds = Array.isArray(doc.tags)
        ? doc.tags
            .map((t) => (typeof t === 'object' && t != null ? Number(t.id ?? t.pk ?? t) : Number(t)))
            .filter((n) => Number.isFinite(n))
        : [];
      if (docTagIds.length > 0) {
        const atCurrentOffice = docTagIds.some((t) => Number(t) === Number(tagInfo.id));
        if (atCurrentOffice && isDigitalPending) {
          const lastDigitalRelease = [...transfers].reverse().find((t) => t?.type === 'digital_release');
          setPendingDigitalPhysicalReceive({
            doc,
            code,
            fromTagId: lastDigitalRelease?.from_tag_id ?? null,
          });
          setStatus('idle');
          setMessage('');
          setWrongOfficeRoute(null);
          setPendingWrongOfficeReceive(null);
          return;
        }
        setStatus('error');
        setMessage('Document is already at a department. It must be released before it can be received.');
        return;
      }
      const routeSequence = lastRelease?.route_sequence;

      if (routeSequence && Array.isArray(routeSequence) && routeSequence.length > 0) {
        const nextOfficeId = routeSequence[0];
        if (Number(nextOfficeId) !== Number(tagInfo.id)) {
          const originalRelease =
            releases.find((r) => Array.isArray(r?.route_sequence) && r.route_sequence.length > 0) ?? lastRelease;
          let fixedRoute = [];
          if (originalRelease && Array.isArray(originalRelease.route_sequence) && originalRelease.route_sequence.length > 0) {
            const issuerId = originalRelease.from_tag_id;
            if (issuerId != null) {
              fixedRoute.push({ tag_id: issuerId, name: tagIdToName[issuerId] ?? `Office ${issuerId}`, issued_by: true });
            }
            originalRelease.route_sequence.forEach((tagId) => {
              fixedRoute.push({ tag_id: tagId, name: tagIdToName[tagId] ?? `Office ${tagId}`, issued_by: false });
            });
          }
          const isArchiveHandoff = lastRelease?.type === 'archive_release';
          const designatedName = tagIdToName[nextOfficeId] ?? `Office #${nextOfficeId}`;
          setStatus('error');
          setMessage(
            isArchiveHandoff
              ? `This document was sent for archiving. Only ${designatedName} can receive it to file and complete archiving—not your office.`
              : 'Your office is not intended to receive this document.',
          );
          setWrongOfficeRoute({
            fixedRoute,
            inTransitFromTagId: lastRelease?.from_tag_id ?? null,
            inTransitToTagId: nextOfficeId,
            isArchiveHandoff,
          });
          setPendingWrongOfficeReceive({
            doc,
            code,
            fromTagId: lastRelease?.from_tag_id ?? null,
          });
          return;
        }
      }

      await performReceive(doc, code, lastRelease?.from_tag_id ?? doc.tags?.[0] ?? null, false);
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Failed to receive document. Please try again.');
    }
  };

  const performReceive = async (doc, code, fromTagId, receiveAnyway) => {
    setStatus('searching');
    setMessage('');
    try {
      await apiCall('/api/transfers', {
        method: 'POST',
        body: JSON.stringify({
          document_id: doc.id,
          tracking_code: code,
          from_tag_id: fromTagId,
          to_tag_id: tagInfo.id,
          type: 'receive',
          receive_anyway: receiveAnyway,
        }),
      });

      // Office tag + copy state are applied server-side on receive.

      setStatus('success');
      setMessage(`Document ${code} received and assigned to ${tagInfo.name}.`);
      setScanInput('');
      setWrongOfficeRoute(null);
      setPendingWrongOfficeReceive(null);
      setPendingDigitalPhysicalReceive(null);

      if (onSuccess) onSuccess();
      setTimeout(() => {
        inputRef.current?.focus();
        setStatus('idle');
        setMessage('');
      }, 1500);
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Failed to receive document. Please try again.');
    }
  };

  const handleReceiveAnyway = async () => {
    const pending = pendingWrongOfficeReceive;
    if (!pending?.doc || !pending?.code) return;
    await performReceive(pending.doc, pending.code, pending.fromTagId, true);
  };

  const handleConfirmDigitalPhysicalReceive = async () => {
    const pending = pendingDigitalPhysicalReceive;
    if (!pending?.doc || !pending?.code) return;
    await performReceive(pending.doc, pending.code, pending.fromTagId, false);
  };

  if (!open) return null;

  const primary = '#2a5196';
  const muted = '#6c757d';

  const primaryDisabled =
    status === 'searching' ||
    (!pendingWrongOfficeReceive && !pendingDigitalPhysicalReceive && !scanInput.trim());
  const primaryBg = primaryDisabled
    ? '#6c757d'
    : pendingWrongOfficeReceive
      ? '#f59e0b'
      : pendingDigitalPhysicalReceive
        ? '#2a5196'
      : primary;

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
        animation: 'fadeIn 0.2s',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="receive-modal-title"
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
            id="receive-modal-title"
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 500,
              color: primary,
              lineHeight: 1.2,
            }}
          >
            Receive Document
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

        <div style={{ padding: '20px 20px 0', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
          <p style={{ margin: '0 0 16px', color: muted, fontSize: 14, lineHeight: 1.5 }}>
            Scan the document barcode. The document will be assigned to
            <strong style={{ display: 'block', marginTop: 6, color: primary }}>
              {tagInfo?.name || 'your department'}.
            </strong>
          </p>

          <form id="receive-modal-form" onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <TrackingCodeInput
                inputRef={inputRef}
                value={scanInput}
                onChange={setScanInput}
                trackingCodes={inTransitCodes}
                showSuggestions={false}
                inputProps={{
                  placeholder: 'Scan or type tracking code...',
                  disabled: status === 'searching',
                }}
              />
            </div>
          </form>

          {status === 'success' && (
            <div
              style={{
                marginBottom: 16,
                padding: '12px 14px',
                background: '#d1e7dd',
                border: '1px solid #badbcc',
                borderRadius: 4,
                color: '#0f5132',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Document received successfully.
            </div>
          )}
          {message && status !== 'success' && (
            <div style={{ marginBottom: 16, textAlign: 'left' }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  color: status === 'error' ? '#842029' : '#0f5132',
                  fontWeight: status === 'error' ? 500 : 400,
                }}
              >
                {message}
              </p>
              {wrongOfficeRoute && pendingWrongOfficeReceive && (
                <div style={{ marginTop: 12, padding: 12, background: '#fff3cd', border: '1px solid #ffecb5', borderRadius: 4, textAlign: 'left' }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#664d03', lineHeight: 1.5 }}>
                    {wrongOfficeRoute.isArchiveHandoff ? (
                      <>
                        <strong>Receive anyway?</strong> This document is meant to be archived at the office above. Use this only if you must temporarily hold or forward the physical file—archiving should still be completed there.
                      </>
                    ) : (
                      <>
                        <strong>Receive anyway?</strong> If you receive, you will be added to the document route. Please forward the document to the next office.
                      </>
                    )}
                  </p>
                </div>
              )}
              {wrongOfficeRoute && (() => {
                const { fixedRoute, inTransitFromTagId, inTransitToTagId, isArchiveHandoff } = wrongOfficeRoute;
                if (!fixedRoute || fixedRoute.length === 0) return null;
                const steps = [];
                const first = fixedRoute[0];
                if (first?.issued_by) {
                  steps.push({ key: 'issued', label: `Issued by ${first.name}`, tag_id: first.tag_id, isOffice: true, isIssuedBy: true });
                }
                fixedRoute.filter((s) => !s.issued_by).forEach((s) => {
                  if (steps.length > 0 && Number(steps[steps.length - 1].tag_id) === Number(inTransitFromTagId) && Number(s.tag_id) === Number(inTransitToTagId)) {
                    steps.push({ key: 'transit', label: 'In Transit', isOffice: false, isInTransit: true });
                  }
                  steps.push({ key: s.tag_id, label: s.name, tag_id: s.tag_id, isOffice: true });
                });
                return (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#664d03', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                      {isArchiveHandoff ? 'Archiving handoff' : 'Document route'}
                    </div>
                    <div style={{ padding: 12, background: '#fff3cd', border: '1px solid #ffecb5', borderRadius: 4, overflowX: 'auto' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, minWidth: 'max-content', padding: '8px 0' }}>
                        {steps.map((step, idx) => {
                          const isCurrentLocation = step.isInTransit;
                          const isNextDestination = step.tag_id != null && Number(step.tag_id) === Number(inTransitToTagId);
                          const displayNum = step.isInTransit ? null : steps.slice(0, idx).filter((s) => !s.isInTransit).length + 1;
                          const lineYellow = step.isInTransit || steps[idx + 1]?.isInTransit;
                          return (
                            <React.Fragment key={step.key}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                                <div
                                  className={isCurrentLocation ? 'receive-modal-route-circle-pulse' : ''}
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: '50%',
                                    background: step.isInTransit ? '#f59e0b' : primary,
                                    border: '3px solid #fff',
                                    boxShadow: !isCurrentLocation ? '0 0 0 2px #e5e7eb' : undefined,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 12,
                                    color: '#fff',
                                    fontWeight: 600,
                                  }}
                                >
                                  {displayNum ?? ''}
                                </div>
                                <div style={{
                                  marginTop: 6,
                                  fontSize: 12,
                                  fontWeight: isNextDestination ? 700 : 500,
                                  color: '#495057',
                                  textAlign: 'center',
                                  whiteSpace: 'normal',
                                  wordBreak: 'break-word',
                                }}
                                >
                                  {step.label}
                                  {isNextDestination && (
                                    <span style={{ display: 'block', fontSize: 10, color: muted }}>
                                      {isArchiveHandoff ? '(Archiving office)' : '(Next)'}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {idx < steps.length - 1 && (
                                <div style={{ width: 28, minWidth: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <div style={{ width: '100%', height: 3, background: lineYellow ? '#eab308' : '#e5e7eb', borderRadius: 2 }} />
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
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
            type={pendingWrongOfficeReceive || pendingDigitalPhysicalReceive ? 'button' : 'submit'}
            form={pendingWrongOfficeReceive || pendingDigitalPhysicalReceive ? undefined : 'receive-modal-form'}
            onClick={
              pendingWrongOfficeReceive
                ? () => handleReceiveAnyway()
                : pendingDigitalPhysicalReceive
                  ? () => handleConfirmDigitalPhysicalReceive()
                  : undefined
            }
            disabled={primaryDisabled}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              color: '#fff',
              background: primaryBg,
              border: '1px solid transparent',
              borderRadius: 4,
              cursor: status === 'searching' ? 'not-allowed' : 'pointer',
            }}
          >
            {status === 'searching'
              ? 'Receiving…'
              : pendingWrongOfficeReceive
                ? 'Receive anyway'
                : pendingDigitalPhysicalReceive
                  ? 'Confirm physical received'
                  : 'Receive'}
          </button>
        </div>
      </div>
      <ConfirmationModal
        open={pendingDigitalPhysicalReceive != null}
        title="Digital release detected"
        message="This document was released digitally. Physical document has been received and you can now take action on the document."
        confirmLabel="Confirm physical received"
        cancelLabel="Cancel"
        onConfirm={() => handleConfirmDigitalPhysicalReceive()}
        onCancel={() => setPendingDigitalPhysicalReceive(null)}
      />
      <style>{`
        .receive-modal-route-circle-pulse {
          animation: receiveModalCirclePulse 2s ease-in-out infinite;
        }
        @keyframes receiveModalCirclePulse {
          0%, 100% {
            box-shadow: 0 0 0 2px #e5e7eb;
          }
          50% {
            box-shadow: 0 0 0 4px #f59e0b, 0 0 12px rgba(245,158,11,0.4);
          }
        }
      `}</style>
    </div>
  );
}

export default ReceiveModal;
