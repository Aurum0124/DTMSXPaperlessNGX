import React, { useState, useRef, useEffect } from 'react';
import StatusBadge from '../ui/StatusBadge.jsx';

const COLORS = {
  primary: '#2a5196',
  text: '#1f2937',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  white: '#fff',
};

/**
 * TrackerDetailsModal Component
 *
 * Displays document tracking details (status, location, history) in a modal.
 * Shown when user searches for a tracking code and a document is found.
 */
function TrackerDetailsModal({
  open,
  result,
  trackingCode,
  onClose,
  onRefresh,
  isRefreshing = false,
  justRefreshed = false,
  showFooterClose = true,
}) {
  const [routeExpanded, setRouteExpanded] = useState(true);
  const [remarksOpen, setRemarksOpen] = useState(false);
  const remarksRef = useRef(null);

  useEffect(() => {
    if (!remarksOpen) return;
    const onDocClick = (e) => {
      if (remarksRef.current && !remarksRef.current.contains(e.target)) {
        setRemarksOpen(false);
      }
    };
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, [remarksOpen]);

  if (!open || !result?.document) return null;

  const doc = result.document;
  const raw = doc.modified || doc.updated || doc.last_modified;
  let lastUpdated = null;
  if (raw) {
    const date = new Date(raw);
    lastUpdated = date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  const statusField = doc.custom_fields?.find(f =>
    ['Under Review', 'Needs Action', 'Approved', 'Rejected'].includes(f?.value)
  );
  const rawStatus = statusField?.value || 'Under Review';
  /** On tracker, Approved and Rejected both display as "Action Taken" */
  const status = rawStatus === 'Approved' || rawStatus === 'Rejected' ? 'Action Taken' : rawStatus;
  const inTransit = result.inTransit;
  const fixedRoute = result.fixedRoute || [];
  const currentLocationTagId = result.currentLocationTagId ?? null;
  const inTransitFromTagId = result.inTransitFromTagId ?? null;
  const inTransitToTagId = result.inTransitToTagId ?? null;
  const displayCode = trackingCode?.trim() || '';

  const actionRemarks = result?.actionRemarks ?? null;
  const showRemarksButton = status === 'Action Taken' && actionRemarks;
  const endorsementProgress = result?.endorsementProgress ?? null;
  const showEndorsementProgress = endorsementProgress && endorsementProgress.required > 0;
  const endorsementCount = result?.endorsementCount ?? 0;
  const showEndorsementCount = fixedRoute.length === 0 && endorsementCount > 0;

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
        aria-labelledby="tracker-modal-title"
        aria-modal="true"
        className={`tracker-details-modal ${justRefreshed ? 'tracker-modal-just-refreshed' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.white,
          borderRadius: 6,
          border: '1px solid rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: 520,
          maxHeight: 'min(90vh, 100%)',
          boxShadow: '0 0.5rem 1rem rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 20px',
            borderBottom: '1px solid #dee2e6',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: COLORS.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 4,
              }}
            >
              Tracking code
            </div>
            <div
              id="tracker-modal-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 500,
                color: COLORS.primary,
                lineHeight: 1.2,
                wordBreak: 'break-word',
              }}
            >
              {displayCode}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0,
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

        {/* Scrollable body */}
        <div
          className="tracker-modal-body"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 24,
          }}
        >
          {/* Status & Location row */}
          <div
            className="tracker-status-location-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 1,
              background: COLORS.border,
            }}
          >
            <div style={{ padding: 20, background: COLORS.white }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Status</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <StatusBadge status={status} />
                {showRemarksButton && (
                  <div ref={remarksRef} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setRemarksOpen((v) => !v); }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '6px 10px',
                        background: COLORS.primary,
                        color: COLORS.white,
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                      aria-label="View remarks"
                      title="View remarks"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      Remarks
                    </button>
                    {remarksOpen && (
                      <div
                        role="dialog"
                        aria-label="Action remarks"
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          marginTop: 6,
                          minWidth: 200,
                          maxWidth: 320,
                          padding: 12,
                          background: COLORS.white,
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: 8,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          zIndex: 5000,
                          fontSize: 13,
                          color: COLORS.text,
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {actionRemarks}
                      </div>
                    )}
                  </div>
                )}
                </div>
                {(showEndorsementProgress || showEndorsementCount) && (
                  <div style={{
                    fontSize: 12,
                    color: COLORS.textMuted,
                    fontWeight: 500,
                  }}>
                    {showEndorsementProgress
                      ? `${endorsementProgress.endorsed}/${endorsementProgress.required} endorsement`
                      : `Endorsed ${endorsementCount} ${endorsementCount === 1 ? 'time' : 'times'}`}
                  </div>
                )}
              </div>
            </div>
            <div style={{ padding: 20, background: COLORS.white }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Location</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {inTransit ? (
                  <span
                    className="tracker-current-location-pulse-yellow"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '6px 12px',
                      background: '#fef3c7',
                      color: '#92400e',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    In Transit
                  </span>
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>
                    {result.currentLocation || 'Unknown'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Fixed route display - circle timeline like document history */}
          {fixedRoute.length > 0 && (() => {
            const steps = [];
            const first = fixedRoute[0];
            if (first?.issued_by) {
              steps.push({ key: 'issued', label: `Issued by ${first.name}`, tag_id: first.tag_id, isOffice: true, isIssuedBy: true });
            }
            fixedRoute.filter((s) => !s.issued_by).forEach((s) => {
              const sTagId = Number(s.tag_id);
              const fromMatch = inTransitFromTagId != null ? Number(inTransitFromTagId) : null;
              const toMatch = inTransitToTagId != null ? Number(inTransitToTagId) : null;
              const prevTagId = steps.length > 0 ? Number(steps[steps.length - 1].tag_id) : null;
              const fromSeen = fromMatch != null && steps.some((st) => Number(st.tag_id) === fromMatch);
              const insertTransitBeforeTo = inTransit && toMatch != null && toMatch !== 0 && sTagId === toMatch && (prevTagId === fromMatch || fromSeen);
              const insertTransitAfterFrom = inTransit && (toMatch == null || toMatch === 0) && fromMatch != null && sTagId === fromMatch;
              const stepKey = s.wrong_office ? `wrong-${s.tag_id}-${steps.length}` : s.tag_id;
              const label = s.wrong_office ? `${s.name} (wrongly forwarded)` : s.name;
              if (insertTransitAfterFrom) {
                steps.push({ key: stepKey, label, tag_id: s.tag_id, isOffice: true, wrong_office: !!s.wrong_office });
                steps.push({ key: 'transit', label: 'In Transit', isOffice: false, isInTransit: true });
              } else {
                if (insertTransitBeforeTo) {
                  steps.push({ key: 'transit', label: 'In Transit', isOffice: false, isInTransit: true });
                }
                steps.push({ key: stepKey, label, tag_id: s.tag_id, isOffice: true, wrong_office: !!s.wrong_office });
              }
            });

            return (
              <div style={{
                borderTop: `1px solid ${COLORS.border}`,
              }}>
                <button
                  type="button"
                  onClick={() => setRouteExpanded((v) => !v)}
                  style={{
                    width: '100%',
                    padding: '16px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    font: 'inherit',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f9fafb'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                >
                  <span style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: COLORS.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    Document Route
                  </span>
                  <span style={{
                    transform: routeExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                    color: COLORS.textMuted,
                    fontSize: 14,
                  }}>
                    ▼
                  </span>
                </button>
                {routeExpanded && (
                <div style={{ padding: '0 24px 24px 24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {steps.map((step, idx) => {
                    const isCurrent = step.isInTransit
                      ? inTransit
                      : (step.isOffice && !inTransit && currentLocationTagId != null && step.tag_id != null && Number(currentLocationTagId) === Number(step.tag_id));
                    const displayNum = step.isInTransit ? null : steps.slice(0, idx).filter((s) => !s.isInTransit).length + 1;
                    return (
                      <div
                        key={step.key}
                        style={{
                          display: 'flex',
                          gap: 16,
                          paddingBottom: idx < steps.length - 1 ? 20 : 0,
                          position: 'relative',
                        }}
                      >
                        <div
                          className={(step.wrong_office && isCurrent) ? 'tracker-route-circle tracker-route-circle-wrong-pulse' : (isCurrent && !step.wrong_office ? `tracker-route-circle ${step.isInTransit ? 'tracker-route-circle-current-yellow' : 'tracker-route-circle-current'}` : 'tracker-route-circle')}
                          style={{
                            flexShrink: 0,
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: step.wrong_office ? '#dc2626' : (step.isInTransit ? '#f59e0b' : COLORS.primary),
                            border: `3px solid ${COLORS.white}`,
                            boxShadow: '0 0 0 2px #e5e7eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            color: COLORS.white,
                            fontWeight: 600,
                            zIndex: 1,
                          }}
                        >
                          {displayNum ?? ''}
                        </div>
                        {idx < steps.length - 1 && (
                          <div style={{
                            position: 'absolute',
                            left: 13,
                            top: 32,
                            bottom: 0,
                            width: 2,
                            background: steps[idx + 1]?.wrong_office
                              ? '#dc2626'
                              : (inTransit && (step.isInTransit || steps[idx + 1]?.isInTransit))
                                ? '#f59e0b'
                                : COLORS.primary,
                          }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: COLORS.text,
                            lineHeight: 1.4,
                          }}>
                            {step.label}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                </div>
                )}
              </div>
            );
          })()}

          {lastUpdated && (
            <div style={{
              padding: '12px 24px',
              fontSize: 13,
              color: COLORS.textMuted,
              borderTop: `1px solid ${COLORS.border}`,
            }}>
              Last updated: {lastUpdated}
            </div>
          )}

          {/* For fixed route: no document history. For non-routed: show location timeline (circles) only */}
          {fixedRoute.length === 0 && (() => {
            let locationTimeline = result?.locationTimeline ?? [];
            if (locationTimeline.length === 0 && result?.currentLocation) {
              locationTimeline = [{ name: result.currentLocation, tag_id: null, isInTransit: inTransit, isCurrent: true }];
            }
            const endorsementCount = result?.endorsementCount ?? 0;
            if (locationTimeline.length === 0 && endorsementCount === 0) return null;
            return (
              <div style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <div style={{
                  padding: '16px 24px 8px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: COLORS.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Document Route
                </div>
                <div style={{ padding: '0 24px 24px 24px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {locationTimeline.map((step, idx) => {
                      const isCurrent = step.isCurrent;
                      const isInTransit = step.isInTransit;
                      const wrongOffice = step.wrong_office;
                      const circleClass = wrongOffice
                        ? 'tracker-route-circle tracker-route-circle-wrong-pulse'
                        : (isCurrent ? `tracker-route-circle ${isInTransit ? 'tracker-route-circle-current-yellow' : 'tracker-route-circle-current'}` : 'tracker-route-circle');
                      return (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            gap: 16,
                            paddingBottom: idx < locationTimeline.length - 1 ? 20 : 0,
                            position: 'relative',
                          }}
                        >
                          <div
                            className={circleClass}
                            style={{
                              flexShrink: 0,
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              background: wrongOffice ? '#dc2626' : (isInTransit ? '#f59e0b' : COLORS.primary),
                              border: `3px solid ${COLORS.white}`,
                              boxShadow: '0 0 0 2px #e5e7eb',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              color: COLORS.white,
                              fontWeight: 600,
                              zIndex: 1,
                            }}
                          >
                            {idx + 1}
                          </div>
                          {idx < locationTimeline.length - 1 && (
                            <div style={{
                              position: 'absolute',
                              left: 13,
                              top: 32,
                              bottom: 0,
                              width: 2,
                              background: locationTimeline[idx + 1]?.wrong_office
                                ? '#dc2626'
                                : ((isCurrent && isInTransit) || (locationTimeline[idx + 1]?.isCurrent && locationTimeline[idx + 1]?.isInTransit))
                                  ? '#f59e0b'
                                  : COLORS.primary,
                            }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 14,
                              fontWeight: 500,
                              color: COLORS.text,
                              lineHeight: 1.4,
                            }}>
                              {step.name}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {(showFooterClose || onRefresh) && (
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
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                fontSize: 14,
                fontWeight: 500,
                color: '#fff',
                background: isRefreshing ? '#6c757d' : COLORS.primary,
                border: '1px solid transparent',
                borderRadius: 4,
                cursor: isRefreshing ? 'wait' : 'pointer',
              }}
              aria-label="Refresh"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={isRefreshing ? 'tracker-refresh-icon-spin' : ''}
                aria-hidden
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
        </div>
        )}
      </div>
      <style>{`
        .tracker-details-modal {
          transition: box-shadow 0.3s ease;
        }
        .tracker-refresh-icon-spin {
          animation: trackerRefreshSpin 0.8s linear infinite;
        }
        @keyframes trackerRefreshSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .tracker-modal-just-refreshed {
          animation: trackerModalRefreshed 1.2s ease-out;
        }
        @keyframes trackerModalRefreshed {
          0% { box-shadow: 0 8px 40px rgba(0,0,0,0.15), 0 0 0 0 rgba(5, 150, 105, 0.5); }
          20% { box-shadow: 0 8px 40px rgba(0,0,0,0.15), 0 0 0 8px rgba(5, 150, 105, 0.25); }
          100% { box-shadow: 0 8px 40px rgba(0,0,0,0.15), 0 0 0 0 rgba(5, 150, 105, 0); }
        }
        .tracker-modal-body {
          -webkit-overflow-scrolling: touch;
        }
        @media (max-width: 480px) {
          .tracker-details-modal {
            margin: 8px;
            max-height: calc(100vh - 16px);
            max-height: min(calc(100vh - 16px), calc(100dvh - 16px));
          }
          .tracker-status-location-row {
            grid-template-columns: 1fr;
          }
        }
        .tracker-history-circle-current,
        .tracker-route-circle-current {
          animation: trackerCirclePulseBlue 2s ease-in-out infinite;
        }
        .tracker-route-circle-current-yellow {
          animation: trackerCirclePulseYellow 2s ease-in-out infinite;
        }
        .tracker-route-circle-wrong-pulse {
          animation: trackerCirclePulseRed 2s ease-in-out infinite;
        }
        @keyframes trackerCirclePulseRed {
          0%, 100% {
            box-shadow: 0 0 0 2px #e5e7eb;
          }
          50% {
            box-shadow: 0 0 0 4px #dc2626, 0 0 12px rgba(220,38,38,0.4);
          }
        }
        @keyframes trackerCirclePulseBlue {
          0%, 100% {
            box-shadow: 0 0 0 2px #e5e7eb;
          }
          50% {
            box-shadow: 0 0 0 4px #2a5196, 0 0 12px rgba(42,81,150,0.35);
          }
        }
        @keyframes trackerCirclePulseYellow {
          0%, 100% {
            box-shadow: 0 0 0 2px #e5e7eb;
          }
          50% {
            box-shadow: 0 0 0 4px #f59e0b, 0 0 12px rgba(245,158,11,0.4);
          }
        }
        .tracker-current-location-pulse-yellow {
          animation: trackerLocationPulseYellow 2s ease-in-out infinite;
        }
        @keyframes trackerLocationPulseYellow {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(245,158,11,0.5);
          }
          50% {
            box-shadow: 0 0 16px 4px rgba(245,158,11,0.35);
          }
        }
      `}</style>
    </div>
  );
}

export default TrackerDetailsModal;
