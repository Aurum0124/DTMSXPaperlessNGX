import { useMemo, useState, useEffect, useCallback } from 'react';
import { apiCall } from '../services/api.js';
import { API_ENDPOINTS } from '../constants/apiEndpoints.js';
import { getArchiveCabinetDrawerSections } from '../utils/archiveCabinetDrawers.js';
import { drawerDisplayLabel, folderOptionLabel } from '../utils/drawerCategoryLabel.js';
import { COLORS } from '../constants/uiConstants.js';
import AddOutlineButton from './ui/AddOutlineButton.jsx';
import ConfirmationModal from './modals/ConfirmationModal.jsx';

function TrashIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

const trashBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px 8px',
  border: 'none',
  borderRadius: 6,
  background: 'transparent',
  color: '#94a3b8',
  cursor: 'pointer',
};

/**
 * Full-page cabinets & drawers management; open Archive filtered by drawer from here.
 */
function CabinetsView({
  tagConfigured = true,
  archiveCabinets = [],
  onCabinetsUpdated,
  onOpenArchiveForDrawer,
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [newDrawerCount, setNewDrawerCount] = useState('1');
  const [addingCabinet, setAddingCabinet] = useState(false);
  const [addError, setAddError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [deletingKey, setDeletingKey] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [newFolderNumberByDrawer, setNewFolderNumberByDrawer] = useState({});
  const [newFolderNameByDrawer, setNewFolderNameByDrawer] = useState({});

  const drawerCountNum = Math.min(50, Math.max(0, Math.floor(Number(newDrawerCount))));
  const drawerCountValid =
    newDrawerCount === '' ||
    (Number.isFinite(Number(newDrawerCount)) && drawerCountNum >= 0 && drawerCountNum <= 50);

  const { cabinetDrawerSections } = useMemo(
    () => getArchiveCabinetDrawerSections(archiveCabinets),
    [archiveCabinets]
  );

  const closeAddModal = useCallback(() => {
    if (addingCabinet) return;
    setAddOpen(false);
    setAddError(null);
  }, [addingCabinet]);

  useEffect(() => {
    if (!addOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeAddModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addOpen, closeAddModal]);

  const handleAddCabinet = async () => {
    if (!drawerCountValid) return;
    const n = Number.isFinite(Number(newDrawerCount)) ? drawerCountNum : 0;
    setAddingCabinet(true);
    setAddError(null);
    try {
      const cabRes = await apiCall(API_ENDPOINTS.ARCHIVE_CABINETS, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const cabinetId = cabRes?.cabinet?.id;
      if (cabinetId == null) throw new Error('Cabinet was not returned by the server');
      if (n > 0) {
        try {
          await apiCall(API_ENDPOINTS.ARCHIVE_DRAWERS, {
            method: 'POST',
            body: JSON.stringify({ cabinet_id: Number(cabinetId), drawer_count: n }),
          });
        } catch (drawerErr) {
          setAddError(
            `Cabinet was created, but drawers could not be added: ${drawerErr.message || 'Unknown error'}`
          );
          onCabinetsUpdated?.();
          return;
        }
      }
      setNewDrawerCount('1');
      setAddOpen(false);
      onCabinetsUpdated?.();
    } catch (err) {
      setAddError(err.message || 'Could not add cabinet');
    } finally {
      setAddingCabinet(false);
    }
  };

  const cabinetDeleteMessage = (cab) => {
    const drawers = cab.drawers ?? [];
    const n = drawers.length;
    const label = `C${cab.code}`;
    return n > 0
      ? `Remove ${label} and ${n} drawer(s)? You can only do this if no drawer contains archived documents.`
      : `Remove ${label}?`;
  };

  const executeRemoveCabinet = async (cab) => {
    setActionError(null);
    setDeletingKey(`cabinet-${cab.id}`);
    try {
      await apiCall(API_ENDPOINTS.ARCHIVE_CABINET_DETAIL(cab.id), { method: 'DELETE' });
      onCabinetsUpdated?.();
    } catch (err) {
      setActionError(err.message || 'Could not remove cabinet');
    } finally {
      setDeletingKey(null);
    }
  };

  const addFolderToDrawer = async (drawer) => {
    const raw = String(newFolderNumberByDrawer[drawer.id] ?? '').trim();
    const n = parseInt(raw, 10);
    const folderName = String(newFolderNameByDrawer[drawer.id] ?? '').trim();
    if (!folderName) {
      setActionError('Enter a folder name.');
      return;
    }
    if (!Number.isFinite(n) || n < 1 || n > 9999) {
      setActionError('Enter a folder number between 1 and 9999.');
      return;
    }
    setActionError(null);
    setDeletingKey(`folder-add-${drawer.id}`);
    try {
      await apiCall(API_ENDPOINTS.ARCHIVE_DRAWER_FOLDERS(drawer.id), {
        method: 'POST',
        body: JSON.stringify({ folder_number: n, name: folderName }),
      });
      setNewFolderNumberByDrawer((prev) => ({ ...prev, [drawer.id]: '' }));
      setNewFolderNameByDrawer((prev) => ({ ...prev, [drawer.id]: '' }));
      onCabinetsUpdated?.();
    } catch (err) {
      setActionError(err.message || 'Could not add folder');
    } finally {
      setDeletingKey(null);
    }
  };

  const executeRemoveFolder = async (folder, drawer) => {
    setActionError(null);
    setDeletingKey(`folder-${folder.id}`);
    try {
      await apiCall(API_ENDPOINTS.ARCHIVE_FOLDER_DETAIL(folder.id), { method: 'DELETE' });
      onCabinetsUpdated?.();
    } catch (err) {
      setActionError(err.message || 'Could not remove folder');
    } finally {
      setDeletingKey(null);
    }
  };

  const executeRemoveDrawer = async (drawer) => {
    setActionError(null);
    setDeletingKey(`drawer-${drawer.id}`);
    try {
      await apiCall(API_ENDPOINTS.ARCHIVE_DRAWER_DETAIL(drawer.id), { method: 'DELETE' });
      onCabinetsUpdated?.();
    } catch (err) {
      setActionError(err.message || 'Could not remove drawer');
    } finally {
      setDeletingKey(null);
    }
  };

  const handleConfirmPendingDelete = async () => {
    if (!pendingDelete) return;
    const p = pendingDelete;
    setPendingDelete(null);
    if (p.type === 'cabinet') await executeRemoveCabinet(p.cab);
    else if (p.type === 'drawer') await executeRemoveDrawer(p.drawer);
    else await executeRemoveFolder(p.folder, p.drawer);
  };

  const deleteModalTitle =
    pendingDelete?.type === 'cabinet'
      ? 'Remove cabinet'
      : pendingDelete?.type === 'drawer'
        ? 'Remove drawer'
        : pendingDelete?.type === 'folder'
          ? 'Remove folder'
          : '';

  const deleteModalMessage =
    pendingDelete?.type === 'cabinet'
      ? cabinetDeleteMessage(pendingDelete.cab)
      : pendingDelete?.type === 'drawer'
        ? `Remove drawer D${pendingDelete.drawer.drawer_code} (${drawerDisplayLabel(pendingDelete.drawer)})? Only allowed if it has no archived documents.`
        : pendingDelete?.type === 'folder'
          ? `Remove folder ${folderOptionLabel(pendingDelete.folder)} from drawer D${pendingDelete.drawer.drawer_code}?`
          : '';

  if (!tagConfigured) {
    return (
      <div style={{ padding: 0, color: '#64748b', fontSize: 15, lineHeight: 1.5 }}>
        Office is not configured. Cabinets are available after your account is linked to an office.
      </div>
    );
  }

  const busy = deletingKey != null;

  const cabinetGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 400px), 1fr))',
    gap: 20,
    margin: 0,
    padding: 0,
    listStyle: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
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
        <div style={{ minWidth: 'min(100%, 280px)', flex: '1 1 320px' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Cabinets</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
            Physical archive layout for this office (C codes and D codes). Add cabinets here, then file documents from
            the document viewer when archiving.
          </p>
        </div>
        <AddOutlineButton
          type="button"
          onClick={() => {
            setAddError(null);
            setActionError(null);
            setAddOpen(true);
          }}
        >
          Add cabinet
        </AddOutlineButton>
      </header>

      {addOpen && (
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
            if (e.target === e.currentTarget) closeAddModal();
          }}
        >
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-cabinet-modal-title"
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
              onSubmit={(e) => {
                e.preventDefault();
                handleAddCabinet();
              }}
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
                  id="add-cabinet-modal-title"
                  className="modal-title"
                  style={{ margin: 0, fontSize: 18, fontWeight: 600, color: COLORS.PRIMARY }}
                >
                  Create new cabinet
                </h4>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  disabled={addingCabinet}
                  onClick={closeAddModal}
                  style={{
                    padding: 0,
                    margin: 0,
                    width: 32,
                    height: 32,
                    border: 'none',
                    background: 'transparent',
                    cursor: addingCabinet ? 'not-allowed' : 'pointer',
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
                <div style={{ marginBottom: 0 }}>
                  <label
                    htmlFor="cabinets-new-drawer-count"
                    className="form-label"
                    style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 8 }}
                  >
                    Number of drawers
                  </label>
                  <input
                    id="cabinets-new-drawer-count"
                    type="number"
                    min={0}
                    max={50}
                    value={newDrawerCount}
                    onChange={(e) => setNewDrawerCount(e.target.value)}
                    disabled={addingCabinet}
                    className="form-control"
                    style={{
                      width: '100%',
                      maxWidth: 280,
                      boxSizing: 'border-box',
                      padding: '10px 12px',
                      fontSize: 14,
                      border: '1px solid #ced4da',
                      borderRadius: 4,
                      outline: 'none',
                    }}
                  />
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: '#6c757d' }}>Optional — use 0 to add only the cabinet.</p>
                </div>
                {addError && (
                  <p style={{ margin: '12px 0 0', fontSize: 13, color: '#b91c1c', lineHeight: 1.45 }}>{addError}</p>
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
                  disabled={addingCabinet}
                  onClick={closeAddModal}
                  style={{
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#6c757d',
                    background: '#fff',
                    border: '1px solid #6c757d',
                    borderRadius: 4,
                    cursor: addingCabinet ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={addingCabinet || !drawerCountValid}
                  style={{
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#fff',
                    background: addingCabinet || !drawerCountValid ? '#94a3b8' : '#2a5196',
                    border: '1px solid transparent',
                    borderRadius: 4,
                    cursor: addingCabinet || !drawerCountValid ? 'not-allowed' : 'pointer',
                  }}
                >
                  {addingCabinet ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {actionError && (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#b91c1c', lineHeight: 1.45 }}>{actionError}</p>
      )}

      {archiveCabinets.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', lineHeight: 1.5 }}>
          No cabinets yet. Use <strong style={{ color: '#64748b' }}>Add cabinet</strong> above.
        </p>
      ) : (
        <ul style={cabinetGridStyle}>
          {cabinetDrawerSections.map(({ cab, drawers }) => (
            <li
              key={cab.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#fff',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  padding: '14px 44px 12px',
                  textAlign: 'center',
                  borderBottom: '1px solid #e5e7eb',
                  background: '#f8fafc',
                }}
              >
                <button
                  type="button"
                  title="Remove cabinet"
                  aria-label={`Remove cabinet C${cab.code}`}
                  disabled={busy}
                  onClick={() => setPendingDelete({ type: 'cabinet', cab })}
                  style={{
                    ...trashBtnStyle,
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    color: deletingKey === `cabinet-${cab.id}` ? '#cbd5e1' : '#94a3b8',
                    opacity: busy && deletingKey !== `cabinet-${cab.id}` ? 0.45 : 1,
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (!busy) {
                      e.currentTarget.style.color = '#dc2626';
                      e.currentTarget.style.background = '#fef2f2';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#94a3b8';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <TrashIcon size={16} />
                </button>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    color: '#2a5196',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  C{cab.code}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                  }}
                >
                  Cabinet
                </div>
              </div>

              <div style={{ flex: 1, minHeight: 0, padding: '12px 14px 14px' }}>
                {drawers.length === 0 ? (
                  <p style={{ margin: 0, padding: '8px 4px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>
                    No drawers yet
                  </p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {drawers.map((d) => {
                      const drawerFolders = Array.isArray(d.folders)
                        ? [...d.folders].sort((a, b) => Number(a.folder_number) - Number(b.folder_number))
                        : [];
                      return (
                        <li
                          key={d.id}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            fontSize: 13,
                            color: '#374151',
                            background: '#fafafa',
                            border: '1px solid #e5e7eb',
                            borderRadius: 8,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'minmax(48px, auto) auto',
                              alignItems: 'start',
                              gap: '10px 12px',
                              padding: '10px 12px',
                            }}
                          >
                            <span
                              style={{
                                fontWeight: 700,
                                color: '#64748b',
                                fontVariantNumeric: 'tabular-nums',
                                fontSize: 12,
                                paddingTop: 2,
                              }}
                            >
                              D{d.drawer_code}
                            </span>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                flexShrink: 0,
                                justifySelf: 'end',
                                flexWrap: 'wrap',
                                justifyContent: 'flex-end',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => onOpenArchiveForDrawer?.(Number(d.id))}
                                style={{
                                  padding: '6px 10px',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: '#2a5196',
                                  background: '#fff',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Archive
                              </button>
                              <button
                                type="button"
                                title="Remove drawer"
                                aria-label={`Remove drawer D${d.drawer_code}`}
                                disabled={busy}
                                onClick={() => setPendingDelete({ type: 'drawer', drawer: d })}
                                style={{
                                  ...trashBtnStyle,
                                  color: deletingKey === `drawer-${d.id}` ? '#cbd5e1' : '#94a3b8',
                                  opacity: busy && deletingKey !== `drawer-${d.id}` ? 0.45 : 1,
                                  cursor: busy ? 'not-allowed' : 'pointer',
                                }}
                                onMouseEnter={(e) => {
                                  if (!busy) {
                                    e.currentTarget.style.color = '#dc2626';
                                    e.currentTarget.style.background = '#fef2f2';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = '#94a3b8';
                                  e.currentTarget.style.background = 'transparent';
                                }}
                              >
                                <TrashIcon size={16} />
                              </button>
                            </div>
                          </div>
                          <div
                            style={{
                              padding: '8px 12px 10px',
                              borderTop: '1px dashed #e5e7eb',
                              background: '#fff',
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                color: '#94a3b8',
                                marginBottom: 6,
                              }}
                            >
                              Folders inside drawer
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                              {drawerFolders.length === 0 ? (
                                <span style={{ fontSize: 12, color: '#94a3b8' }}>No folders — add a name and number below.</span>
                              ) : (
                                drawerFolders.map((f) => (
                                  <span
                                    key={f.id}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      padding: '4px 8px',
                                      fontSize: 12,
                                      fontWeight: 600,
                                      color: '#0f172a',
                                      background: '#f1f5f9',
                                      borderRadius: 6,
                                      border: '1px solid #e2e8f0',
                                    }}
                                    title={folderOptionLabel(f)}
                                  >
                                    {folderOptionLabel(f)}
                                    <button
                                      type="button"
                                      title="Remove folder"
                                      disabled={busy || deletingKey === `folder-${f.id}`}
                                      onClick={() => setPendingDelete({ type: 'folder', folder: f, drawer: d })}
                                      style={{
                                        border: 'none',
                                        background: 'transparent',
                                        padding: 0,
                                        margin: 0,
                                        cursor: busy || deletingKey === `folder-${f.id}` ? 'not-allowed' : 'pointer',
                                        color: '#94a3b8',
                                        fontSize: 14,
                                        lineHeight: 1,
                                      }}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))
                              )}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                              <input
                                type="text"
                                placeholder="Folder name"
                                value={newFolderNameByDrawer[d.id] ?? ''}
                                onChange={(e) =>
                                  setNewFolderNameByDrawer((prev) => ({ ...prev, [d.id]: e.target.value }))
                                }
                                disabled={busy || deletingKey === `folder-add-${d.id}`}
                                style={{
                                  flex: '1 1 140px',
                                  minWidth: 120,
                                  maxWidth: 220,
                                  padding: '6px 8px',
                                  fontSize: 13,
                                  borderRadius: 6,
                                  border: '1px solid #e5e7eb',
                                  boxSizing: 'border-box',
                                }}
                              />
                              <input
                                type="number"
                                min={1}
                                max={9999}
                                placeholder="Folder #"
                                value={newFolderNumberByDrawer[d.id] ?? ''}
                                onChange={(e) =>
                                  setNewFolderNumberByDrawer((prev) => ({ ...prev, [d.id]: e.target.value }))
                                }
                                disabled={busy || deletingKey === `folder-add-${d.id}`}
                                style={{
                                  width: 100,
                                  padding: '6px 8px',
                                  fontSize: 13,
                                  borderRadius: 6,
                                  border: '1px solid #e5e7eb',
                                  boxSizing: 'border-box',
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => addFolderToDrawer(d)}
                                disabled={busy || deletingKey === `folder-add-${d.id}`}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: '#fff',
                                  background: busy || deletingKey === `folder-add-${d.id}` ? '#94a3b8' : '#2a5196',
                                  border: 'none',
                                  borderRadius: 6,
                                  cursor: busy || deletingKey === `folder-add-${d.id}` ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {deletingKey === `folder-add-${d.id}` ? 'Adding…' : 'Add folder'}
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmationModal
        open={pendingDelete != null}
        title={deleteModalTitle}
        message={deleteModalMessage}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        danger
        onConfirm={handleConfirmPendingDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default CabinetsView;
