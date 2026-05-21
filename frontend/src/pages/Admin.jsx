import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { sessionManager } from '../services/session.js';
import { useConnectionState } from '../hooks/index.js';
import { apiCall } from '../services/api.js';
import { Header, Footer, AdminSidebar, DataManagementSettings, StaffDocumentLookupModal, AdminOfficesView } from '../components/index.js';
import ConfirmationModal from '../components/modals/ConfirmationModal.jsx';
import { API_ENDPOINTS, setTrackingCodeFieldId } from '../constants/index.js';
import { clearCustomFieldsCache } from '../services/customFields.js';
import DashboardActivityLineChart from '../components/document/DashboardActivityLineChart.jsx';
import { KPI_CARD_FLEX } from '../components/document/dashboardKpi.js';
import { DASHBOARD_STAT_ICONS } from '../components/document/dashboardStatIcons.jsx';
import { DashboardSimpleStatCard, DashboardInsightRow } from '../components/document/dashboardShared.jsx';
import { COLORS, SPACING, STATUS_MIX_ARCHIVE, BORDER_RADIUS } from '../constants/uiConstants.js';
import AddOutlineButton from '../components/ui/AddOutlineButton.jsx';

function mapAdminDailyActivityToChartData(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(({ date, count }) => {
    const parts = String(date).split('-').map(Number);
    const [y, m, d] = parts;
    if (parts.length !== 3 || !y) {
      return { date: String(date), count: Number(count) || 0, label: String(date) };
    }
    const dt = new Date(y, m - 1, d);
    const label = isNaN(dt.getTime())
      ? String(date)
      : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return { date: String(date), count: Number(count) || 0, label };
  });
}

function filterAdminDailyChartRows(rows, dateFrom, dateTo) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  let out = rows;
  if (dateFrom) out = out.filter((r) => String(r.date) >= dateFrom);
  if (dateTo) out = out.filter((r) => String(r.date) <= dateTo);
  return out;
}

const OFFICE_SETTINGS_TABS = [
  { id: 'general', title: 'General' },
  { id: 'permissions', title: 'Permissions' },
];

/**
 * Office View - displays office details, tracking code prefix, and option to remove
 */
function OfficeView({ tag, tagId, onRemove, onSaveSuccess }) {
  const saveInProgressRef = useRef(false);
  const [activeOfficeTab, setActiveOfficeTab] = useState('general');
  const [removing, setRemoving] = useState(false);
  const [officeName, setOfficeName] = useState(tag?.name ?? '');
  const [prefix, setPrefix] = useState('');
  const [canApproveReject, setCanApproveReject] = useState(false);
  const [fixedRoutingEnabled, setFixedRoutingEnabled] = useState(false);
  const [allowEndorse, setAllowEndorse] = useState(true);
  const [canUploadDocuments, setCanUploadDocuments] = useState(true);
  const [prefixSaving, setPrefixSaving] = useState(false);
  const [prefixLoaded, setPrefixLoaded] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  useEffect(() => {
    setOfficeName(tag?.name ?? '');
  }, [tag?.name]);

  useEffect(() => {
    setActiveOfficeTab('general');
  }, [tag?.name, tagId]);

  useEffect(() => {
    if (!tag?.name) return;
    const load = async () => {
      try {
        const data = await apiCall(`/api/auth/offices/${encodeURIComponent(tag.name)}`);
        setOfficeName(data?.name ?? tag.name);
        setPrefix(data?.tracking_code_prefix ?? 'TRK');
        setCanApproveReject(!!data?.can_approve_reject);
        setFixedRoutingEnabled(!!data?.fixed_routing_enabled);
        setAllowEndorse(data?.allow_endorse !== false);
        setCanUploadDocuments(data?.can_upload_documents !== false);
      } catch {
        setOfficeName(tag?.name ?? '');
        setPrefix('TRK');
        setCanApproveReject(false);
        setFixedRoutingEnabled(false);
        setAllowEndorse(true);
        setCanUploadDocuments(true);
      } finally {
        setPrefixLoaded(true);
      }
    };
    load();
  }, [tag?.name]);

  const performSave = async () => {
    if (!tag?.name && !tagId) return;
    if (saveInProgressRef.current || prefixSaving) return;
    saveInProgressRef.current = true;
    setShowSaveConfirm(false);
    setPrefixSaving(true);
    const newName = (officeName?.trim() || tag?.name || '').trim();
    try {
      const res = await apiCall(`/api/auth/offices/${encodeURIComponent(tag.name)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: newName || tag.name,
          tracking_code_prefix: prefix.trim() || 'TRK',
          can_approve_reject: canApproveReject,
          fixed_routing_enabled: fixedRoutingEnabled,
          allow_endorse: allowEndorse,
          can_upload_documents: canUploadDocuments,
        }),
      });
      if (res?.name) setOfficeName(res.name);
      if (typeof onSaveSuccess === 'function') onSaveSuccess();
    } catch (err) {
      const isNotFound = err?.message?.includes('404') || err?.message?.toLowerCase().includes('not found');
      if (isNotFound && newName && tagId) {
        try {
          await apiCall(`/api/tags/${tagId}/`, {
            method: 'PATCH',
            body: JSON.stringify({ name: newName }),
          });
          setOfficeName(newName);
          if (typeof onSaveSuccess === 'function') onSaveSuccess();
        } catch (e2) {
          setShowSaveConfirm(false);
          alert(e2.message || 'Failed to rename tag');
        }
      } else {
        setShowSaveConfirm(false);
        alert(err.message || 'Failed to save');
      }
    } finally {
      saveInProgressRef.current = false;
      setPrefixSaving(false);
    }
  };

  const performRemove = async () => {
    setShowRemoveConfirm(false);
    setRemoving(true);
    try {
      await onRemove(tag);
    } catch (err) {
      alert(err.message || 'Failed to remove office');
    } finally {
      setRemoving(false);
    }
  };

  const inputBase = {
    padding: '10px 12px',
    fontSize: 14,
    width: '100%',
    maxWidth: '100%',
    border: `1px solid ${COLORS.BORDER_LIGHT}`,
    borderRadius: 8,
    boxSizing: 'border-box',
  };

  const renderOfficeTabContent = () => {
    if (activeOfficeTab === 'general') {
      return (
        <div className="office-settings-panel" id="office-settings-identity">
          <div id="office-settings-name">
            <h2>Office name</h2>
            <p className="office-settings-muted">Shown wherever this office appears in DTS.</p>
            {prefixLoaded && (
              <input
                type="text"
                value={officeName}
                onChange={(e) => setOfficeName(e.target.value)}
                placeholder="e.g. PGIN - Receiving Office"
                maxLength={128}
                style={inputBase}
              />
            )}
          </div>

          <div id="office-settings-prefix" style={{ marginTop: SPACING.LG, paddingTop: SPACING.LG, borderTop: `1px solid ${COLORS.BG_SECONDARY}` }}>
            <h2>Tracking code prefix</h2>
            <p className="office-settings-muted">
              New uploads use{' '}
              <strong>
                {prefix || 'TRK'}-{new Date().getFullYear()}-00001
              </strong>{' '}
              (incremental per office).
            </p>
            {prefixLoaded && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="TRK"
                  maxLength={32}
                  style={{ ...inputBase, maxWidth: 140 }}
                />
              </div>
            )}
          </div>
        </div>
      );
    }
    if (activeOfficeTab === 'permissions') {
      return (
        <div className="office-settings-panel" id="office-settings-permissions">
          <h2>Permissions</h2>
          <p className="office-settings-muted" style={{ marginBottom: SPACING.MD }}>
            What users at this office can do in DTS.
          </p>
          {!prefixLoaded && <p style={{ margin: 0, fontSize: 14, color: '#94a3b8' }}>Loading…</p>}
          {prefixLoaded && (
            <>
              <div id="office-settings-status" className="office-settings-perm-row">
                <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Approve &amp; reject</div>
                <p className="office-settings-muted" style={{ marginBottom: 10 }}>
                  Workflow status (Under Review, Needs Action, Approved, Rejected).
                </p>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={canApproveReject}
                    onChange={(e) => setCanApproveReject(e.target.checked)}
                    style={{ width: 18, height: 18, marginTop: 2, accentColor: COLORS.PRIMARY }}
                  />
                  <span style={{ fontSize: 14, color: '#374151' }}>Allow approve and reject</span>
                </label>
              </div>
              <div id="office-settings-routing" className="office-settings-perm-row">
                <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Fixed routing</div>
                <p className="office-settings-muted" style={{ marginBottom: 10 }}>
                  Define a fixed route when releasing (offices the document must visit).
                </p>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={fixedRoutingEnabled}
                    onChange={(e) => setFixedRoutingEnabled(e.target.checked)}
                    style={{ width: 18, height: 18, marginTop: 2, accentColor: COLORS.PRIMARY }}
                  />
                  <span style={{ fontSize: 14, color: '#374151' }}>Enable on release</span>
                </label>
              </div>
              <div id="office-settings-endorse" className="office-settings-perm-row">
                <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Endorsement</div>
                <p className="office-settings-muted" style={{ marginBottom: 10 }}>
                  Endorsement remarks in the document viewer.
                </p>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={allowEndorse}
                    onChange={(e) => setAllowEndorse(e.target.checked)}
                    style={{ width: 18, height: 18, marginTop: 2, accentColor: COLORS.PRIMARY }}
                  />
                  <span style={{ fontSize: 14, color: '#374151' }}>Allow endorsement</span>
                </label>
              </div>
              <div id="office-settings-upload" className="office-settings-perm-row">
                <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Upload documents</div>
                <p className="office-settings-muted" style={{ marginBottom: 10 }}>
                  Allow this office to upload new documents.
                </p>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={canUploadDocuments}
                    onChange={(e) => setCanUploadDocuments(e.target.checked)}
                    style={{ width: 18, height: 18, marginTop: 2, accentColor: COLORS.PRIMARY }}
                  />
                  <span style={{ fontSize: 14, color: '#374151' }}>Allow uploads</span>
                </label>
              </div>
            </>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <div className="office-settings-page settings-view-shell">
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ color: COLORS.TEXT_PRIMARY, fontSize: 24, margin: 0, fontWeight: 700 }}>
            Office: {officeName || tag?.name || 'Office'}
          </h1>
        </div>

        <div role="tablist" aria-label="Office settings sections" className="settings-nav-tabs">
          {OFFICE_SETTINGS_TABS.map(({ id, title }) => {
            const isActive = activeOfficeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`office-settings-tab-${id}`}
                aria-selected={isActive}
                aria-controls="office-settings-panel-main"
                tabIndex={isActive ? 0 : -1}
                className={`settings-tab-btn${isActive ? ' active' : ''}`}
                onClick={() => setActiveOfficeTab(id)}
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
                  e.preventDefault();
                  const idx = OFFICE_SETTINGS_TABS.findIndex((t) => t.id === activeOfficeTab);
                  let nextIdx = idx;
                  if (e.key === 'ArrowRight') nextIdx = Math.min(idx + 1, OFFICE_SETTINGS_TABS.length - 1);
                  else if (e.key === 'ArrowLeft') nextIdx = Math.max(idx - 1, 0);
                  else if (e.key === 'Home') nextIdx = 0;
                  else if (e.key === 'End') nextIdx = OFFICE_SETTINGS_TABS.length - 1;
                  const next = OFFICE_SETTINGS_TABS[nextIdx];
                  setActiveOfficeTab(next.id);
                  requestAnimationFrame(() => {
                    document.getElementById(`office-settings-tab-${next.id}`)?.focus();
                  });
                }}
              >
                {title}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id="office-settings-panel-main"
          aria-labelledby={`office-settings-tab-${activeOfficeTab}`}
          className="settings-tab-content"
        >
          {renderOfficeTabContent()}
        </div>

        <div id="office-settings-actions" className="office-settings-actions-bar">
          <button
            type="button"
            onClick={() => setShowSaveConfirm(true)}
            disabled={prefixSaving}
            style={{
              padding: '10px 22px',
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
              background: COLORS.PRIMARY,
              border: 'none',
              borderRadius: 8,
              cursor: prefixSaving ? 'not-allowed' : 'pointer',
              opacity: prefixSaving ? 0.7 : 1,
            }}
          >
            {prefixSaving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setShowRemoveConfirm(true)}
            disabled={removing}
            style={{
              padding: '10px 22px',
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
              background: COLORS.ERROR,
              border: 'none',
              borderRadius: 8,
              cursor: removing ? 'not-allowed' : 'pointer',
              opacity: removing ? 0.7 : 1,
            }}
          >
            {removing ? 'Removing…' : 'Remove office'}
          </button>
        </div>
      </div>

      <ConfirmationModal
        open={showSaveConfirm}
        title="Save changes"
        message={`Save tracking code prefix and settings for ${tag?.name ?? 'this office'}?`}
        confirmLabel={prefixSaving ? 'Saving…' : 'Save'}
        cancelLabel="Cancel"
        onConfirm={() => performSave()}
        onCancel={() => setShowSaveConfirm(false)}
      />

      <ConfirmationModal
        open={showRemoveConfirm}
        title="Remove office"
        message={`Remove ${tag?.name ?? 'this office'}? This cannot be undone.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        danger
        onConfirm={() => performRemove()}
        onCancel={() => setShowRemoveConfirm(false)}
      />
    </>
  );
}

const addOfficeInputStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  border: '1px solid #ced4da',
  borderRadius: 4,
  boxSizing: 'border-box',
  outline: 'none',
};

/** Add office — Paperless-style modal (create tag + staff login). */
function AddOfficeModal({ open, onSuccess, onClose }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [color, setColor] = useState('#2a5196');
  const [canApproveReject, setCanApproveReject] = useState(false);
  const [canUploadDocuments, setCanUploadDocuments] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setUsername('');
    setPassword('');
    setColor('#2a5196');
    setCanApproveReject(false);
    setCanUploadDocuments(true);
    setError(null);
    setSubmitting(false);
  }, [open]);

  const tryClose = useCallback(() => {
    if (submitting) return;
    onClose?.();
  }, [submitting, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') tryClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, tryClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Office name is required');
      return;
    }
    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (!password || password.length < 4) {
      setError('Password is required (min 4 characters)');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const tag = await apiCall('/api/tags/', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          match: '',
          matching_algorithm: 0,
          is_insensitive: true,
          is_inbox_tag: false,
          color: color || '#2a5196',
        }),
      });
      await apiCall('/api/auth/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim(),
          password,
          tag_id: tag.id,
          can_approve_reject: canApproveReject,
          can_upload_documents: canUploadDocuments,
        }),
      });
      onSuccess?.(tag);
    } catch (err) {
      setError(err.message || 'Failed to add office');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
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
        if (e.target === e.currentTarget) tryClose();
      }}
    >
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-office-modal-title"
        style={{
          background: '#fff',
          borderRadius: 6,
          boxShadow: '0 0.5rem 1rem rgba(0, 0, 0, 0.15)',
          width: '100%',
          maxWidth: 500,
          maxHeight: 'min(90vh, 100%)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid rgba(0,0,0,0.1)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <form
          noValidate
          autoComplete="off"
          onSubmit={handleSubmit}
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
              id="add-office-modal-title"
              className="modal-title"
              style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#212529' }}
            >
              Create new office
            </h4>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              disabled={submitting}
              onClick={tryClose}
              style={{
                padding: 0,
                margin: 0,
                width: 32,
                height: 32,
                border: 'none',
                background: 'transparent',
                cursor: submitting ? 'not-allowed' : 'pointer',
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
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#495057', lineHeight: 1.5 }}>
              Creates a Paperless tag for this office and the username/password staff use to sign in.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label" htmlFor="add-office-name" style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 8 }}>
                  Office name
                </label>
                <input
                  id="add-office-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. PGIN - Receiving Office"
                  disabled={submitting}
                  className="form-control"
                  style={addOfficeInputStyle}
                  autoFocus
                />
              </div>
              <div>
                <label className="form-label" htmlFor="add-office-username" style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 8 }}>
                  Username
                </label>
                <input
                  id="add-office-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. pgin-receiving"
                  disabled={submitting}
                  className="form-control"
                  style={addOfficeInputStyle}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="add-office-password" style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 8 }}>
                  Password
                </label>
                <input
                  id="add-office-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 4 characters"
                  minLength={4}
                  disabled={submitting}
                  className="form-control"
                  style={addOfficeInputStyle}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="add-office-color" style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 8 }}>
                  Color
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    id="add-office-color"
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    disabled={submitting}
                    style={{ width: 52, height: 36, padding: 2, border: '1px solid #ced4da', borderRadius: 4, cursor: submitting ? 'not-allowed' : 'pointer' }}
                  />
                  <span style={{ fontSize: 13, color: '#6c757d' }}>{color}</span>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: submitting ? 'not-allowed' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={canApproveReject}
                  onChange={(e) => setCanApproveReject(e.target.checked)}
                  disabled={submitting}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontSize: 14, color: '#212529' }}>Can approve and reject documents</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: submitting ? 'not-allowed' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={canUploadDocuments}
                  onChange={(e) => setCanUploadDocuments(e.target.checked)}
                  disabled={submitting}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontSize: 14, color: '#212529' }}>Can upload documents</span>
              </label>
            </div>
            {error && <p style={{ margin: '14px 0 0', fontSize: 13, color: '#b91c1c', lineHeight: 1.45 }}>{error}</p>}
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
              disabled={submitting}
              onClick={tryClose}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                fontWeight: 500,
                color: '#6c757d',
                background: '#fff',
                border: '1px solid #6c757d',
                borderRadius: 4,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                fontWeight: 500,
                color: '#fff',
                background: submitting ? '#94a3b8' : '#2a5196',
                border: '1px solid transparent',
                borderRadius: 4,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TrackingCodeSettings() {
  const [status, setStatus] = useState('loading'); // 'loading' | 'exists' | 'missing' | 'creating' | 'error'
  const [fieldId, setFieldId] = useState(null);
  const [error, setError] = useState(null);

  const checkField = useCallback(async () => {
    setError(null);
    setStatus('loading');
    try {
      const data = await apiCall(API_ENDPOINTS.CUSTOM_FIELDS);
      const fields = Array.isArray(data?.results) ? data.results : (data ? [data] : []);
      const tracking = fields.find((f) => (f.name || '').toLowerCase() === 'tracking code');
      if (tracking) {
        setFieldId(tracking.id);
        setTrackingCodeFieldId(tracking.id);
        setStatus('exists');
      } else {
        setStatus('missing');
      }
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Failed to fetch custom fields');
    }
  }, []);

  useEffect(() => {
    checkField();
  }, [checkField]);

  const createField = async () => {
    setError(null);
    setStatus('creating');
    try {
      const created = await apiCall(API_ENDPOINTS.CUSTOM_FIELDS, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Tracking Code',
          data_type: 'string',
        }),
      });
      const id = created?.id ?? created?.pk;
      if (id != null) {
        setFieldId(id);
        setTrackingCodeFieldId(id);
        setStatus('exists');
        clearCustomFieldsCache();
      } else {
        setStatus('error');
        setError('Field created but ID not found');
      }
    } catch (err) {
      setStatus('missing');
      setError(err.message || 'Failed to create tracking code field');
    }
  };

  return (
    <div>
      <h2 style={{ color: '#374151', fontSize: 18, margin: '0 0 8px 0' }}>Tracking Code Feature</h2>
      <p style={{ color: '#6c757d', fontSize: 14, margin: '0 0 16px 0' }}>
        When enabled, uploaded documents will prompt for a tracking code.
      </p>
      {status === 'loading' && (
        <p style={{ color: '#6c757d', fontSize: 14 }}>Checking custom fields…</p>
      )}
      {status === 'exists' && (
        <p style={{ color: '#22c55e', fontSize: 14, fontWeight: 500 }}>
          Tracking code field is configured (ID: {fieldId}).
        </p>
      )}
      {status === 'missing' && (
        <div>
          <p style={{ color: '#6c757d', fontSize: 14, marginBottom: 12 }}>Tracking code custom field not found.</p>
          <button
            type="button"
            onClick={createField}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              color: '#fff',
              background: '#2a5196',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            Add Tracking Code Field
          </button>
        </div>
      )}
      {status === 'creating' && (
        <p style={{ color: '#6c757d', fontSize: 14 }}>Creating tracking code field…</p>
      )}
      {status === 'error' && (
        <div>
          <p style={{ color: '#dc3545', fontSize: 14 }}>{error}</p>
          <button
            type="button"
            onClick={checkField}
            style={{
              marginTop: 8,
              padding: '6px 12px',
              fontSize: 13,
              color: '#fff',
              background: '#2a5196',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      )}
      {error && status !== 'error' && (
        <p style={{ color: '#dc3545', fontSize: 14, marginTop: 8 }}>{error}</p>
      )}
    </div>
  );
}

function DocumentStatusSettings() {
  const [status, setStatus] = useState('loading');
  const [fieldId, setFieldId] = useState(null);
  const [error, setError] = useState(null);

  const checkField = useCallback(async () => {
    setError(null);
    setStatus('loading');
    try {
      const data = await apiCall(API_ENDPOINTS.CUSTOM_FIELDS);
      const fields = Array.isArray(data?.results) ? data.results : (data ? [data] : []);
      const docStatus = fields.find((f) => (f.name || '').toLowerCase() === 'document status');
      if (docStatus) {
        setFieldId(docStatus.id);
        setStatus('exists');
      } else {
        setStatus('missing');
      }
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Failed to fetch custom fields');
    }
  }, []);

  useEffect(() => {
    checkField();
  }, [checkField]);

  const createField = async () => {
    setError(null);
    setStatus('creating');
    try {
      const created = await apiCall(API_ENDPOINTS.CUSTOM_FIELDS, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Document Status',
          data_type: 'string',
        }),
      });
      const id = created?.id ?? created?.pk;
      if (id != null) {
        setFieldId(id);
        setStatus('exists');
        clearCustomFieldsCache();
      } else {
        setStatus('error');
        setError('Field created but ID not found');
      }
    } catch (err) {
      setStatus('missing');
      setError(err.message || 'Failed to create Document Status field');
    }
  };

  return (
    <div>
      <h2 style={{ color: '#374151', fontSize: 18, margin: '0 0 8px 0' }}>Document Status</h2>
      <p style={{ color: '#6c757d', fontSize: 14, margin: '0 0 16px 0' }}>
        Required for document workflow (Under Review, Needs Action, Approved, Rejected).
      </p>
      {status === 'loading' && <p style={{ color: '#6c757d', fontSize: 14 }}>Checking…</p>}
      {status === 'exists' && (
        <p style={{ color: '#22c55e', fontSize: 14, fontWeight: 500 }}>Document Status field configured (ID: {fieldId}).</p>
      )}
      {status === 'missing' && (
        <div>
          <button
            type="button"
            onClick={createField}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              color: '#fff',
              background: '#2a5196',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Add Document Status Field
          </button>
        </div>
      )}
      {status === 'creating' && <p style={{ color: '#6c757d', fontSize: 14 }}>Creating…</p>}
      {status === 'error' && (
        <div>
          <p style={{ color: '#dc3545', fontSize: 14 }}>{error}</p>
          <button type="button" onClick={checkField} style={{ marginTop: 8, padding: '6px 12px', fontSize: 13, color: '#fff', background: '#2a5196', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Retry</button>
        </div>
      )}
    </div>
  );
}

const ARCHIVING_FIELD_MATCH_NAMES = ['archiving', 'archive status'];

function findArchivingCustomField(fields) {
  return fields.find((f) => ARCHIVING_FIELD_MATCH_NAMES.includes((f.name || '').toLowerCase()));
}

function ArchivingFieldSettings() {
  const [status, setStatus] = useState('loading');
  const [fieldId, setFieldId] = useState(null);
  const [fieldLabel, setFieldLabel] = useState(null);
  const [error, setError] = useState(null);

  const checkField = useCallback(async () => {
    setError(null);
    setStatus('loading');
    try {
      const data = await apiCall(API_ENDPOINTS.CUSTOM_FIELDS);
      const fields = Array.isArray(data?.results) ? data.results : data ? [data] : [];
      const archiving = findArchivingCustomField(fields);
      if (archiving) {
        setFieldId(archiving.id ?? archiving.pk);
        setFieldLabel(archiving.name || 'Archiving');
        setStatus('exists');
      } else {
        setStatus('missing');
      }
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Failed to fetch custom fields');
    }
  }, []);

  useEffect(() => {
    checkField();
  }, [checkField]);

  const createField = async () => {
    setError(null);
    setStatus('creating');
    try {
      const created = await apiCall(API_ENDPOINTS.CUSTOM_FIELDS, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Archiving',
          data_type: 'string',
        }),
      });
      const id = created?.id ?? created?.pk;
      if (id != null) {
        setFieldId(id);
        setFieldLabel('Archiving');
        setStatus('exists');
        clearCustomFieldsCache();
      } else {
        setStatus('error');
        setError('Field created but ID not found');
      }
    } catch (err) {
      setStatus('missing');
      setError(err.message || 'Failed to create Archiving field');
    }
  };

  return (
    <div>
      <h2 style={{ color: '#374151', fontSize: 18, margin: '0 0 8px 0' }}>Archiving</h2>
      <p style={{ color: '#6c757d', fontSize: 14, margin: '0 0 16px 0' }}>
        When an office completes <strong>Take Action</strong> (Approved or Rejected), DTS sets this field to{' '}
        <strong>For Archiving</strong> in Paperless. Create the field here if it does not exist yet (string type; value is set automatically).
      </p>
      {status === 'loading' && <p style={{ color: '#6c757d', fontSize: 14 }}>Checking…</p>}
      {status === 'exists' && (
        <p style={{ color: '#22c55e', fontSize: 14, fontWeight: 500 }}>
          {fieldLabel} field configured (ID: {fieldId}).
        </p>
      )}
      {status === 'missing' && (
        <div>
          <p style={{ color: '#6c757d', fontSize: 14, marginBottom: 12 }}>
            Archiving custom field not found (expected name: <strong>Archiving</strong> or <strong>Archive status</strong>).
          </p>
          <button
            type="button"
            onClick={createField}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              color: '#fff',
              background: '#2a5196',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Add Archiving Field
          </button>
        </div>
      )}
      {status === 'creating' && <p style={{ color: '#6c757d', fontSize: 14 }}>Creating…</p>}
      {status === 'error' && (
        <div>
          <p style={{ color: '#dc3545', fontSize: 14 }}>{error}</p>
          <button
            type="button"
            onClick={checkField}
            style={{
              marginTop: 8,
              padding: '6px 12px',
              fontSize: 13,
              color: '#fff',
              background: '#2a5196',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

function DocumentCopyStateFieldSettings() {
  const [status, setStatus] = useState('loading');
  const [fieldId, setFieldId] = useState(null);
  const [fieldLabel, setFieldLabel] = useState(null);
  const [error, setError] = useState(null);

  const checkField = useCallback(async () => {
    setError(null);
    setStatus('loading');
    try {
      const data = await apiCall(API_ENDPOINTS.CUSTOM_FIELDS);
      const fields = Array.isArray(data?.results) ? data.results : data ? [data] : [];
      const copyState = fields.find((f) => (f.name || '').toLowerCase() === 'document copy state');
      if (copyState) {
        setFieldId(copyState.id ?? copyState.pk);
        setFieldLabel(copyState.name || 'Document Copy State');
        setStatus('exists');
      } else {
        setStatus('missing');
      }
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Failed to fetch custom fields');
    }
  }, []);

  useEffect(() => {
    checkField();
  }, [checkField]);

  const createField = async () => {
    setError(null);
    setStatus('creating');
    try {
      const created = await apiCall(API_ENDPOINTS.CUSTOM_FIELDS, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Document Copy State',
          data_type: 'string',
        }),
      });
      const id = created?.id ?? created?.pk;
      if (id != null) {
        setFieldId(id);
        setFieldLabel('Document Copy State');
        setStatus('exists');
        clearCustomFieldsCache();
      } else {
        setStatus('error');
        setError('Field created but ID not found');
      }
    } catch (err) {
      setStatus('missing');
      setError(err.message || 'Failed to create Document Copy State field');
    }
  };

  return (
    <div>
      <h2 style={{ color: '#374151', fontSize: 18, margin: '0 0 8px 0' }}>Document Copy State</h2>
      <p style={{ color: '#6c757d', fontSize: 14, margin: '0 0 16px 0' }}>
        Used by digital release modes (digital-only and digital-first). DTS updates this field automatically.
      </p>
      {status === 'loading' && <p style={{ color: '#6c757d', fontSize: 14 }}>Checking…</p>}
      {status === 'exists' && (
        <p style={{ color: '#22c55e', fontSize: 14, fontWeight: 500 }}>
          {fieldLabel} field configured (ID: {fieldId}).
        </p>
      )}
      {status === 'missing' && (
        <div>
          <p style={{ color: '#6c757d', fontSize: 14, marginBottom: 12 }}>
            Document Copy State custom field not found.
          </p>
          <button
            type="button"
            onClick={createField}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              color: '#fff',
              background: '#2a5196',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Add Document Copy State Field
          </button>
        </div>
      )}
      {status === 'creating' && <p style={{ color: '#6c757d', fontSize: 14 }}>Creating…</p>}
      {status === 'error' && (
        <div>
          <p style={{ color: '#dc3545', fontSize: 14 }}>{error}</p>
          <button
            type="button"
            onClick={checkField}
            style={{
              marginTop: 8,
              padding: '6px 12px',
              fontSize: 13,
              color: '#fff',
              background: '#2a5196',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

function SubmittedByFieldSettings() {
  const [status, setStatus] = useState('loading');
  const [fieldId, setFieldId] = useState(null);
  const [error, setError] = useState(null);

  const checkField = useCallback(async () => {
    setError(null);
    setStatus('loading');
    try {
      const data = await apiCall(API_ENDPOINTS.CUSTOM_FIELDS);
      const fields = Array.isArray(data?.results) ? data.results : data ? [data] : [];
      const submittedBy = fields.find((f) => (f.name || '').toLowerCase() === 'submitted by');
      if (submittedBy) {
        setFieldId(submittedBy.id ?? submittedBy.pk);
        setStatus('exists');
      } else {
        setStatus('missing');
      }
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Failed to fetch custom fields');
    }
  }, []);

  useEffect(() => {
    checkField();
  }, [checkField]);

  const createField = async () => {
    setError(null);
    setStatus('creating');
    try {
      const created = await apiCall(API_ENDPOINTS.CUSTOM_FIELDS, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Submitted By',
          data_type: 'string',
        }),
      });
      const id = created?.id ?? created?.pk;
      if (id != null) {
        setFieldId(id);
        setStatus('exists');
        clearCustomFieldsCache();
      } else {
        setStatus('error');
        setError('Field created but ID not found');
      }
    } catch (err) {
      setStatus('missing');
      setError(err.message || 'Failed to create Submitted By field');
    }
  };

  return (
    <div>
      <h2 style={{ color: '#374151', fontSize: 18, margin: '0 0 8px 0' }}>Submitted By</h2>
      <p style={{ color: '#6c757d', fontSize: 14, margin: '0 0 16px 0' }}>
        Stores who submitted the letter on upload. Ollama can suggest a value from OCR text after processing.
      </p>
      {status === 'loading' && <p style={{ color: '#6c757d', fontSize: 14 }}>Checking…</p>}
      {status === 'exists' && (
        <p style={{ color: '#22c55e', fontSize: 14, fontWeight: 500 }}>
          Submitted By field configured (ID: {fieldId}).
        </p>
      )}
      {status === 'missing' && (
        <div>
          <p style={{ color: '#6c757d', fontSize: 14, marginBottom: 12 }}>
            Submitted By custom field not found.
          </p>
          <button
            type="button"
            onClick={createField}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              color: '#fff',
              background: '#2a5196',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Add Submitted By Field
          </button>
        </div>
      )}
      {status === 'creating' && <p style={{ color: '#6c757d', fontSize: 14 }}>Creating…</p>}
      {status === 'error' && (
        <div>
          <p style={{ color: '#dc3545', fontSize: 14 }}>{error}</p>
          <button
            type="button"
            onClick={checkField}
            style={{
              marginTop: 8,
              padding: '6px 12px',
              fontSize: 13,
              color: '#fff',
              background: '#2a5196',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

function DocumentTypeSettings() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDocType, setEditingDocType] = useState(null); // { id, name }
  const [editName, setEditName] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, name }

  const fetchDocumentTypes = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiCall(API_ENDPOINTS.DOCUMENT_TYPES);
      const results = data?.results ?? (Array.isArray(data) ? data : []);
      setList(results);
    } catch (err) {
      setError(err.message || 'Failed to load document types');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocumentTypes();
  }, [fetchDocumentTypes]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (showCreateModal && !submitting) setShowCreateModal(false);
      else if (editingDocType && !editSubmitting) setEditingDocType(null);
      else if (deleteConfirm && !deletingId) setDeleteConfirm(null);
    };
    if (!showCreateModal && !editingDocType && !deleteConfirm) return undefined;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCreateModal, editingDocType, deleteConfirm, submitting, editSubmitting, deletingId]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const name = (newName || '').trim();
    if (!name) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiCall(API_ENDPOINTS.DOCUMENT_TYPES, {
        method: 'POST',
        body: JSON.stringify({
          name,
          match: '',
          matching_algorithm: 0,
          owner: null, // avoid document type becoming private (owned by API user)
        }),
      });
      setNewName('');
      setShowCreateModal(false);
      await fetchDocumentTypes();
    } catch (err) {
      setError(err.message || 'Failed to create document type');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingDocType?.id) return;
    const name = (editName || '').trim();
    if (!name) return;
    setError(null);
    setEditSubmitting(true);
    try {
      await apiCall(API_ENDPOINTS.DOCUMENT_TYPE_DETAIL(editingDocType.id), {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      setEditingDocType(null);
      setEditName('');
      await fetchDocumentTypes();
    } catch (err) {
      setError(err.message || 'Failed to update document type');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!id) return;
    setError(null);
    setDeletingId(id);
    setDeleteConfirm(null);
    try {
      await apiCall(API_ENDPOINTS.DOCUMENT_TYPE_DETAIL(id), { method: 'DELETE' });
      await fetchDocumentTypes();
    } catch (err) {
      setError(err.message || 'Failed to delete document type');
    } finally {
      setDeletingId(null);
    }
  };

  const docTypesRefreshBtn = {
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: BORDER_RADIUS.LG,
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <h2 style={{ color: '#374151', fontSize: 18, margin: 0, fontWeight: 600 }}>Document types</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <button type="button" onClick={() => fetchDocumentTypes()} disabled={loading} style={docTypesRefreshBtn}>
            Refresh
          </button>
          <AddOutlineButton
            type="button"
            onClick={() => {
              setShowCreateModal(true);
              setNewName('');
              setError(null);
            }}
          >
            Create
          </AddOutlineButton>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', borderRadius: 8, marginBottom: 20, color: '#dc2626', fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Create document type modal — shell matches cabinets / route templates / ConfirmationModal */}
      {showCreateModal && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 5000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            boxSizing: 'border-box',
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !submitting) setShowCreateModal(false);
          }}
        >
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="doc-type-create-modal-title"
            style={{
              background: '#fff',
              borderRadius: 6,
              boxShadow: '0 0.5rem 1rem rgba(0, 0, 0, 0.15)',
              width: '100%',
              maxWidth: 500,
              maxHeight: 'min(90vh, 100%)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid rgba(0,0,0,0.1)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form
              onSubmit={handleAdd}
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
                  id="doc-type-create-modal-title"
                  className="modal-title"
                  style={{ margin: 0, fontSize: 18, fontWeight: 600, color: COLORS.PRIMARY }}
                >
                  Create document type
                </h4>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  disabled={submitting}
                  onClick={() => !submitting && setShowCreateModal(false)}
                  style={{
                    padding: 0,
                    margin: 0,
                    width: 32,
                    height: 32,
                    border: 'none',
                    background: 'transparent',
                    cursor: submitting ? 'not-allowed' : 'pointer',
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
                <label
                  htmlFor="doc-type-create-name"
                  className="form-label"
                  style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 8 }}
                >
                  Name
                </label>
                <input
                  id="doc-type-create-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Memo, Letter, Report"
                  disabled={submitting}
                  autoFocus
                  className="form-control"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 14,
                    border: `1px solid ${COLORS.BORDER_LIGHT}`,
                    borderRadius: BORDER_RADIUS.LG,
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
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
                  disabled={submitting}
                  onClick={() => !submitting && setShowCreateModal(false)}
                  style={{
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#6c757d',
                    background: '#fff',
                    border: '1px solid #6c757d',
                    borderRadius: 4,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !newName.trim()}
                  style={{
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#fff',
                    background: submitting || !newName.trim() ? '#94a3b8' : COLORS.PRIMARY,
                    border: '1px solid transparent',
                    borderRadius: 4,
                    cursor: submitting || !newName.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit document type modal */}
      {editingDocType && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 5000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            boxSizing: 'border-box',
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !editSubmitting) setEditingDocType(null);
          }}
        >
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="doc-type-edit-modal-title"
            style={{
              background: '#fff',
              borderRadius: 6,
              boxShadow: '0 0.5rem 1rem rgba(0, 0, 0, 0.15)',
              width: '100%',
              maxWidth: 500,
              maxHeight: 'min(90vh, 100%)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid rgba(0,0,0,0.1)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form
              onSubmit={handleEditSubmit}
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
                  id="doc-type-edit-modal-title"
                  className="modal-title"
                  style={{ margin: 0, fontSize: 18, fontWeight: 600, color: COLORS.PRIMARY }}
                >
                  Edit document type
                </h4>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  disabled={editSubmitting}
                  onClick={() => !editSubmitting && setEditingDocType(null)}
                  style={{
                    padding: 0,
                    margin: 0,
                    width: 32,
                    height: 32,
                    border: 'none',
                    background: 'transparent',
                    cursor: editSubmitting ? 'not-allowed' : 'pointer',
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
                <label
                  htmlFor="doc-type-edit-name"
                  className="form-label"
                  style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 8 }}
                >
                  Name
                </label>
                <input
                  id="doc-type-edit-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Memo, Letter, Report"
                  disabled={editSubmitting}
                  autoFocus
                  className="form-control"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 14,
                    border: `1px solid ${COLORS.BORDER_LIGHT}`,
                    borderRadius: BORDER_RADIUS.LG,
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
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
                  disabled={editSubmitting}
                  onClick={() => !editSubmitting && setEditingDocType(null)}
                  style={{
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#6c757d',
                    background: '#fff',
                    border: '1px solid #6c757d',
                    borderRadius: 4,
                    cursor: editSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={editSubmitting || !editName.trim()}
                  style={{
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#fff',
                    background: editSubmitting || !editName.trim() ? '#94a3b8' : COLORS.PRIMARY,
                    border: '1px solid transparent',
                    borderRadius: 4,
                    cursor: editSubmitting || !editName.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {editSubmitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 5000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            boxSizing: 'border-box',
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deletingId) setDeleteConfirm(null);
          }}
        >
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="doc-type-delete-modal-title"
            style={{
              background: '#fff',
              borderRadius: 6,
              boxShadow: '0 0.5rem 1rem rgba(0, 0, 0, 0.15)',
              width: '100%',
              maxWidth: 520,
              maxHeight: 'min(90vh, 100%)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid rgba(0,0,0,0.1)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
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
                id="doc-type-delete-modal-title"
                className="modal-title"
                style={{ margin: 0, fontSize: 18, fontWeight: 600, color: COLORS.PRIMARY }}
              >
                Delete document type?
              </h4>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                disabled={!!deletingId}
                onClick={() => !deletingId && setDeleteConfirm(null)}
                style={{
                  padding: 0,
                  margin: 0,
                  width: 32,
                  height: 32,
                  border: 'none',
                  background: 'transparent',
                  cursor: deletingId ? 'not-allowed' : 'pointer',
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
              <p style={{ margin: 0, color: '#6c757d', fontSize: 14, lineHeight: 1.5 }}>
                Delete document type &quot;{deleteConfirm.name}&quot;? Documents using this type will keep it until re-saved.
              </p>
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
                disabled={!!deletingId}
                onClick={() => !deletingId && setDeleteConfirm(null)}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#6c757d',
                  background: '#fff',
                  border: '1px solid #6c757d',
                  borderRadius: 4,
                  cursor: deletingId ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => handleDelete(deleteConfirm.id)}
                disabled={deletingId === deleteConfirm.id}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#fff',
                  background: deletingId === deleteConfirm.id ? '#94a3b8' : COLORS.ERROR,
                  border: '1px solid transparent',
                  borderRadius: 4,
                  cursor: deletingId === deleteConfirm.id ? 'not-allowed' : 'pointer',
                }}
              >
                {deletingId === deleteConfirm.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing document types */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <h3 style={{ color: '#374151', fontSize: 13, fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Existing document types {!loading && list.length > 0 && <span style={{ fontWeight: 500, color: '#9ca3af' }}>({list.length})</span>}
          </h3>
        </div>

        {loading ? (
          <div style={{ padding: '32px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
            Loading document types…
          </div>
        ) : list.length === 0 ? (
          <div style={{
            padding: '32px 24px',
            textAlign: 'center',
            background: '#f9fafb',
            border: '1px dashed #e5e7eb',
            borderRadius: 8,
            color: '#6b7280',
            fontSize: 14,
          }}>
            No document types yet. Click Create to add one.
          </div>
        ) : (
          <div className="document-types-table" style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500, color: '#374151' }}>Name</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500, color: '#374151' }}>Document count</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500, color: '#374151' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((t) => {
                  const id = t.id ?? t.pk;
                  const name = t.name ?? t.slug ?? `ID ${id}`;
                  const isDeleting = deletingId === id;
                  const docCount = t.document_count ?? t.document_count_number ?? 0;
                  return (
                    <tr key={id} style={{ borderTop: '1px solid #e5e7eb', verticalAlign: 'middle' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <button
                          type="button"
                          onClick={() => { setEditingDocType({ id, name }); setEditName(name); setError(null); }}
                          style={{
                            padding: 0,
                            margin: 0,
                            border: 'none',
                            background: 'none',
                            color: '#2a5196',
                            fontSize: 14,
                            cursor: 'pointer',
                            textAlign: 'left',
                            font: 'inherit',
                            textDecoration: 'none',
                          }}
                        >
                          {name}
                        </button>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#374151' }}>{docCount}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => { setEditingDocType({ id, name }); setEditName(name); setError(null); }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '6px 12px',
                              fontSize: 13,
                              color: '#6b7280',
                              background: '#fff',
                              border: '1px solid #d1d5db',
                              borderRadius: 6,
                              cursor: 'pointer',
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z" /></svg>
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm({ id, name })}
                            disabled={isDeleting}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '6px 12px',
                              fontSize: 13,
                              color: '#dc2626',
                              background: '#fff',
                              border: '1px solid #fca5a5',
                              borderRadius: 6,
                              cursor: isDeleting ? 'not-allowed' : 'pointer',
                              opacity: isDeleting ? 0.6 : 1,
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" /><path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" /></svg>
                            {isDeleting ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const SETTINGS_TABS = [
  { id: 'features', title: 'Features' },
  { id: 'documentTypes', title: 'Document types' },
  { id: 'dataManagement', title: 'Data Management' },
];

function SettingsView() {
  const [activeTab, setActiveTab] = useState('features');

  const renderContent = () => {
    if (activeTab === 'features') {
      return (
        <div className="settings-content-grid">
          <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '20px 24px' }}>
            <TrackingCodeSettings />
          </section>
          <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '20px 24px' }}>
            <DocumentStatusSettings />
          </section>
          <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '20px 24px' }}>
            <ArchivingFieldSettings />
          </section>
          <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '20px 24px' }}>
            <DocumentCopyStateFieldSettings />
          </section>
          <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '20px 24px' }}>
            <SubmittedByFieldSettings />
          </section>
        </div>
      );
    }
    if (activeTab === 'documentTypes') {
      return <DocumentTypeSettings />;
    }
    if (activeTab === 'dataManagement') {
      return <DataManagementSettings />;
    }
    return null;
  };

  return (
    <div className="settings-view-shell">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ color: '#2a5196', fontSize: 24, margin: 0, fontWeight: 600 }}>Settings</h1>
      </div>
      <div role="tablist" aria-label="Settings sections" className="settings-nav-tabs">
        {SETTINGS_TABS.map(({ id, title }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`settings-tab-${id}`}
              aria-selected={isActive}
              aria-controls="settings-panel-main"
              tabIndex={isActive ? 0 : -1}
              className={`settings-tab-btn${isActive ? ' active' : ''}`}
              onClick={() => setActiveTab(id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
                e.preventDefault();
                const idx = SETTINGS_TABS.findIndex((t) => t.id === activeTab);
                let nextIdx = idx;
                if (e.key === 'ArrowRight') nextIdx = Math.min(idx + 1, SETTINGS_TABS.length - 1);
                else if (e.key === 'ArrowLeft') nextIdx = Math.max(idx - 1, 0);
                else if (e.key === 'Home') nextIdx = 0;
                else if (e.key === 'End') nextIdx = SETTINGS_TABS.length - 1;
                const next = SETTINGS_TABS[nextIdx];
                setActiveTab(next.id);
                requestAnimationFrame(() => {
                  document.getElementById(`settings-tab-${next.id}`)?.focus();
                });
              }}
            >
              {title}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id="settings-panel-main"
        aria-labelledby={`settings-tab-${activeTab}`}
        className="settings-tab-content"
      >
        {renderContent()}
      </div>
    </div>
  );
}

/**
 * Employees View - list and manage employees
 */
function EmployeesView({ tags = [] }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [officeFilter, setOfficeFilter] = useState('');
  const [deletingEmployee, setDeletingEmployee] = useState(null);
  const [removeInProgress, setRemoveInProgress] = useState(false);
  const tagMap = Object.fromEntries((tags || []).map((t) => [t.id, t.name]));

  const filteredEmployees = (() => {
    let list = employees;
    if (officeFilter) {
      const tagId = parseInt(officeFilter, 10);
      list = list.filter((e) => e.tag_id === tagId);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (e) =>
          (e.name || '').toLowerCase().includes(q) ||
          (e.employee_number || '').toLowerCase().includes(q) ||
          (e.position || '').toLowerCase().includes(q) ||
          (e.email || '').toLowerCase().includes(q) ||
          (tagMap[e.tag_id] || '').toLowerCase().includes(q)
      );
    }
    return list;
  })();

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiCall('/api/employees');
      setEmployees(data?.employees ?? []);
    } catch (err) {
      setError(err.message || 'Failed to load employees');
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const performDelete = async () => {
    if (!deletingEmployee) return;
    const emp = deletingEmployee;
    setRemoveInProgress(true);
    try {
      await apiCall(`/api/employees/${emp.id}`, { method: 'DELETE' });
      setDeletingEmployee(null);
      fetchEmployees();
    } catch (err) {
      alert(err.message || 'Failed to delete employee');
    } finally {
      setRemoveInProgress(false);
    }
  };

  const adminSecondaryBtn = {
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: BORDER_RADIUS.LG,
    cursor: 'pointer',
  };

  return (
    <>
      <header
        style={{
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
        }}
      >
        <div style={{ minWidth: 'min(100%, 240px)', flex: '1 1 280px' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Employees</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
            Manage employees. Assign offices for tracking purposes.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {showAddForm ? (
            <button type="button" onClick={() => setShowAddForm(false)} style={adminSecondaryBtn}>
              Cancel
            </button>
          ) : (
            <AddOutlineButton type="button" onClick={() => setShowAddForm(true)}>
              Add employee
            </AddOutlineButton>
          )}
        </div>
      </header>

      {error && <p style={{ color: COLORS.ERROR, fontSize: 14, margin: '0 0 16px 0' }}>{error}</p>}

      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employees…"
          autoComplete="off"
          aria-label="Search employees"
          style={{
            flex: '1 1 200px',
            minWidth: 200,
            maxWidth: 400,
            width: '100%',
            padding: '10px 12px',
            fontSize: 14,
            border: '1px solid #e5e7eb',
            borderRadius: BORDER_RADIUS.LG,
            boxSizing: 'border-box',
          }}
        />
        <select
          value={officeFilter}
          onChange={(e) => setOfficeFilter(e.target.value)}
          aria-label="Filter by office"
          style={{
            padding: '10px 12px',
            fontSize: 14,
            border: '1px solid #e5e7eb',
            borderRadius: BORDER_RADIUS.LG,
            boxSizing: 'border-box',
            minWidth: 160,
          }}
        >
          <option value="">All offices</option>
          {(tags || []).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      {showAddForm && (
        <AddEmployeeForm
          tags={tags}
          onSuccess={() => {
            setShowAddForm(false);
            fetchEmployees();
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}
      <div style={{ marginTop: 24 }}>
        <h2 style={{ color: '#374151', fontSize: 16, margin: '0 0 12px 0' }}>All employees</h2>
        {loading ? (
          <p style={{ color: '#6c757d', fontSize: 14 }}>Loading…</p>
        ) : employees.length === 0 ? (
          <p style={{ color: '#6c757d', fontSize: 14 }}>No employees yet. Add one above.</p>
        ) : filteredEmployees.length === 0 ? (
          <p style={{ color: '#6c757d', fontSize: 14 }}>No employees match your filters.</p>
        ) : (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8f9fa', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Employee #</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Name</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Position</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Office</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => (
                  <tr
                    key={emp.id}
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8f9fa'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '12px 16px', color: '#374151' }}>{emp.employee_number}</td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>{emp.name}</td>
                    <td style={{ padding: '12px 16px', color: '#6c757d' }}>{emp.position || '—'}</td>
                    <td style={{ padding: '12px 16px', color: '#6c757d' }}>{emp.tag_id ? (tagMap[emp.tag_id] ?? `Office #${emp.tag_id}`) : '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 500,
                        background: emp.status === 'active' ? '#dcfce7' : '#f3f4f6',
                        color: emp.status === 'active' ? '#166534' : '#6b7280',
                      }}>{emp.status}</span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => setEditingId(editingId === emp.id ? null : emp.id)}
                          style={{
                            padding: '6px 12px',
                            fontSize: 13,
                            fontWeight: 600,
                            color: COLORS.PRIMARY,
                            background: '#fff',
                            border: `1px solid ${COLORS.PRIMARY}`,
                            borderRadius: BORDER_RADIUS.LG,
                            cursor: 'pointer',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingEmployee(emp)}
                          style={{
                            padding: '6px 12px',
                            fontSize: 13,
                            fontWeight: 600,
                            color: COLORS.ERROR,
                            background: '#fff',
                            border: `1px solid ${COLORS.ERROR}`,
                            borderRadius: BORDER_RADIUS.LG,
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {deletingEmployee && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 5000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => !removeInProgress && setDeletingEmployee(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              minWidth: 340,
              maxWidth: 400,
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 12px 0', color: '#0f172a', fontSize: 18, fontWeight: 600 }}>Delete employee</h2>
            <p style={{ margin: '0 0 20px 0', color: '#6c757d', fontSize: 14 }}>
              Delete <strong>{deletingEmployee.name}</strong> ({deletingEmployee.employee_number})? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => !removeInProgress && setDeletingEmployee(null)}
                disabled={removeInProgress}
                style={{
                  ...adminSecondaryBtn,
                  cursor: removeInProgress ? 'not-allowed' : 'pointer',
                  opacity: removeInProgress ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performDelete}
                disabled={removeInProgress}
                style={{
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#fff',
                  background: COLORS.ERROR,
                  border: 'none',
                  borderRadius: BORDER_RADIUS.LG,
                  cursor: removeInProgress ? 'not-allowed' : 'pointer',
                  opacity: removeInProgress ? 0.7 : 1,
                }}
              >
                {removeInProgress ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingId && (
        <EditEmployeeModal
          employee={employees.find((e) => e.id === editingId)}
          tags={tags}
          onClose={() => setEditingId(null)}
          onSuccess={() => {
            setEditingId(null);
            fetchEmployees();
          }}
        />
      )}
    </>
  );
}

function AddEmployeeForm({ tags, onSuccess, onCancel }) {
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [tagId, setTagId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!employeeNumber.trim()) {
      setError('Employee number is required');
      return;
    }
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await apiCall('/api/employees', {
        method: 'POST',
        body: JSON.stringify({
          employee_number: employeeNumber.trim(),
          name: name.trim(),
          email: email.trim() || null,
          position: position.trim() || null,
          tag_id: tagId ? parseInt(tagId, 10) : null,
          status: 'active',
        }),
      });
      setEmployeeNumber('');
      setName('');
      setEmail('');
      setPosition('');
      setTagId('');
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to add employee');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    border: '1px solid #e5e7eb',
    borderRadius: BORDER_RADIUS.LG,
    boxSizing: 'border-box',
  };

  const secondaryBtn = {
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: BORDER_RADIUS.LG,
    cursor: 'pointer',
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480, marginBottom: 24, padding: 24, background: '#f8fafc', borderRadius: BORDER_RADIUS.LG, border: '1px solid #e5e7eb' }}>
      <h2 style={{ margin: '0 0 8px 0', color: '#0f172a', fontSize: 18, fontWeight: 600 }}>Add employee</h2>
      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>Employee number</label>
        <input type="text" value={employeeNumber} onChange={e => setEmployeeNumber(e.target.value)} placeholder="e.g. EMP-001" style={inputStyle} autoFocus />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>Name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" style={inputStyle} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder=" Optional" style={inputStyle} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>Position</label>
        <input type="text" value={position} onChange={e => setPosition(e.target.value)} placeholder=" Optional" style={inputStyle} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>Office</label>
        <select value={tagId} onChange={e => setTagId(e.target.value)} style={inputStyle}>
          <option value="">— Select office —</option>
          {(tags || []).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      {error && <div style={{ color: COLORS.ERROR, fontSize: 13 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 600,
            color: '#fff',
            background: COLORS.PRIMARY,
            border: 'none',
            borderRadius: BORDER_RADIUS.LG,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? 'Adding…' : 'Add employee'}
        </button>
        <button type="button" onClick={onCancel} style={secondaryBtn}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditEmployeeModal({ employee, tags, onClose, onSuccess }) {
  const [employeeNumber, setEmployeeNumber] = useState(employee?.employee_number ?? '');
  const [name, setName] = useState(employee?.name ?? '');
  const [email, setEmail] = useState(employee?.email ?? '');
  const [position, setPosition] = useState(employee?.position ?? '');
  const [tagId, setTagId] = useState(employee?.tag_id ? String(employee.tag_id) : '');
  const [status, setStatus] = useState(employee?.status ?? 'active');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!employee?.id) return;
    if (!employeeNumber.trim()) { setError('Employee number is required'); return; }
    if (!name.trim()) { setError('Name is required'); return; }
    setError(null);
    setSubmitting(true);
    try {
      await apiCall(`/api/employees/${employee.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          employee_number: employeeNumber.trim(),
          name: name.trim(),
          email: email.trim() || null,
          position: position.trim() || null,
          tag_id: tagId ? parseInt(tagId, 10) : null,
          status,
        }),
      });
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to update employee');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    border: '1px solid #e5e7eb',
    borderRadius: BORDER_RADIUS.LG,
    boxSizing: 'border-box',
  };

  const secondaryBtn = {
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: BORDER_RADIUS.LG,
    cursor: 'pointer',
  };

  if (!employee) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.35)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: BORDER_RADIUS.XL, padding: 24, minWidth: 400, maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px 0', color: '#0f172a', fontSize: 18, fontWeight: 600 }}>Edit employee</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>Employee number</label>
            <input type="text" value={employeeNumber} onChange={e => setEmployeeNumber(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>Position</label>
            <input type="text" value={position} onChange={e => setPosition(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>Office</label>
            <select value={tagId} onChange={e => setTagId(e.target.value)} style={inputStyle}>
              <option value="">— Select office —</option>
              {(tags || []).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          {error && <div style={{ color: COLORS.ERROR, fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                background: COLORS.PRIMARY,
                border: 'none',
                borderRadius: BORDER_RADIUS.LG,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onClose} style={secondaryBtn}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Admin Overview Stats - stats cards and analytics for the dashboard
 */
function AdminOverviewStats({ tags, tagsLoading, onEmployeesClick, onOfficeSelect }) {
  const [stats, setStats] = useState({
    offices_count: 0,
    documents_count: 0,
    in_transit_count: 0,
    employees_count: 0,
    total_documents_ever_processed: 0,
  });
  const [officeBreakdown, setOfficeBreakdown] = useState([]);
  const [inTransitList, setInTransitList] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [officesModalOpen, setOfficesModalOpen] = useState(false);
  const [officesSearch, setOfficesSearch] = useState('');
  const [documentsModalOpen, setDocumentsModalOpen] = useState(false);
  const [inTransitModalOpen, setInTransitModalOpen] = useState(false);
  const [resetStatsConfirmOpen, setResetStatsConfirmOpen] = useState(false);
  const [resettingStats, setResettingStats] = useState(false);
  const [adminActivityChart, setAdminActivityChart] = useState([]);
  const [systemActivity, setSystemActivity] = useState({ today: 0, week: 0, month: 0 });
  const [statusMix, setStatusMix] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      setStatsError(null);
      const data = await apiCall('/api/admin/stats?include_offices=1&include_in_transit=1&include_avg_processing_time=1&include_daily_activity=1&daily_activity_days=30');
      setStats({
        offices_count: data?.offices_count ?? tags?.length ?? 0,
        documents_count: data?.documents_count ?? 0,
        in_transit_count: data?.in_transit_count ?? 0,
        employees_count: data?.employees_count ?? 0,
        total_documents_ever_processed: data?.total_documents_ever_processed ?? 0,
        avg_processing_time_creation_to_action_days: data?.avg_processing_time_creation_to_action_days,
        avg_processing_time_creation_to_action_label: data?.avg_processing_time_creation_to_action_label,
      });
      setOfficeBreakdown(data?.offices ?? []);
      setInTransitList(data?.in_transit ?? []);
      setSystemActivity({
        today: data?.system_activity_today ?? 0,
        week: data?.system_activity_this_week ?? 0,
        month: data?.system_activity_this_month ?? 0,
      });
      setAdminActivityChart(mapAdminDailyActivityToChartData(data?.daily_documents_activity));
      setStatusMix(data?.global_status_mix ?? null);
    } catch (err) {
      console.error('Failed to fetch admin stats:', err);
      if (err?.message && (err.message.includes('Authentication') || err.message.includes('401'))) {
        console.error('[Admin stats] Login/session error - you may need to log in again');
      }
      setStatsError(err.message);
      setStats({ offices_count: tags?.length ?? 0, documents_count: 0, in_transit_count: 0, employees_count: 0, total_documents_ever_processed: 0, avg_processing_time_creation_to_action_days: null, avg_processing_time_creation_to_action_label: null });
      setOfficeBreakdown([]);
      setInTransitList([]);
      setSystemActivity({ today: 0, week: 0, month: 0 });
      setAdminActivityChart([]);
      setStatusMix(null);
    } finally {
      setStatsLoading(false);
    }
  }, [tags?.length]);

  const handleResetStats = async () => {
    if (resettingStats) return;
    setResettingStats(true);
    try {
      await apiCall('/api/admin/stats/reset', { method: 'POST' });
      setResetStatsConfirmOpen(false);
      await fetchStats();
    } catch (err) {
      alert(err?.message || 'Failed to reset statistics');
    } finally {
      setResettingStats(false);
    }
  };

  useEffect(() => {
    if (!tagsLoading) fetchStats();
  }, [tagsLoading, fetchStats]);

  const handleDocumentsCardClick = () => setDocumentsModalOpen(true);
  const handleInTransitCardClick = () => setInTransitModalOpen(true);

  const atOffices = stats.documents_count;
  const inTransit = stats.in_transit_count;
  const totalDocs = atOffices + inTransit;
  const officeTotal = (o) => (o.documents_count ?? 0) + (o.in_transit_released_count ?? 0);
  const topOffices = [...officeBreakdown].sort((a, b) => officeTotal(b) - officeTotal(a)).slice(0, 5);
  const topOfficesGridColumns = '36px minmax(0, 1fr) 5rem 5rem 5.5rem 3.5rem';

  const underReview = statusMix?.['Under Review'] ?? 0;
  const needsAction = statusMix?.['Needs Action'] ?? 0;
  const approved = statusMix?.['Approved'] ?? 0;
  const rejected = statusMix?.['Rejected'] ?? 0;
  const forArchiving = statusMix?.['For Archiving'] ?? 0;
  const archived = statusMix?.['Archived'] ?? 0;
  const atOfficeForMix = underReview + needsAction + approved + rejected + forArchiving + archived;
  const pctSt = (n) => (atOfficeForMix > 0 ? Math.round((n / atOfficeForMix) * 100) : 0);

  const hasDateFilter = !!(dateFrom || dateTo);
  const chartDataFiltered = useMemo(
    () => filterAdminDailyChartRows(adminActivityChart, dateFrom, dateTo),
    [adminActivityChart, dateFrom, dateTo]
  );

  const chartSubtitle = hasDateFilter
    ? `Filtered range (${dateFrom || 'start'} → ${dateTo || 'today'}) · distinct documents with activity per day`
    : 'Daily distinct documents with activity — last 30 days (all offices, DTS statistics).';

  const clearDateFilter = () => {
    setDateFrom('');
    setDateTo('');
  };

  const insightWorkload = `${atOffices} at offices · ${inTransit} in transit`;

  return (
    <>
      <div
        style={{
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          margin: 0,
          padding: `${SPACING.SM} ${SPACING.LG} ${SPACING.XL}`,
          boxSizing: 'border-box',
          background: 'transparent',
        }}
      >
        <div
          style={{
            marginBottom: 28,
            width: '100%',
            minWidth: 0,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <h3 className="dashboard-paperless-h3" style={{ flex: '1 1 280px', minWidth: 0, margin: 0 }}>
            Admin dashboard{' '}
            <span className="dashboard-paperless-sub">
              System-wide view aligned with the office dashboard — totals, status mix, activity, and trends across all offices.
            </span>
          </h3>
          <button
            type="button"
            onClick={() => setResetStatsConfirmOpen(true)}
            style={{
              fontSize: 13,
              color: '#64748b',
              background: 'transparent',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '8px 14px',
              cursor: 'pointer',
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            Reset statistics
          </button>
        </div>

        {statsError && (
          <div style={{ padding: '12px 16px', background: '#fef2f2', borderRadius: 10, marginBottom: 20, color: '#dc2626', fontSize: 14 }}>{statsError}</div>
        )}

        <div
          style={{
            marginBottom: 24,
            background: COLORS.WHITE,
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
            padding: 20,
            minWidth: 0,
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Top offices by documents</div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.45 }}>
              Ranked by workload: documents at the office plus those in transit released from that office. Click a row to open office settings.
            </div>
          </div>
          {statsLoading ? (
            <p style={{ margin: 0, fontSize: 14, color: '#94a3b8' }}>Loading offices…</p>
          ) : topOffices.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, color: '#94a3b8' }}>No offices to show yet.</p>
          ) : (
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                overflow: 'hidden',
                background: '#fafbfc',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: topOfficesGridColumns,
                  gap: '8px 12px',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: '#f1f5f9',
                  borderBottom: '1px solid #e2e8f0',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <span>#</span>
                <span>Office</span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>At office</span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>In transit</span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>Total</span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>%</span>
              </div>
              {topOffices.map((o, idx) => {
                const at = o.documents_count ?? 0;
                const tr = o.in_transit_released_count ?? 0;
                const tot = officeTotal(o);
                const share = totalDocs > 0 ? Math.round((tot / totalDocs) * 100) : 0;
                const tagColor = (tags || []).find((t) => (t.id ?? t.pk) === o.tag_id)?.color || '#94a3b8';
                return (
                  <button
                    key={o.tag_id}
                    type="button"
                    onClick={() => typeof onOfficeSelect === 'function' && onOfficeSelect(o.tag_id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: topOfficesGridColumns,
                      gap: '8px 12px',
                      alignItems: 'center',
                      width: '100%',
                      padding: '12px 14px',
                      border: 'none',
                      borderTop: '1px solid #e2e8f0',
                      background: COLORS.WHITE,
                      cursor: 'pointer',
                      textAlign: 'left',
                      font: 'inherit',
                      boxSizing: 'border-box',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = COLORS.WHITE;
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{idx + 1}</span>
                    <span style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: tagColor, flexShrink: 0, marginTop: 5 }} aria-hidden />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                        {o.avg_processing_time_label != null && (
                          <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: 500 }}>
                            Receive → release: {o.avg_processing_time_label}
                          </span>
                        )}
                      </span>
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{at}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{tr}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#059669', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{tot}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textAlign: 'right' }}>{share}%</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <DashboardSimpleStatCard
            style={KPI_CARD_FLEX}
            label="Total documents"
            value={statsLoading ? '—' : totalDocs}
            icon={DASHBOARD_STAT_ICONS.docs}
          />
          <DashboardSimpleStatCard style={KPI_CARD_FLEX} label="At office" value={statsLoading ? '—' : atOffices} icon={DASHBOARD_STAT_ICONS.office} onClick={handleDocumentsCardClick} />
          <DashboardSimpleStatCard style={KPI_CARD_FLEX} label="In transit" value={statsLoading ? '—' : inTransit} icon={DASHBOARD_STAT_ICONS.transit} onClick={handleInTransitCardClick} />
          <DashboardSimpleStatCard style={KPI_CARD_FLEX} label="Added today" value={statsLoading ? '—' : systemActivity.today} icon={DASHBOARD_STAT_ICONS.calendar} />
          <DashboardSimpleStatCard style={KPI_CARD_FLEX} label="Added this week" value={statsLoading ? '—' : systemActivity.week} icon={DASHBOARD_STAT_ICONS.calendar} />
          <DashboardSimpleStatCard
            style={KPI_CARD_FLEX}
            label={hasDateFilter ? 'Last 30 days' : 'Added this month'}
            value={statsLoading ? '—' : systemActivity.month}
            icon={DASHBOARD_STAT_ICONS.calendar}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 24, alignItems: 'stretch' }}>
          <div
            style={{
              flex: '1 1 420px',
              background: COLORS.WHITE,
              borderRadius: 16,
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
              padding: 20,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Status mix — at offices</div>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.45 }}>
                Workflow split for documents physically at offices (all offices).
              </div>
            </div>

            {!statsLoading && atOfficeForMix > 0 ? (
              <>
                <div style={{ display: 'flex', height: 18, borderRadius: 999, overflow: 'hidden', background: '#e2e8f0' }}>
                  <div style={{ width: `${pctSt(underReview)}%`, minWidth: 0, background: '#eab308' }} title="Under Review" />
                  <div style={{ width: `${pctSt(needsAction)}%`, minWidth: 0, background: '#0e7490' }} title="Needs Action" />
                  <div style={{ width: `${pctSt(approved)}%`, minWidth: 0, background: '#059669' }} title="Approved" />
                  <div style={{ width: `${pctSt(rejected)}%`, minWidth: 0, background: '#dc2626' }} title="Rejected" />
                  <div style={{ width: `${pctSt(forArchiving)}%`, minWidth: 0, background: STATUS_MIX_ARCHIVE.FOR_ARCHIVING_BAR }} title="For Archiving" />
                  <div style={{ width: `${pctSt(archived)}%`, minWidth: 0, background: STATUS_MIX_ARCHIVE.ARCHIVED_BAR }} title="Archived" />
                </div>
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: '#fafbfc',
                  }}
                >
                  {[
                    { name: 'Under Review', n: underReview, color: '#eab308' },
                    { name: 'Needs Action', n: needsAction, color: '#0e7490' },
                    { name: 'Approved', n: approved, color: '#059669' },
                    { name: 'Rejected', n: rejected, color: '#dc2626' },
                    { name: 'For Archiving', n: forArchiving, color: STATUS_MIX_ARCHIVE.FOR_ARCHIVING_BAR },
                    { name: 'Archived', n: archived, color: STATUS_MIX_ARCHIVE.ARCHIVED_BAR },
                  ].map((row, i) => (
                    <div
                      key={row.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '11px 14px',
                        borderTop: i > 0 ? '1px solid #e2e8f0' : 'none',
                        background: COLORS.WHITE,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: row.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 14, fontWeight: 500, color: '#334155' }}>{row.name}</span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexShrink: 0 }}>
                        <strong style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{row.n}</strong>
                        <span style={{ fontSize: 13, color: '#94a3b8', fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'right' }}>{pctSt(row.n)}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: '#94a3b8' }}>
                {statsLoading ? 'Loading status mix…' : 'No documents at offices to show status mix.'}
              </p>
            )}
          </div>

          <div style={{ flex: '0 1 300px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <DashboardInsightRow label="Current workload" value={insightWorkload} />
            <DashboardInsightRow label="Avg processing time" value={stats.avg_processing_time_creation_to_action_label ?? '—'} />
            <DashboardInsightRow
              label="Admin snapshot"
              value={`${stats.offices_count} offices · ${stats.employees_count} employees · ${stats.total_documents_ever_processed} unique processed (all time)`}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setOfficesModalOpen(true)}
                style={{ fontSize: 12, fontWeight: 600, color: '#2a5196', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Browse offices
              </button>
              {typeof onEmployeesClick === 'function' && (
                <button
                  type="button"
                  onClick={onEmployeesClick}
                  style={{ fontSize: 12, fontWeight: 600, color: '#2a5196', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Manage employees
                </button>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            background: COLORS.WHITE,
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
            padding: 20,
            marginBottom: 24,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              marginBottom: 8,
            }}
          >
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Documents added over time</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>{chartSubtitle}</div>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: 10,
                padding: '10px 12px',
                background: '#f8fafc',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
              }}
            >
              <div>
                <label htmlFor="admin-dash-date-from" style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>From</label>
                <input
                  id="admin-dash-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  max={dateTo || undefined}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    color: '#0f172a',
                    fontFamily: 'inherit',
                    background: COLORS.WHITE,
                  }}
                />
              </div>
              <div>
                <label htmlFor="admin-dash-date-to" style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>To</label>
                <input
                  id="admin-dash-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  min={dateFrom || undefined}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    color: '#0f172a',
                    fontFamily: 'inherit',
                    background: COLORS.WHITE,
                  }}
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={clearDateFilter}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: COLORS.WHITE,
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          {hasDateFilter && (
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
              Chart only: filters the daily activity series. KPI totals above stay system-wide.
            </p>
          )}
          <DashboardActivityLineChart
            data={chartDataFiltered}
            countDescription={(v) => `${v} ${v === 1 ? 'document' : 'documents'} (distinct, all offices)`}
          />
        </div>
      </div>

      {officesModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 5000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setOfficesModalOpen(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              minWidth: 320,
              maxWidth: 420,
              width: '90vw',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px', color: '#2a5196', fontSize: 18, fontWeight: 600 }}>
              Offices
            </h2>
            <input
              type="text"
              value={officesSearch}
              onChange={(e) => setOfficesSearch(e.target.value)}
              placeholder="Search offices…"
              autoComplete="off"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
            />
            {tagsLoading ? (
              <p style={{ color: '#6c757d', fontSize: 14 }}>Loading…</p>
            ) : (() => {
              const q = officesSearch.trim().toLowerCase();
              const list = q ? (tags || []).filter((t) => (t.name || '').toLowerCase().includes(q)) : (tags || []);
              const officeByTag = Object.fromEntries((officeBreakdown || []).map((o) => [o.tag_id, o]));
              return list.length === 0 ? (
                <p style={{ color: '#6c757d', fontSize: 14 }}>{q ? 'No offices match.' : 'No offices yet.'}</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {list.map((tag) => {
                    const tid = tag.id ?? tag.pk;
                    const office = tid != null ? officeByTag[tid] : null;
                    return (
                      <li
                        key={tid}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '12px 0',
                          borderBottom: '1px solid #e5e7eb',
                          cursor: 'pointer',
                          gap: 10,
                        }}
                        onClick={() => {
                          if (typeof onOfficeSelect === 'function') onOfficeSelect(tid);
                          setOfficesModalOpen(false);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f8f9fa';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          flexShrink: 0,
                          backgroundColor: tag.color || '#9ca3af',
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>{tag.name}</span>
                          {office && (
                            <div style={{ fontSize: 12, color: '#6c757d', marginTop: 2 }}>
                              {office.documents_count ?? 0} docs
                              {office.avg_processing_time_label != null && ` · Receive → release: ${office.avg_processing_time_label}`}
                              {((office.cumulative_received_count ?? 0) + (office.cumulative_originated_count ?? 0)) > 0 && (
                                <> · R: {office.cumulative_received_count ?? 0} / O: {office.cumulative_originated_count ?? 0} (all time)</>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
            <button
              type="button"
              onClick={() => setOfficesModalOpen(false)}
              style={{
                marginTop: 20,
                padding: '10px 20px',
                fontSize: 14,
                color: '#fff',
                background: '#2a5196',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {inTransitModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 5000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setInTransitModalOpen(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              minWidth: 360,
              maxWidth: 480,
              width: '90vw',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px', color: '#2a5196', fontSize: 18, fontWeight: 600 }}>
              Documents In Transit
            </h2>
            {inTransitList.length === 0 ? (
              <p style={{ color: '#6c757d', fontSize: 14 }}>No documents in transit.</p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {inTransitList.map((item, idx) => (
                  <li
                    key={item.document_id ?? idx}
                    style={{
                      padding: '12px 0',
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>
                          {item.tracking_code || `Document #${item.document_id}`}
                        </span>
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6c757d' }}>
                          Released from: <strong>{item.released_from}</strong>
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setInTransitModalOpen(false)}
              style={{
                marginTop: 20,
                padding: '10px 20px',
                fontSize: 14,
                color: '#fff',
                background: '#2a5196',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {documentsModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 5000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setDocumentsModalOpen(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              minWidth: 320,
              maxWidth: 420,
              width: '90vw',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px', color: '#2a5196', fontSize: 18, fontWeight: 600 }}>
              Documents per Office
            </h2>
            {officeBreakdown.length === 0 ? (
              <p style={{ color: '#6c757d', fontSize: 14 }}>No offices found.</p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {officeBreakdown.map((o) => (
                  <li
                    key={o.tag_id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 14, color: '#374151' }}>{o.name}</span>
                      {((o.cumulative_received_count ?? 0) + (o.cumulative_originated_count ?? 0)) > 0 && (
                        <div style={{ fontSize: 11, color: '#6c757d', marginTop: 2 }}>
                          Received: {o.cumulative_received_count ?? 0} · Originated: {o.cumulative_originated_count ?? 0} (all time)
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#059669' }}>{o.documents_count}</span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setDocumentsModalOpen(false)}
              style={{
                marginTop: 20,
                padding: '10px 20px',
                fontSize: 14,
                color: '#fff',
                background: '#2a5196',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={resetStatsConfirmOpen}
        title="Reset all statistics"
        message="This will clear all stored activity, processing time, and creation-to-action data. Statistics will be recalculated from new events. Continue?"
        confirmLabel={resettingStats ? 'Resetting…' : 'Reset'}
        danger
        onConfirm={handleResetStats}
        onCancel={() => setResetStatsConfirmOpen(false)}
      />
    </>
  );
}

/**
 * Admin Page
 *
 * Protected page accessible only when logged in as admin/admin.
 */

function Admin() {
  const [validated, setValidated] = useState(() =>
    sessionManager.isSessionValid() && sessionManager.getUser()?.role === 'admin'
  );
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [currentView, setCurrentView] = useState('overview');
  const [addOfficeModalOpen, setAddOfficeModalOpen] = useState(false);
  const [lookupModalOpen, setLookupModalOpen] = useState(false);
  const [tags, setTags] = useState([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const profileMenuRef = useRef(null);
  const mainContentRef = useRef(null);

  const { logout } = useConnectionState();

  const usesDashboardMainPadding = true;
  /** Offices, Employees, site Settings, per-office detail: same shell as department main (edge scrollbar, 1440 column, 16/24 padding). */
  const usesDepartmentStyleAdminPane =
    currentView === 'offices' ||
    currentView === 'employees' ||
    currentView === 'settings' ||
    (currentView !== 'overview' &&
      currentView !== 'employees' &&
      currentView !== 'settings' &&
      currentView !== 'offices');
  const adminDeptStyleColumnPadding = '16px 16px 24px';

  useEffect(() => {
    if (currentView !== 'tracker') return;
    setLookupModalOpen(true);
    setCurrentView('overview');
  }, [currentView]);

  // Scroll main content to top when switching views (e.g. to Settings)
  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTop = 0;
    }
  }, [currentView]);

  const fetchTags = useCallback(async () => {
    try {
      setTagsLoading(true);
      const data = await apiCall('/api/tags/');
      const list = Array.isArray(data.results) ? data.results : [];
      setTags(list);
    } catch (err) {
      console.error('Failed to fetch tags:', err);
      setTags([]);
    } finally {
      setTagsLoading(false);
    }
  }, []);

  const toggleSidebar = useCallback(() => setSidebarVisible(v => !v), []);

  // Fetch offices on mount
  useEffect(() => {
    if (validated) fetchTags();
  }, [validated, fetchTags]);

  useEffect(() => {
    document.body.classList.add('no-bg');
    return () => document.body.classList.remove('no-bg');
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setProfileMenuOpen(false);
      }
    }
    if (profileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileMenuOpen]);

  useEffect(() => {
    const verifyAdmin = async () => {
      if (!sessionManager.isSessionValid()) {
        sessionManager.clearSession();
        window.location.href = '/login';
        return;
      }
      const token = sessionManager.getAuthToken();
      if (!token) {
        sessionManager.clearSession();
        window.location.href = '/login';
        return;
      }
      try {
        const user = await apiCall('/api/auth/user', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (user?.role !== 'admin') {
          sessionManager.clearSession();
          window.location.href = '/login';
          return;
        }
        sessionManager.setUserSession(user.username, token, user);
        sessionManager.updateActivity();
        setValidated(true);
      } catch {
        sessionManager.clearSession();
        window.location.href = '/login';
      }
    };
    verifyAdmin();
  }, []);

  if (!validated) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#f8f9fa',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <div style={{
          width: 48, height: 48,
          border: '6px solid #e3e7ef',
          borderTop: '6px solid #2a5196',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
      </div>
    );
  }

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      height: '100vh',
      overflow: 'hidden',
      backgroundColor: '#f8f9fa',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header — reuse department Header for identical icons and layout */}
      <Header
        tagName="Admin"
        tagId={null}
        profileMenuOpen={profileMenuOpen}
        profileMenuRef={profileMenuRef}
        toggleProfileMenu={() => setProfileMenuOpen(v => !v)}
        closeProfileMenu={() => setProfileMenuOpen(false)}
        logout={logout}
      />

      {/* Sidebar */}
      <AdminSidebar
        sidebarVisible={sidebarVisible}
        currentView={currentView}
        setView={setCurrentView}
        toggleSidebar={toggleSidebar}
        onOpenLookup={() => setLookupModalOpen(true)}
        lookupModalOpen={lookupModalOpen}
      />

      {/* Main Content - pinned below header (80px) and above footer; no gap so no white line */}
      <div
        ref={mainContentRef}
        className="admin-main-content"
        style={{
          position: 'absolute',
          top: 80,
          bottom: 56,
          left: sidebarVisible ? 200 : 56,
          right: 0,
          transition: 'left 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          ...(usesDepartmentStyleAdminPane
            ? { overflow: 'hidden' }
            : {
                overflowY: 'auto',
                overflowX: 'hidden',
                scrollbarGutter: 'stable',
              }),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          WebkitOverflowScrolling: 'touch',
          backgroundColor: '#fff',
          padding: usesDepartmentStyleAdminPane
            ? 0
            : usesDashboardMainPadding
              ? '10px 12px 24px'
              : '12px 24px 24px 24px',
          boxSizing: 'border-box',
          minHeight: 0,
        }}
      >
        {usesDepartmentStyleAdminPane ? (
          <div
            style={{
              flex: '1 1 0%',
              minHeight: 0,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                position: 'relative',
                flex: '1 1 0%',
                minHeight: 0,
                minWidth: 0,
                width: '100%',
              }}
            >
              <div
                className="admin-dept-scroll-pane"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  WebkitOverflowScrolling: 'touch',
                  boxSizing: 'border-box',
                }}
              >
                <div
                  className={currentView === 'settings' ? 'admin-settings-dept-style' : undefined}
                  style={{
                    maxWidth: 1440,
                    width: '100%',
                    minWidth: 0,
                    margin: '0 auto',
                    padding: adminDeptStyleColumnPadding,
                    boxSizing: 'border-box',
                  }}
                >
                  {currentView === 'offices' ? (
                    <AdminOfficesView
                      tags={tags}
                      tagsLoading={tagsLoading}
                      onSelectOffice={(id) => setCurrentView(id)}
                      onAddOffice={() => setAddOfficeModalOpen(true)}
                      onRefresh={fetchTags}
                    />
                  ) : currentView === 'settings' ? (
                    <SettingsView />
                  ) : currentView === 'employees' ? (
                    <EmployeesView tags={tags} />
                  ) : (
                    <OfficeView
                      tag={tags.find((t) => t.id === currentView)}
                      tagId={currentView}
                      onSaveSuccess={() => fetchTags()}
                      onRemove={async (tagToRemove) => {
                        try {
                          const name = tagToRemove?.name ?? tags.find((t) => t.id === currentView)?.name;
                          await apiCall(`/api/tags/${currentView}/`, { method: 'DELETE' });
                          if (name) await apiCall(`/api/auth/offices/${encodeURIComponent(name)}`, { method: 'DELETE' });
                          fetchTags();
                          setCurrentView('offices');
                        } catch (err) {
                          alert(err.message || 'Failed to remove office');
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
        <div style={{
          width: '100%',
          maxWidth: usesDashboardMainPadding ? '100%' : 1200,
          margin: usesDashboardMainPadding ? 0 : '0 auto',
          padding: usesDashboardMainPadding ? 0 : '0 24px 24px 24px',
          boxSizing: 'border-box',
        }}>
          <AdminOverviewStats
            tags={tags}
            tagsLoading={tagsLoading}
            onEmployeesClick={() => setCurrentView('employees')}
            onOfficeSelect={(id) => setCurrentView(id)}
          />
        </div>
        )}
      </div>

      <AddOfficeModal
        open={addOfficeModalOpen}
        onClose={() => setAddOfficeModalOpen(false)}
        onSuccess={(newTag) => {
          fetchTags();
          setAddOfficeModalOpen(false);
          setCurrentView(newTag?.id ?? 'offices');
        }}
      />

      <StaffDocumentLookupModal open={lookupModalOpen} onClose={() => setLookupModalOpen(false)} />

      <Footer centered />
    </div>
  );
}

export default Admin;
