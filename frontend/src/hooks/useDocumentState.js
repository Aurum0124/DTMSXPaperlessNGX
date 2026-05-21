/**
 * useDocumentState Hook
 *
 * Manages document-related state including fetching, loading, and error handling.
 * Documents list: everything at the office except items already filed in an archive drawer
 * (For Archiving but not yet filed stays on Documents). Archive list: documents with a drawer placement at this office.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiCall } from '../services/api.js';
import {
  getStatusFieldId,
  getTrackingCodeFieldIdAsync,
  getArchivingFieldIdAsync,
  getPublicTrackingFieldIdAsync,
  getCopyStateFieldIdAsync,
  getSubmittedByFieldIdAsync,
} from '../services/customFields.js';
import { getTrackingCodeFieldId, DEFAULT_DOCUMENT_STATUS, API_ENDPOINTS } from '../constants/index.js';

const FOR_ARCHIVING_VALUE = 'For Archiving';
const DOCUMENTS_PAGE_SIZE = 200;
/** Normalize Paperless list `next` URL to same-origin path so Vite proxy keeps working */
function paperlessDocumentsNextPagePath(next) {
  if (next == null || typeof next !== 'string' || next === '') return null;
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const u = new URL(next, origin);
    return u.pathname + u.search;
  } catch {
    return next.startsWith('/') ? next : null;
  }
}

export function useDocumentState(tagInfo) {
  const [files, setFiles] = useState([]);
  const [archiveFiles, setArchiveFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [error, setError] = useState('');
  const statusInitTimeoutRef = useRef(null);
  const statusFieldIdRef = useRef(null);
  const trackingCodeFieldIdRef = useRef(null);
  const filesFetchSeqRef = useRef(0);
  const archiveFetchSeqRef = useRef(0);
  const archiveDocCacheRef = useRef(new Map());

  useEffect(() => {
    return () => {
      if (statusInitTimeoutRef.current) {
        clearTimeout(statusInitTimeoutRef.current);
      }
    };
  }, []);

  const initializeDocumentStatus = useCallback(async (docId, statusFieldId) => {
    if (!statusFieldId) return false;
    try {
      const currentDoc = await apiCall(API_ENDPOINTS.DOCUMENT_DETAIL(docId));
      const existingFields = currentDoc.custom_fields || [];
      const hasStatus = existingFields.some((f) => (f.field ?? f) === statusFieldId);
      if (!hasStatus) {
        const updatedFields = [...existingFields, { field: statusFieldId, value: DEFAULT_DOCUMENT_STATUS }];
        await apiCall(API_ENDPOINTS.DOCUMENT_DETAIL(docId), {
          method: 'PATCH',
          body: JSON.stringify({ custom_fields: updatedFields }),
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const runFetch = useCallback(
    async (opts = {}) => {
      const archiveOnly = !!opts.archiveOnly;
      const fetchSeq = archiveOnly
        ? ++archiveFetchSeqRef.current
        : ++filesFetchSeqRef.current;
      const silent = !!opts.silent;
      const query = opts.searchQuery ?? opts.contentQuery;

      if (!silent) {
        if (archiveOnly) {
          setArchiveLoading(true);
          // Keep current archive list visible while refreshing to avoid blank-state flicker.
        } else {
          setLoading(true);
          setError('');
          // Keep current documents list visible while refreshing to avoid blank-state flicker.
        }
      }

      try {
        const officeTagId = Number(tagInfo?.id);
        if (!Number.isFinite(officeTagId) || officeTagId < 1) throw new Error('Office not configured');

        const [statusFieldId, tcFieldId, archivingFieldId, publicTrackingFieldId, copyStateFieldId, submittedByFieldId] = await Promise.all([
          getStatusFieldId(),
          getTrackingCodeFieldIdAsync().catch(() => getTrackingCodeFieldId()),
          getArchivingFieldIdAsync(),
          getPublicTrackingFieldIdAsync().catch(() => null),
          getCopyStateFieldIdAsync().catch(() => null),
          getSubmittedByFieldIdAsync().catch(() => null),
        ]);
        statusFieldIdRef.current = statusFieldId;
        trackingCodeFieldIdRef.current = tcFieldId;

        const trimmedQuery = query && String(query).trim() ? String(query).trim() : '';

        const normalizeTagIds = (tags) =>
          Array.isArray(tags)
            ? tags
                .map((t) => {
                  if (t && typeof t === 'object') return Number(t.id ?? t.pk);
                  return Number(t);
                })
                .filter((n) => Number.isFinite(n))
            : [];
        const tagIdNum = officeTagId;

        let sourceDocs = [];
        /** Docs at this office per Laravel transfers but possibly missing Paperless office tag */
        let atOfficeTransferIds = new Set();
        if (archiveOnly) {
          // Laravel placement is authoritative — do not rely on Paperless "For Archiving" filter (often blank after filing).
          let placedIdList = [];
          try {
            const placed = await apiCall(API_ENDPOINTS.ARCHIVE_DRAWER_PLACED_DOCUMENT_IDS);
            const raw = placed?.document_ids ?? [];
            const seenPlacement = new Set();
            for (const id of raw) {
              const n = Number(id);
              if (!Number.isFinite(n) || seenPlacement.has(n)) continue;
              seenPlacement.add(n);
              placedIdList.push(n);
            }
          } catch {
            placedIdList = [];
          }

          const seenDocIds = new Set();
          const idInChunkSize = 60;

          for (let i = 0; i < placedIdList.length; i += idInChunkSize) {
            const chunk = placedIdList.slice(i, i + idInChunkSize);
            let listUrl =
              `${API_ENDPOINTS.DOCUMENTS}?tags=${tagInfo.id}&page_size=${DOCUMENTS_PAGE_SIZE}&id__in=${chunk.join(',')}`;
            if (trimmedQuery) listUrl += `&query=${encodeURIComponent(trimmedQuery)}`;
            while (listUrl) {
              try {
                const page = await apiCall(listUrl);
                for (const doc of Array.isArray(page?.results) ? page.results : []) {
                  if (doc?.id == null || seenDocIds.has(doc.id)) continue;
                  seenDocIds.add(doc.id);
                  sourceDocs.push(doc);
                }
                listUrl = paperlessDocumentsNextPagePath(page?.next ?? null);
              } catch {
                listUrl = null;
              }
            }
          }

          // Without a server-side search, fill gaps (e.g. tag drift) via detail cache. Never do that when
          // `query` is set — detail responses do not reliably reflect Paperless search.
          const stillMissing = trimmedQuery ? [] : placedIdList.filter((id) => !seenDocIds.has(id));
          const detailBatchSize = 40;
          for (let i = 0; i < stillMissing.length; i += detailBatchSize) {
            const batch = stillMissing.slice(i, i + detailBatchSize);
            const cachedDocs = [];
            const idsToFetch = [];
            for (const id of batch) {
              const cached = archiveDocCacheRef.current.get(id);
              if (cached) cachedDocs.push(cached);
              else idsToFetch.push(id);
            }
            for (const doc of cachedDocs) {
              if (doc?.id != null && !seenDocIds.has(doc.id)) {
                seenDocIds.add(doc.id);
                sourceDocs.push(doc);
              }
            }
            if (idsToFetch.length > 0) {
              const fetchedDocs = (
                await Promise.all(
                  idsToFetch.map(async (id) => {
                    try {
                      const doc = await apiCall(API_ENDPOINTS.DOCUMENT_DETAIL(id));
                      if (doc?.id != null) archiveDocCacheRef.current.set(Number(doc.id), doc);
                      return doc;
                    } catch {
                      return null;
                    }
                  })
                )
              ).filter(Boolean);
              for (const doc of fetchedDocs) {
                if (doc?.id != null && !seenDocIds.has(doc.id)) {
                  seenDocIds.add(doc.id);
                  sourceDocs.push(doc);
                }
              }
            }
          }
        } else {
          let listUrl = `${API_ENDPOINTS.DOCUMENTS}?tags=${tagInfo.id}&page_size=${DOCUMENTS_PAGE_SIZE}`;
          if (trimmedQuery) listUrl += `&query=${encodeURIComponent(trimmedQuery)}`;
          while (listUrl) {
            const page = await apiCall(listUrl);
            const batch = Array.isArray(page?.results) ? page.results : [];
            sourceDocs.push(...batch);
            listUrl = paperlessDocumentsNextPagePath(page?.next ?? null);
          }

          // Digital-first releases can be at this office in transfers but missing the Paperless tag.
          if (!trimmedQuery) {
            try {
              const atOffice = await apiCall(API_ENDPOINTS.TRANSFERS_AT_OFFICE_DOCUMENT_IDS);
              const ids = atOffice?.document_ids ?? [];
              atOfficeTransferIds = new Set(ids.map((id) => Number(id)).filter((n) => Number.isFinite(n)));
              const seenIds = new Set(sourceDocs.map((d) => d.id));
              const missingIds = [...atOfficeTransferIds].filter((id) => !seenIds.has(id));
              const idInChunkSize = 60;
              for (let i = 0; i < missingIds.length; i += idInChunkSize) {
                const chunk = missingIds.slice(i, i + idInChunkSize);
                let extraUrl = `${API_ENDPOINTS.DOCUMENTS}?page_size=${DOCUMENTS_PAGE_SIZE}&id__in=${chunk.join(',')}`;
                while (extraUrl) {
                  try {
                    const page = await apiCall(extraUrl);
                    for (const doc of Array.isArray(page?.results) ? page.results : []) {
                      if (doc?.id != null && !seenIds.has(doc.id)) {
                        seenIds.add(doc.id);
                        sourceDocs.push(doc);
                      }
                    }
                    extraUrl = paperlessDocumentsNextPagePath(page?.next ?? null);
                  } catch {
                    extraUrl = null;
                  }
                }
              }
            } catch {
              atOfficeTransferIds = new Set();
            }
          }
        }

        const filteredDocs = sourceDocs.filter((doc) => {
          if (archiveOnly) return true;
          const tagIds = normalizeTagIds(doc?.tags);
          return tagIds.includes(tagIdNum) || atOfficeTransferIds.has(Number(doc.id));
        });

        const docsNeedingStatus = [];
        const processedDocs = filteredDocs.map((doc) => {
          const effectiveTcId = tcFieldId ?? getTrackingCodeFieldId();
          const tcField = doc.custom_fields?.find((f) => (f.field ?? f) === effectiveTcId);
          const trackingCode = tcField?.value ?? 'No tracking code';
          const statusF = doc.custom_fields?.find((f) => (f.field ?? f) === statusFieldId);
          const status = statusF?.value ?? DEFAULT_DOCUMENT_STATUS;
          const copyStateField =
            copyStateFieldId != null
              ? doc.custom_fields?.find((f) => Number(f.field ?? f) === Number(copyStateFieldId))
              : null;
          const copyState = copyStateField?.value != null ? String(copyStateField.value).trim() : '';

          const submittedByField =
            submittedByFieldId != null
              ? doc.custom_fields?.find((f) => Number(f.field ?? f) === Number(submittedByFieldId))
              : null;
          const submittedBy = submittedByField?.value != null ? String(submittedByField.value).trim() : '';

          const archF =
            archivingFieldId != null
              ? doc.custom_fields?.find((f) => Number(f.field ?? f) === Number(archivingFieldId))
              : null;
          const archivingVal = archF?.value != null ? String(archF.value).trim() : '';
          const isForArchiving = archivingVal === FOR_ARCHIVING_VALUE;

          const ptField =
            publicTrackingFieldId != null
              ? doc.custom_fields?.find((f) => Number(f.field ?? f) === Number(publicTrackingFieldId))
              : null;
          const ptVal = ptField?.value != null ? String(ptField.value).trim().toLowerCase() : '';
          const isUntrackedFromField = ptVal === 'untracked';

          if (!statusF && statusFieldId) docsNeedingStatus.push(doc.id);

          const documentTypeId =
            doc.document_type != null
              ? typeof doc.document_type === 'object'
                ? doc.document_type.id ?? doc.document_type
                : doc.document_type
              : null;
          return {
            id: doc.id,
            title: doc.title || doc.filename || doc.name,
            trackingCode,
            status,
            documentTypeId,
            tags: normalizeTagIds(doc.tags),
            created: doc.created,
            added: doc.added,
            pageCount: doc.page_count ?? doc.pageCount ?? null,
            content: doc.content != null ? String(doc.content) : '',
            copyState,
            submittedBy,
            _isForArchiving: isForArchiving,
            isUntrackedFromField,
          };
        });

        const archivingDocIds = archiveOnly
          ? processedDocs.map((d) => d.id)
          : processedDocs.filter((d) => d._isForArchiving).map((d) => d.id);
        let placements = {};
        if (archivingDocIds.length > 0) {
          // Chunk requests to avoid intermittent failures from oversized query strings.
          const chunkSize = 120;
          const chunks = [];
          for (let i = 0; i < archivingDocIds.length; i += chunkSize) {
            chunks.push(archivingDocIds.slice(i, i + chunkSize));
          }
          const placementParts = await Promise.all(
            chunks.map(async (ids) => {
              try {
                const pr = await apiCall(
                  `${API_ENDPOINTS.ARCHIVE_DRAWER_PLACEMENTS}?document_ids=${ids.join(',')}`
                );
                return pr?.placements ?? {};
              } catch {
                return {};
              }
            })
          );
          for (const part of placementParts) {
            placements = { ...placements, ...part };
          }
        }
        const isFiledInArchiveDrawer = (docId) => {
          const p = placements[String(docId)] ?? placements[docId];
          return p != null && p.drawer_id != null;
        };

        let list = processedDocs;
        if (archiveOnly) {
          // Placement is authoritative for archive visibility, including digital-only cases.
          list = list.filter((d) => isFiledInArchiveDrawer(d.id));
        } else {
          list = list.filter((d) => !d._isForArchiving || !isFiledInArchiveDrawer(d.id));
        }
        list = list.map(({ _isForArchiving, ...rest }) => ({ ...rest, markedForArchiving: _isForArchiving }));

        const keptIds = new Set(list.map((d) => d.id));
        const docsForStatusInit = !archiveOnly
          ? docsNeedingStatus.filter((id) => keptIds.has(id))
          : [];

        const needsActionIds = list.filter((d) => d.status === 'Needs Action').map((d) => d.id);
        let needsActionBadgeIds = new Set();
        if (needsActionIds.length > 0 && tagInfo?.id) {
          try {
            const res = await apiCall(
              `/api/needs-action-badge?tag_id=${tagInfo.id}&document_ids=${needsActionIds.join(',')}`
            );
            needsActionBadgeIds = new Set(res?.document_ids ?? []);
          } catch {
            /* ignore */
          }
        }

        let docsWithBadge = list.map((f) => ({
          ...f,
          showNeedsActionBadge: f.status !== 'Needs Action' || needsActionBadgeIds.has(f.id),
        }));

        docsWithBadge = docsWithBadge.map((f) => {
          const p = placements[String(f.id)] ?? placements[f.id];
          if (!p) return f;
          return {
            ...f,
            markedForArchiving: true,
            archiveDrawerName: p?.drawer_name ?? null,
            archiveDrawerId: p?.drawer_id != null ? Number(p.drawer_id) : null,
            archiveFolderId: p?.folder_id != null ? Number(p.folder_id) : null,
            archiveFolderNumber: p?.folder_number != null ? Number(p.folder_number) : null,
            archiveFolderName: p?.folder_name != null && String(p.folder_name).trim() !== '' ? String(p.folder_name).trim() : null,
            archiveReference: p?.archive_reference ?? null,
            archivedAt: p?.archived_at ?? null,
            archiveCabinetCode: p?.cabinet_code ?? null,
            archiveDrawerCode: p?.drawer_code ?? null,
          };
        });

        let hiddenSet = new Set();
        if (docsWithBadge.length > 0) {
          try {
            const hid = await apiCall(
              `${API_ENDPOINTS.DOCUMENT_PUBLIC_ROUTE_HIDDEN}?document_ids=${docsWithBadge.map((d) => d.id).join(',')}`
            );
            hiddenSet = new Set((hid?.hidden_document_ids ?? []).map(Number));
          } catch {
            /* ignore */
          }
        }

        docsWithBadge = docsWithBadge.map((f) => {
          const fromField = Boolean(f.isUntrackedFromField);
          const { isUntrackedFromField: _omitUntrackedField, ...rest } = f;
          return {
            ...rest,
            isUntrackedPublic: fromField || hiddenSet.has(f.id),
          };
        });

        const latestSeq = archiveOnly ? archiveFetchSeqRef.current : filesFetchSeqRef.current;
        if (fetchSeq !== latestSeq) return;
        if (archiveOnly) {
          setArchiveFiles(docsWithBadge);
        } else {
          setFiles(docsWithBadge);

          if (docsForStatusInit.length > 0 && statusFieldId) {
            const sid = statusFieldId;
            const docIdsSet = new Set(docsForStatusInit);
            statusInitTimeoutRef.current = setTimeout(() => {
              Promise.all(docsForStatusInit.map((docId) => initializeDocumentStatus(docId, sid))).then(() => {
                setFiles((prev) =>
                  prev.map((f) =>
                    docIdsSet.has(f.id)
                      ? { ...f, status: DEFAULT_DOCUMENT_STATUS, showNeedsActionBadge: true }
                      : f
                  )
                );
              });
            }, 100);
          }
        }
      } catch (err) {
        const latestSeq = archiveOnly ? archiveFetchSeqRef.current : filesFetchSeqRef.current;
        if (fetchSeq !== latestSeq) return;
        setError(archiveOnly ? 'Error loading archive' : 'Error fetching documents');
        console.error('Error fetching documents:', err);
      } finally {
        const latestSeq = archiveOnly ? archiveFetchSeqRef.current : filesFetchSeqRef.current;
        if (fetchSeq !== latestSeq) return;
        if (archiveOnly) setArchiveLoading(false);
        else setLoading(false);
      }
    },
    [tagInfo?.id, initializeDocumentStatus]
  );

  const fetchDocs = useCallback((opts = {}) => runFetch({ ...opts, archiveOnly: false }), [runFetch]);

  const fetchArchiveDocs = useCallback((opts = {}) => runFetch({ ...opts, archiveOnly: true }), [runFetch]);

  const updateDocumentStatus = useCallback(
    async (docId, newStatus, remarks) => {
      try {
        const body = { status: newStatus };
        if (remarks != null && String(remarks).trim()) body.remarks = String(remarks).trim();
        await apiCall(API_ENDPOINTS.DOCUMENT_STATUS(docId), {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        await Promise.all([fetchDocs({ silent: true }), fetchArchiveDocs({ silent: true })]);
      } catch (err) {
        setError('Failed to update document status');
        console.error('Error updating document status:', err);
      }
    },
    [fetchDocs, fetchArchiveDocs]
  );

  /**
   * Forward document to another department
   *
   * @param {number} docId - Document ID
   * @param {number} newTagId - New department tag ID
   */
  const forwardDocument = useCallback(
    async (docId, newTagId) => {
      try {
        await apiCall(API_ENDPOINTS.DOCUMENT_DETAIL(docId), {
          method: 'PATCH',
          body: JSON.stringify({ tags: [newTagId] }),
        });
        await fetchDocs();
        await fetchArchiveDocs({ silent: true });
      } catch (err) {
        setError('Failed to forward document');
        console.error('Error forwarding document:', err);
      }
    },
    [fetchDocs, fetchArchiveDocs]
  );

  return {
    files,
    archiveFiles,
    loading,
    archiveLoading,
    error,

    fetchDocs,
    fetchArchiveDocs,
    updateDocumentStatus,
    forwardDocument,
    initializeDocumentStatus,

    setError,
  };
}
