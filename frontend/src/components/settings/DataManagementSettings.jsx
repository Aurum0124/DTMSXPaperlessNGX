import { useState, useCallback, useEffect } from 'react';
import { apiCall } from '../../services/api.js';
import { API_ENDPOINTS } from '../../constants/index.js';
import ConfirmationModal from '../modals/ConfirmationModal.jsx';

const BATCH_SIZE = 100;

/**
 * Fetch documents from Paperless (paginated).
 * Optional filterParam for documents list.
 */
async function fetchDocuments(filterParam = null) {
  const docs = [];
  let url = `${API_ENDPOINTS.DOCUMENTS}?page_size=${BATCH_SIZE}`;
  if (filterParam) {
    url += `&${filterParam}`;
  }
  let nextUrl = url;

  while (nextUrl) {
    const data = await apiCall(nextUrl);
    const results = data?.results ?? [];
    docs.push(...results);
    nextUrl = data?.next ?? null;
  }
  return docs;
}

/**
 * Fetch trashed documents via GET /api/trash/ (if available) or documents with filter.
 */
async function fetchTrashedDocumentIds() {
  try {
    const docs = [];
    let nextUrl = API_ENDPOINTS.DOCUMENTS_TRASH;
    while (nextUrl) {
      const data = await apiCall(nextUrl);
      const results = data?.results ?? (Array.isArray(data) ? data : []);
      docs.push(...results);
      nextUrl = data?.next ?? null;
    }
    return docs.map((d) => d.id ?? d.pk).filter((id) => id != null);
  } catch {
    /* GET /api/trash/ not available, fall back to documents filter */
  }

  const defaultDocs = await fetchDocuments();
  const trashFromFilter = defaultDocs
    .filter((d) => d.trashed != null && d.trashed !== false && d.trashed !== '')
    .map((d) => d.id ?? d.pk)
    .filter((id) => id != null);

  if (trashFromFilter.length > 0) return trashFromFilter;

  for (const param of ['trashed__isnull=false', 'trashed=true']) {
    try {
      const docs = await fetchDocuments(param);
      const ids = docs.map((d) => d.id ?? d.pk).filter((id) => id != null);
      if (ids.length > 0) return ids;
    } catch {
      /* skip */
    }
  }
  return [];
}

/**
 * Fetch active document IDs (default documents list excludes trashed).
 */
async function fetchActiveDocumentIds() {
  const docs = await fetchDocuments();
  return docs
    .filter((d) => !d.trashed || d.trashed === false || d.trashed === '')
    .map((d) => d.id ?? d.pk)
    .filter((id) => id != null);
}

/**
 * Fetch active and trash document IDs.
 */
async function fetchDocumentIdsByStatus() {
  const [activeIds, trashIds] = await Promise.all([
    fetchActiveDocumentIds(),
    fetchTrashedDocumentIds(),
  ]);
  return { activeIds, trashIds };
}

/**
 * Bulk delete (move to trash) documents via Paperless bulk_edit API.
 */
async function bulkDeleteDocuments(ids) {
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    await apiCall(API_ENDPOINTS.DOCUMENTS_BULK_EDIT, {
      method: 'POST',
      body: JSON.stringify({
        documents: batch,
        method: 'delete',
        parameters: {},
      }),
    });
  }
}

/**
 * Empty trash via Paperless TrashRequest API.
 * POST /api/trash/ with { documents: [ids], action: 'empty' }
 * If ids is empty, tries { documents: [], action: 'empty' } in case API empties all.
 */
async function emptyTrash(ids) {
  const toEmpty = ids.length > 0 ? ids : [];
  if (toEmpty.length > 0) {
    for (let i = 0; i < toEmpty.length; i += BATCH_SIZE) {
      const batch = toEmpty.slice(i, i + BATCH_SIZE);
      await apiCall(API_ENDPOINTS.DOCUMENTS_TRASH, {
        method: 'POST',
        body: JSON.stringify({
          documents: batch,
          action: 'empty',
        }),
      });
    }
  } else {
    await apiCall(API_ENDPOINTS.DOCUMENTS_TRASH, {
      method: 'POST',
      body: JSON.stringify({
        documents: [],
        action: 'empty',
      }),
    });
  }
}

function DataManagementSettings() {
  const [deleteAllStatus, setDeleteAllStatus] = useState('idle'); // idle | loading | success | error
  const [emptyTrashStatus, setEmptyTrashStatus] = useState('idle');
  const [deleteAllError, setDeleteAllError] = useState('');
  const [emptyTrashError, setEmptyTrashError] = useState('');
  const [confirmType, setConfirmType] = useState(null); // 'deleteDocuments' | 'emptyTrash' | null
  const [activeCount, setActiveCount] = useState(null);
  const [trashCount, setTrashCount] = useState(null);

  const refreshCounts = useCallback(async () => {
    try {
      const { activeIds, trashIds } = await fetchDocumentIdsByStatus();
      setActiveCount(activeIds.length);
      setTrashCount(trashIds.length);
    } catch {
      setActiveCount(null);
      setTrashCount(null);
    }
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  const handleDeleteAll = () => {
    setConfirmType('deleteDocuments');
  };

  const doDeleteAll = async () => {
    setDeleteAllStatus('loading');
    setDeleteAllError('');
    try {
      const { activeIds: ids } = await fetchDocumentIdsByStatus();
      if (ids.length === 0) {
        setDeleteAllStatus('success');
        setDeleteAllError('');
        return;
      }
      await bulkDeleteDocuments(ids);
      setDeleteAllStatus('success');
      await refreshCounts();
    } catch (err) {
      setDeleteAllStatus('error');
      setDeleteAllError(err.message || 'Failed to delete documents');
    }
  };

  const handleEmptyTrash = () => {
    setConfirmType('emptyTrash');
  };

  const doEmptyTrash = async () => {
    setEmptyTrashStatus('loading');
    setEmptyTrashError('');
    try {
      const { trashIds } = await fetchDocumentIdsByStatus();
      await emptyTrash(trashIds);
      setEmptyTrashStatus('success');
      await refreshCounts();
    } catch (err) {
      setEmptyTrashStatus('error');
      setEmptyTrashError(err.message || 'Failed to empty trash');
    }
  };

  return (
    <div>
      <h2 style={{ color: '#374151', fontSize: 18, margin: '0 0 8px 0' }}>Data Management</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            padding: 16,
            border: '1px solid #e9ecef',
            borderRadius: 8,
            background: '#f8f9fa',
          }}
        >
          <h3 style={{ color: '#374151', fontSize: 15, margin: '0 0 8px 0' }}>
            Delete All Documents
          </h3>
          <p style={{ color: '#6c757d', fontSize: 13, margin: '0 0 12px 0' }}>
            Move all active documents to trash. Documents remain recoverable until trash is emptied.
            {activeCount != null && (
              <span style={{ display: 'block', marginTop: 4, fontWeight: 500 }}>
                Active documents: {activeCount}
              </span>
            )}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={deleteAllStatus === 'loading'}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                color: '#fff',
                background: '#dc3545',
                border: 'none',
                borderRadius: 6,
                cursor: deleteAllStatus === 'loading' ? 'not-allowed' : 'pointer',
                opacity: deleteAllStatus === 'loading' ? 0.7 : 1,
              }}
            >
              {deleteAllStatus === 'loading' ? 'Deleting…' : 'Delete All Documents'}
            </button>
            <button
              type="button"
              onClick={refreshCounts}
              style={{
                padding: '6px 12px',
                fontSize: 13,
                color: '#6c757d',
                background: 'transparent',
                border: '1px solid #dee2e6',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Refresh counts
            </button>
          </div>
          {deleteAllError && (
            <p style={{ color: '#dc3545', fontSize: 13, marginTop: 8 }}>{deleteAllError}</p>
          )}
          {deleteAllStatus === 'success' && (
            <p style={{ color: '#22c55e', fontSize: 13, marginTop: 8 }}>
              Documents moved to trash.
            </p>
          )}
        </div>

        <div
          style={{
            padding: 16,
            border: '1px solid #e9ecef',
            borderRadius: 8,
            background: '#f8f9fa',
          }}
        >
          <h3 style={{ color: '#374151', fontSize: 15, margin: '0 0 8px 0' }}>Empty Trash</h3>
          <p style={{ color: '#6c757d', fontSize: 13, margin: '0 0 12px 0' }}>
            Permanently delete all documents in trash. This cannot be undone.
            {trashCount != null && (
              <span style={{ display: 'block', marginTop: 4, fontWeight: 500 }}>
                Documents in trash: {trashCount}
              </span>
            )}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleEmptyTrash}
              disabled={emptyTrashStatus === 'loading'}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                color: '#fff',
                background: '#b02a37',
                border: 'none',
                borderRadius: 6,
                cursor: emptyTrashStatus === 'loading' ? 'not-allowed' : 'pointer',
                opacity: emptyTrashStatus === 'loading' ? 0.7 : 1,
              }}
            >
              {emptyTrashStatus === 'loading' ? 'Emptying…' : 'Empty Trash'}
            </button>
          </div>
          {emptyTrashError && (
            <p style={{ color: '#dc3545', fontSize: 13, marginTop: 8 }}>{emptyTrashError}</p>
          )}
          {emptyTrashStatus === 'success' && (
            <p style={{ color: '#22c55e', fontSize: 13, marginTop: 8 }}>Trash emptied.</p>
          )}
        </div>
      </div>

      <ConfirmationModal
        open={confirmType === 'deleteDocuments'}
        title="Delete all documents?"
        message="This will move ALL documents to trash. They can be restored from trash until you empty it. Continue?"
        confirmLabel="Yes, move to trash"
        cancelLabel="Cancel"
        danger
        onConfirm={() => {
          setConfirmType(null);
          doDeleteAll();
        }}
        onCancel={() => setConfirmType(null)}
      />

      <ConfirmationModal
        open={confirmType === 'emptyTrash'}
        title="Empty trash?"
        message="This will PERMANENTLY delete all documents in trash. This cannot be undone. Continue?"
        confirmLabel="Yes, empty trash"
        cancelLabel="Cancel"
        danger
        onConfirm={() => {
          setConfirmType(null);
          doEmptyTrash();
        }}
        onCancel={() => setConfirmType(null)}
      />
    </div>
  );
}

export default DataManagementSettings;
