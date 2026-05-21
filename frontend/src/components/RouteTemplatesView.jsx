import React, { useState, useEffect, useCallback } from 'react';
import { apiCall } from '../services/api.js';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/uiConstants.js';
import ConfirmationModal from './modals/ConfirmationModal.jsx';
import AddOutlineButton from './ui/AddOutlineButton.jsx';

/**
 * RouteTemplatesView Component
 *
 * Allows offices with fixed routing to create and manage release route templates.
 * Templates can be applied when releasing documents.
 */
function RouteTemplatesView({ tagInfo, allTags = [] }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newName, setNewName] = useState('');
  const [newRoute, setNewRoute] = useState([null]);
  const [newRouteCanTakeAction, setNewRouteCanTakeAction] = useState(new Set());
  const [newRouteNeedEndorsement, setNewRouteNeedEndorsement] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [removeCanTakeActionConfirm, setRemoveCanTakeActionConfirm] = useState(null); // { idx } when showing confirm
  const [deleteTemplateId, setDeleteTemplateId] = useState(null); // id when showing delete confirm

  const otherTags = (allTags?.results ?? allTags ?? []).filter(
    (t) => t && (t.id ?? t.pk) !== tagInfo?.id
  );
  const tagIdToName = Object.fromEntries(
    (allTags?.results ?? allTags ?? []).map((t) => [(t.id ?? t.pk), t.name ?? `Office ${t.id ?? t.pk}`])
  );

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiCall('/api/route-templates');
      setTemplates(data?.templates ?? []);
    } catch (err) {
      setError(err.message || 'Failed to load templates');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tagInfo?.fixedRoutingEnabled && tagInfo?.id) fetchTemplates();
  }, [tagInfo?.fixedRoutingEnabled, tagInfo?.id, fetchTemplates]);

  const handleAddStep = () => {
    setNewRoute((prev) => {
      const next = [...prev.slice(0, 10), null].slice(0, 10);
      if (!editingId) setNewRouteCanTakeAction(new Set([next.length - 1]));
      return next;
    });
  };

  const handleRemoveStep = (idx) => {
    setNewRoute((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      const lastSlotIdx = next.length > 0 ? next.length - 1 : -1;
      if (!editingId && lastSlotIdx >= 0) setNewRouteCanTakeAction(new Set([lastSlotIdx]));
      return next;
    });
    // Shift endorsement indices: remove idx, decrement indices > idx
    setNewRouteNeedEndorsement((prev) => {
      const next = new Set();
      prev.forEach((i) => {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      });
      return next;
    });
    // When editing, shift canTake indices too
    if (editingId) {
      setNewRouteCanTakeAction((prev) => {
        const next = new Set();
        prev.forEach((i) => {
          if (i < idx) next.add(i);
          else if (i > idx) next.add(i - 1);
        });
        return next;
      });
    }
  };

  const handleRouteChange = (idx, tagId) => {
    setNewRoute((prev) => {
      const next = [...prev];
      next[idx] = tagId ? parseInt(tagId, 10) : null;
      return next;
    });
  };

  const handleCanTakeActionToggle = (idx) => {
    const lastSlotIdx = newRoute.length > 0 ? newRoute.length - 1 : -1;
    const checked = newRouteCanTakeAction.has(idx);
    if (checked && idx === lastSlotIdx) {
      setRemoveCanTakeActionConfirm({ idx });
      return;
    }
    doCanTakeActionToggle(idx);
  };

  const doCanTakeActionToggle = (idx) => {
    setNewRouteCanTakeAction((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setNewName(t.name ?? '');
    const seq = (t.route_sequence ?? []).filter((id) => id != null);
    setNewRoute(seq.length > 0 ? seq : [null]);
    const canTake = (t.route_can_take_action ?? []).map((x) => parseInt(x, 10));
    const canTakeSet = new Set();
    seq.forEach((tid, i) => {
      if (canTake.length > 0 ? canTake.includes(tid) : i === seq.length - 1) canTakeSet.add(i);
    });
    setNewRouteCanTakeAction(canTakeSet);
    const needEnd = (t.route_need_endorsement ?? []).map((x) => parseInt(x, 10));
    const needEndSet = new Set();
    seq.forEach((tid, i) => {
      if (needEnd.includes(tid)) needEndSet.add(i);
    });
    setNewRouteNeedEndorsement(needEndSet);
    setShowForm(true);
    setError(null);
  };

  const cancelForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setNewName('');
    setNewRoute([null]);
    setNewRouteCanTakeAction(new Set());
    setNewRouteNeedEndorsement(new Set());
    setError(null);
  }, []);

  const requestCloseModal = useCallback(() => {
    if (saving) return;
    cancelForm();
  }, [saving, cancelForm]);

  useEffect(() => {
    if (!showForm) return;
    const onKey = (e) => {
      if (e.key === 'Escape') requestCloseModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showForm, requestCloseModal]);

  const handleSave = async (e) => {
    e?.preventDefault();
    const name = newName?.trim();
    const sequence = newRoute.filter((id) => id != null);
    if (!name || sequence.length === 0) {
      setError('Name and at least one office are required.');
      return;
    }
    const canTakeAction = newRoute.map((id, i) => newRouteCanTakeAction.has(i) && id != null ? id : null).filter((x) => x != null);
    const needEndorsement = newRoute.map((id, i) => newRouteNeedEndorsement.has(i) && id != null ? id : null).filter((x) => x != null);
    const body = { name, route_sequence: sequence };
    if (canTakeAction.length > 0) body.route_can_take_action = canTakeAction;
    if (needEndorsement.length > 0) body.route_need_endorsement = needEndorsement;
    try {
      setSaving(true);
      setError(null);
      if (editingId) {
        await apiCall(`/api/route-templates/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiCall('/api/route-templates', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      cancelForm();
      fetchTemplates();
    } catch (err) {
      setError(err.message || (editingId ? 'Failed to update template' : 'Failed to create template'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    setDeleteTemplateId(id);
  };

  const doDeleteTemplate = async () => {
    const id = deleteTemplateId;
    if (!id) return;
    setDeleteTemplateId(null);
    try {
      await apiCall(`/api/route-templates/${id}`, { method: 'DELETE' });
      fetchTemplates();
    } catch (err) {
      setError(err.message || 'Failed to delete template');
    }
  };

  const RouteStep = ({ label, isLast }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        display: 'inline-flex',
        padding: '4px 10px',
        borderRadius: BORDER_RADIUS.LG,
        background: COLORS.BG_SECONDARY,
        fontSize: 13,
        fontWeight: 500,
        color: COLORS.TEXT_SECONDARY,
      }}>
        {label}
      </span>
      {!isLast && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.TEXT_MUTED} strokeWidth="2" style={{ flexShrink: 0 }}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      )}
    </span>
  );

  if (!tagInfo?.fixedRoutingEnabled) {
    return (
      <div style={{
        padding: '0 12px',
        maxWidth: 1440,
        width: '100%',
        boxSizing: 'border-box',
      }}>
        <div style={{
          padding: SPACING.XL,
          background: COLORS.BG_SECONDARY,
          borderRadius: BORDER_RADIUS.LG,
          color: COLORS.TEXT_MUTED,
          fontSize: 14,
          maxWidth: 420,
        }}>
        Fixed routing is not enabled for your office. Contact admin to enable it.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 12px 32px', maxWidth: 1440, width: '100%', margin: 0, boxSizing: 'border-box' }}>
      <header
        style={{
          marginBottom: SPACING.XL,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
        }}
      >
        <div style={{ minWidth: 'min(100%, 280px)', flex: '1 1 320px' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: '#0f172a' }}>
            Release route templates
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
            Create reusable routes to apply when releasing documents.
          </p>
        </div>
        {!loading && (
          <AddOutlineButton
            type="button"
            disabled={showForm}
            onClick={() => {
              setEditingId(null);
              setNewName('');
              setNewRoute([null]);
              setNewRouteCanTakeAction(new Set([0]));
              setNewRouteNeedEndorsement(new Set());
              setShowForm(true);
              setError(null);
            }}
          >
            New template
          </AddOutlineButton>
        )}
      </header>

      {error && !showForm && (
        <div style={{
          marginBottom: SPACING.MD,
          padding: SPACING.MD,
          background: '#fef2f2',
          color: COLORS.ERROR,
          borderRadius: BORDER_RADIUS.LG,
          fontSize: 14,
          border: `1px solid ${COLORS.ERROR}20`,
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.SM, color: COLORS.TEXT_MUTED, fontSize: 14 }}>
          <span style={{ width: 20, height: 20, border: `2px solid ${COLORS.BORDER_LIGHT}`, borderTopColor: COLORS.PRIMARY, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Loading templates…
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACING.MD, marginBottom: SPACING.XL }}>
            {templates.map((t) => (
              <div
                key={t.id}
                style={{
                  flex: '1 1 280px',
                  minWidth: 0,
                  padding: SPACING.LG,
                  background: COLORS.BG_PRIMARY,
                  border: `1px solid ${COLORS.BORDER_LIGHT}`,
                  borderRadius: BORDER_RADIUS.XL,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  transition: 'box-shadow 0.2s, border-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(42,81,150,0.12)';
                  e.currentTarget.style.borderColor = `${COLORS.PRIMARY}40`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
                  e.currentTarget.style.borderColor = COLORS.BORDER_LIGHT;
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.SM }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.TEXT_SECONDARY }}>{t.name}</span>
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => startEdit(t)}
                      aria-label="Edit template"
                      style={{
                        padding: 6,
                        background: 'transparent',
                        border: 'none',
                        borderRadius: BORDER_RADIUS.MD,
                        cursor: 'pointer',
                        color: COLORS.TEXT_MUTED,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = COLORS.BG_SECONDARY;
                        e.currentTarget.style.color = COLORS.PRIMARY;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = COLORS.TEXT_MUTED;
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      aria-label="Delete template"
                    style={{
                      padding: 6,
                      background: 'transparent',
                      border: 'none',
                      borderRadius: BORDER_RADIUS.MD,
                      cursor: 'pointer',
                      color: COLORS.TEXT_MUTED,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#fef2f2';
                      e.currentTarget.style.color = COLORS.ERROR;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = COLORS.TEXT_MUTED;
                    }}
                  >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                  {(t.route_sequence ?? []).map((id, i) => (
                    <RouteStep
                      key={`${t.id}-${i}`}
                      label={tagIdToName[id] ?? `Office ${id}`}
                      isLast={i === (t.route_sequence?.length ?? 0) - 1}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {templates.length === 0 && !showForm && (
            <div style={{
              marginBottom: SPACING.XL,
              padding: SPACING.XXL,
              background: COLORS.BG_SECONDARY,
              borderRadius: BORDER_RADIUS.XL,
              textAlign: 'center',
              color: COLORS.TEXT_MUTED,
              fontSize: 14,
            }}>
              No templates yet. Use <strong style={{ color: '#64748b' }}>New template</strong> above to create one.
            </div>
          )}
        </>
      )}

      {showForm && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 4100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            boxSizing: 'border-box',
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) requestCloseModal();
          }}
        >
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="route-template-modal-title"
            style={{
              background: '#fff',
              borderRadius: 6,
              boxShadow: '0 0.5rem 1rem rgba(0, 0, 0, 0.15)',
              width: '100%',
              maxWidth: 720,
              maxHeight: 'min(90vh, 100%)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid rgba(0,0,0,0.1)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form
              onSubmit={handleSave}
              style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
            >
              <div
                className="modal-header"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  borderBottom: '1px solid #dee2e6',
                  flexShrink: 0,
                }}
              >
                <h4
                  id="route-template-modal-title"
                  className="modal-title"
                  style={{ margin: 0, fontSize: 18, fontWeight: 600, color: COLORS.PRIMARY }}
                >
                  {editingId ? 'Edit route template' : 'Create new route template'}
                </h4>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  disabled={saving}
                  onClick={requestCloseModal}
                  style={{
                    padding: 0,
                    margin: 0,
                    width: 32,
                    height: 32,
                    border: 'none',
                    background: 'transparent',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    borderRadius: 4,
                    fontSize: 22,
                    lineHeight: 1,
                    color: '#6c757d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ×
                </button>
              </div>

              <div className="modal-body" style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                <div style={{ marginBottom: SPACING.LG }}>
                  <label
                    htmlFor="route-template-name"
                    style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 8 }}
                  >
                    Template name
                  </label>
                  <input
                    id="route-template-name"
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Standard approval route"
                    maxLength={128}
                    disabled={saving}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: 14,
                      border: `1px solid ${COLORS.BORDER_LIGHT}`,
                      borderRadius: BORDER_RADIUS.LG,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ marginBottom: SPACING.LG }}>
                  <div style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 8 }}>
                    Route (offices in order)
                  </div>
                  <p style={{ fontSize: 13, color: '#6c757d', margin: '0 0 10px', lineHeight: 1.45 }}>
                    Check offices that can approve or reject documents. Check offices that must endorse before action can be taken. The last office usually takes action.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.SM }}>
                    {newRoute.slice(0, 10).map((selectedId, idx) => {
                      const checked = newRouteCanTakeAction.has(idx);
                      const checkedNeedEndorsement = newRouteNeedEndorsement.has(idx);
                      return (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: SPACING.SM,
                            alignItems: 'center',
                          }}
                        >
                          <span style={{
                            flexShrink: 0,
                            width: 28,
                            height: 28,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '50%',
                            background: COLORS.PRIMARY,
                            color: '#fff',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                          >
                            {idx + 1}
                          </span>
                          <select
                            value={selectedId ?? ''}
                            onChange={(e) => handleRouteChange(idx, e.target.value)}
                            disabled={saving}
                            style={{
                              flex: '1 1 200px',
                              minWidth: 160,
                              padding: '10px 14px',
                              fontSize: 14,
                              border: `1px solid ${COLORS.BORDER_LIGHT}`,
                              borderRadius: BORDER_RADIUS.LG,
                              boxSizing: 'border-box',
                            }}
                          >
                            <option value="">Select office…</option>
                            {otherTags.map((t) => {
                              const tid = t.id ?? t.pk;
                              return (
                                <option key={tid} value={tid}>
                                  {t.name ?? `Office ${tid}`}
                                </option>
                              );
                            })}
                          </select>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap', cursor: saving ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleCanTakeActionToggle(idx)}
                              disabled={saving}
                              style={{ margin: 0 }}
                            />
                            Can take action
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap', cursor: saving ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
                            <input
                              type="checkbox"
                              checked={checkedNeedEndorsement}
                              onChange={() => {
                                setNewRouteNeedEndorsement((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(idx)) next.delete(idx);
                                  else next.add(idx);
                                  return next;
                                });
                              }}
                              disabled={saving}
                              style={{ margin: 0 }}
                            />
                            Need endorsement
                          </label>
                          {newRoute.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveStep(idx)}
                              disabled={saving}
                              style={{
                                padding: '8px 12px',
                                fontSize: 13,
                                color: COLORS.TEXT_MUTED,
                                background: COLORS.BG_SECONDARY,
                                border: 'none',
                                borderRadius: BORDER_RADIUS.MD,
                                cursor: saving ? 'not-allowed' : 'pointer',
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {newRoute.length < 10 && otherTags.length > newRoute.filter(Boolean).length && (
                    <button
                      type="button"
                      onClick={handleAddStep}
                      disabled={saving}
                      style={{
                        marginTop: SPACING.SM,
                        padding: '10px 16px',
                        fontSize: 14,
                        color: COLORS.PRIMARY,
                        background: 'transparent',
                        border: `2px dashed ${COLORS.PRIMARY}60`,
                        borderRadius: BORDER_RADIUS.LG,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      + Add office
                    </button>
                  )}
                </div>
                {error && (
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#b91c1c', lineHeight: 1.45 }}>{error}</p>
                )}
              </div>

              <div
                className="modal-footer"
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 20px',
                  borderTop: '1px solid #dee2e6',
                  flexShrink: 0,
                  background: '#fff',
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={saving}
                  onClick={requestCloseModal}
                  style={{
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#6c757d',
                    background: '#fff',
                    border: '1px solid #6c757d',
                    borderRadius: 4,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving || !newName?.trim() || newRoute.every((id) => id == null)}
                  style={{
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#fff',
                    background: saving || !newName?.trim() || newRoute.every((id) => id == null) ? '#94a3b8' : '#2a5196',
                    border: '1px solid transparent',
                    borderRadius: 4,
                    cursor: saving || !newName?.trim() || newRoute.every((id) => id == null) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Saving…' : (editingId ? 'Save changes' : 'Create template')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={removeCanTakeActionConfirm != null}
        title="Remove from offices that can take action?"
        message="The last office in the route usually takes action on documents. Are you sure you want to remove it from offices that can take action?"
        confirmLabel="Yes, remove"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (removeCanTakeActionConfirm != null) {
            doCanTakeActionToggle(removeCanTakeActionConfirm.idx);
            setRemoveCanTakeActionConfirm(null);
          }
        }}
        onCancel={() => setRemoveCanTakeActionConfirm(null)}
      />

      <ConfirmationModal
        open={deleteTemplateId != null}
        title="Delete template?"
        message="Are you sure you want to delete this template? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={() => doDeleteTemplate()}
        onCancel={() => setDeleteTemplateId(null)}
      />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default RouteTemplatesView;
