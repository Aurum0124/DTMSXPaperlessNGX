import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDocumentHistory } from '../../hooks/index.js';
import { apiCall } from '../../services/api.js';
import { API_ENDPOINTS } from '../../constants/apiEndpoints.js';
import { formatArchivedAt, formatArchiveCabinetDrawerLine } from '../../utils/formatArchivedAt.js';
import { archiveFolderFullPath, drawerOptionLabel, folderOptionLabel } from '../../utils/drawerCategoryLabel.js';
import PrintBarcodeModal from './PrintBarcodeModal.jsx';
import StatusBadge from '../ui/StatusBadge.jsx';
import ArchiveStateBadges from '../ui/ArchiveStateBadges.jsx';
import UntrackedBadge from '../ui/UntrackedBadge.jsx';
import ViewerToolbarButton from '../ui/ViewerToolbarButton.jsx';

const COLORS = {
  primary: '#2a5196',
  wrongOffice: '#dc2626',
  inTransit: '#f59e0b',
};

const DOC_VIEWER_ICON_PRINT = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);
const DOC_VIEWER_ICON_ENDORSE = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" />
  </svg>
);
const DOC_VIEWER_ICON_NOTE = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const DOC_VIEWER_ICON_TAKE_ACTION = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const DOC_VIEWER_ICON_LOCK = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const DOC_VIEWER_ICON_ARCHIVE = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 8v13H3V8" />
    <path d="M1 3h22v5H1z" />
    <path d="M10 12h4" />
  </svg>
);
const DOC_VIEWER_ICON_CHEVRON = ({ expanded }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

function CollapsibleSection({ title, count, open, onToggle, children }) {
  return (
    <div style={{ marginBottom: 12, border: '1px solid #e9ecef', borderRadius: 8, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
          color: '#374151',
          textAlign: 'left',
        }}
      >
        <span>{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {count != null && count > 0 && (
            <span style={{ fontSize: 12, fontWeight: 500, color: '#6c757d' }}>{count}</span>
          )}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && <div style={{ padding: '10px', borderTop: '1px solid #e9ecef' }}>{children}</div>}
    </div>
  );
}

/**
 * DocumentViewerModal Component
 * Uses /api/preview proxy - no Paperless credential popup
 */

function DocumentViewerModal({
  viewingDocument,
  documents = [],
  onClose,
  onNavigate,
  allTags = [],
  tagInfo = null,
  canApproveReject = false,
  onStatusChange,
  onEndorsementSuccess,
  onArchiveSuccess,
  timelineRefreshTrigger,
}) {
  const [showPrintBarcode, setShowPrintBarcode] = useState(false);
  const [showActionTakenForm, setShowActionTakenForm] = useState(false);
  const [actionRemarks, setActionRemarks] = useState('');
  const [actionOutcome, setActionOutcome] = useState('Approved');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [routeOpen, setRouteOpen] = useState(true);
  const [statusOpen, setStatusOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteError, setNoteError] = useState(null);
  const [noteRefreshTrigger, setNoteRefreshTrigger] = useState(0);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [noteUpdating, setNoteUpdating] = useState(false);
  const [endorsing, setEndorsing] = useState(false);
  const [showEndorseForm, setShowEndorseForm] = useState(false);
  const [endorseRemarks, setEndorseRemarks] = useState('');
  const [editingEndorsementId, setEditingEndorsementId] = useState(null);
  const [editEndorsementRemarks, setEditEndorsementRemarks] = useState('');
  const [endorsementUpdating, setEndorsementUpdating] = useState(false);
  const [editingStatusChangeId, setEditingStatusChangeId] = useState(null);
  const [editStatusChangeRemarks, setEditStatusChangeRemarks] = useState('');
  const [statusChangeUpdating, setStatusChangeUpdating] = useState(false);
  const [documentTypeName, setDocumentTypeName] = useState(null);
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);
  const [archiveError, setArchiveError] = useState(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveCabinets, setArchiveCabinets] = useState([]);
  const [selectedCabinetId, setSelectedCabinetId] = useState('');
  const [selectedDrawerId, setSelectedDrawerId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [archiveStructureLoading, setArchiveStructureLoading] = useState(false);
  const [archivePlacementRef, setArchivePlacementRef] = useState(null);
  const [archivePlacementDrawerName, setArchivePlacementDrawerName] = useState(null);
  const [archivePlacementCabinetCode, setArchivePlacementCabinetCode] = useState(null);
  const [archivePlacementDrawerCode, setArchivePlacementDrawerCode] = useState(null);
  const [archivePlacementFolderNumber, setArchivePlacementFolderNumber] = useState(null);
  const [archivePlacementFolderName, setArchivePlacementFolderName] = useState(null);
  const [archivePlacementArchivedAt, setArchivePlacementArchivedAt] = useState(null);
  const [archiveMode, setArchiveMode] = useState('local'); // local | handoff
  const [handoffOfficeId, setHandoffOfficeId] = useState('');
  const [archiveModalFolderSearch, setArchiveModalFolderSearch] = useState('');
  const [archiveFabExpanded, setArchiveFabExpanded] = useState(false);
  const [showDigitalOnlyNotice, setShowDigitalOnlyNotice] = useState(false);
  const archiveFabRef = useRef(null);
  const docId = viewingDocument?.id;
  const previewSrc = docId ? `/api/preview/${docId}` : null;
  const trackingCode = viewingDocument?.trackingCode;
  const hasTrackingCode = trackingCode && trackingCode !== 'No tracking code';
  const submittedBy = String(viewingDocument?.submittedBy ?? '').trim();

  useEffect(() => {
    setArchiveError(null);
    setArchiveSubmitting(false);
    setShowArchiveModal(false);
    setArchiveCabinets([]);
    setSelectedCabinetId('');
    setSelectedDrawerId('');
    setSelectedFolderId('');
    setArchivePlacementRef(null);
    setArchivePlacementDrawerName(null);
    setArchivePlacementCabinetCode(null);
    setArchivePlacementDrawerCode(null);
    setArchivePlacementFolderNumber(null);
    setArchivePlacementFolderName(null);
    setArchivePlacementArchivedAt(null);
    setArchiveMode('local');
    setHandoffOfficeId('');
    setArchiveModalFolderSearch('');
    setArchiveFabExpanded(false);
  }, [docId]);

  useEffect(() => {
    const copyState = String(viewingDocument?.copyState ?? '').toLowerCase();
    const isDigitalPending = copyState.includes('digital') && copyState.includes('pending');
    setShowDigitalOnlyNotice(isDigitalPending);
  }, [docId, viewingDocument?.copyState]);

  useEffect(() => {
    if (!archiveFabExpanded) return;
    const handleClickOutside = (e) => {
      if (archiveFabRef.current && !archiveFabRef.current.contains(e.target)) {
        setArchiveFabExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [archiveFabExpanded]);

  useEffect(() => {
    if (!docId || !tagInfo) {
      setArchivePlacementRef(null);
      setArchivePlacementDrawerName(null);
      setArchivePlacementCabinetCode(null);
      setArchivePlacementDrawerCode(null);
      setArchivePlacementFolderNumber(null);
      setArchivePlacementFolderName(null);
      setArchivePlacementArchivedAt(null);
      return;
    }
    let cancelled = false;
    apiCall(API_ENDPOINTS.ARCHIVE_DRAWER_FOR_DOCUMENT(docId))
      .then((data) => {
        if (cancelled) return;
        setArchivePlacementRef(data?.archive_reference ?? null);
        setArchivePlacementDrawerName(data?.drawer?.name ?? null);
        setArchivePlacementCabinetCode(data?.drawer?.cabinet_code ?? null);
        setArchivePlacementDrawerCode(data?.drawer?.drawer_code ?? null);
        const fn = data?.drawer?.folder_number;
        setArchivePlacementFolderNumber(fn != null && fn !== '' ? Number(fn) : null);
        const fName = data?.drawer?.folder_name;
        setArchivePlacementFolderName(
          fName != null && String(fName).trim() !== '' ? String(fName).trim() : null
        );
        setArchivePlacementArchivedAt(data?.archived_at ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setArchivePlacementRef(null);
          setArchivePlacementDrawerName(null);
          setArchivePlacementCabinetCode(null);
          setArchivePlacementDrawerCode(null);
          setArchivePlacementFolderNumber(null);
          setArchivePlacementFolderName(null);
          setArchivePlacementArchivedAt(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [docId, tagInfo]);

  useEffect(() => {
    if (!showArchiveModal || !tagInfo || archiveMode !== 'local') return;
    let cancelled = false;
    (async () => {
      setArchiveStructureLoading(true);
      setArchiveError(null);
      try {
        const data = await apiCall(API_ENDPOINTS.ARCHIVE_CABINETS);
        if (cancelled) return;
        const cabinets = data?.cabinets ?? [];
        setArchiveCabinets(cabinets);
        setArchiveModalFolderSearch('');
        setSelectedCabinetId('');
        setSelectedDrawerId('');
        setSelectedFolderId('');
        if (cabinets.length === 1) {
          setSelectedCabinetId(String(cabinets[0].id));
          const dr = cabinets[0].drawers ?? [];
          if (dr.length === 1) setSelectedDrawerId(String(dr[0].id));
        }
      } catch (e) {
        if (!cancelled) {
          setArchiveError(e.message || 'Could not load archive structure');
          setArchiveCabinets([]);
        }
      } finally {
        if (!cancelled) setArchiveStructureLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showArchiveModal, tagInfo, archiveMode]);

  useEffect(() => {
    const id = viewingDocument?.documentTypeId;
    if (id == null) {
      setDocumentTypeName(null);
      return;
    }
    let cancelled = false;
    apiCall(API_ENDPOINTS.DOCUMENT_TYPES)
      .then((data) => {
        if (cancelled) return;
        const results = data?.results ?? (Array.isArray(data) ? data : []);
        const type = results.find((t) => (t.id ?? t.pk) === id || String(t.id ?? t.pk) === String(id));
        setDocumentTypeName(type ? (type.name ?? type.slug ?? '') : null);
      })
      .catch(() => { if (!cancelled) setDocumentTypeName(null); });
    return () => { cancelled = true; };
  }, [viewingDocument?.documentTypeId]);

  const {
    history,
    transfers,
    endorsements,
    endorsementProgress,
    loading: loadingHistory,
    error: historyError,
    formatTimestamp,
    getActionText
  } = useDocumentHistory(viewingDocument?.id, {
    allTags,
    refreshTrigger: (timelineRefreshTrigger ?? 0) + noteRefreshTrigger,
  });

  const currentIndex = documents?.length ? documents.findIndex(d => d.id === viewingDocument?.id) : -1;
  const prevDoc = currentIndex > 0 ? documents[currentIndex - 1] : null;
  const nextDoc = currentIndex >= 0 && currentIndex < documents.length - 1 ? documents[currentIndex + 1] : null;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && prevDoc && onNavigate) {
        e.preventDefault();
        onNavigate(prevDoc);
      }
      if (e.key === 'ArrowRight' && nextDoc && onNavigate) {
        e.preventDefault();
        onNavigate(nextDoc);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, prevDoc, nextDoc, onNavigate]);

  const handleAddNote = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    const text = noteText?.trim();
    if (!text || !docId) return;
    setNoteSubmitting(true);
    setNoteError(null);
    try {
      await apiCall(`/api/document-comments/${docId}`, {
        method: 'POST',
        body: JSON.stringify({ note: text }),
      });
      setNoteText('');
      setShowNoteForm(false);
      setNoteRefreshTrigger((t) => t + 1);
    } catch (err) {
      setNoteError(err.message || 'Failed to add note');
    } finally {
      setNoteSubmitting(false);
    }
  };

  const handleUpdateNote = async (noteId) => {
    const text = editNoteText?.trim();
    if (!text || noteUpdating || !noteId) return;
    setNoteUpdating(true);
    try {
      await apiCall(`/api/document-comments/${noteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ note: text }),
      });
      setEditingNoteId(null);
      setEditNoteText('');
      setNoteRefreshTrigger((t) => t + 1);
    } catch (err) {
      alert(err.message || 'Failed to update note');
    } finally {
      setNoteUpdating(false);
    }
  };

  const startEditingNote = (entry) => {
    setEditingNoteId(entry.noteId ?? null);
    setEditNoteText(entry.noteText || '');
  };

  const cancelEditingNote = () => {
    setEditingNoteId(null);
    setEditNoteText('');
  };

  const tagList = Array.isArray(allTags?.results) ? allTags.results : (Array.isArray(allTags) ? allTags : []);
  const tagIdToName = useMemo(() => {
    const map = {};
    for (const t of tagList) {
      const id = t?.id ?? t?.pk;
      if (id != null) map[id] = t?.name ?? `Office ${id}`;
    }
    return map;
  }, [tagList]);

  const handoffOfficeOptions = useMemo(() => {
    const cur = tagInfo?.id != null ? Number(tagInfo.id) : null;
    if (cur == null) return [];
    return tagList
      .map((t) => {
        const id = t?.id ?? t?.pk;
        if (id == null) return null;
        const n = Number(id);
        if (n === cur) return null;
        return { id: n, name: t?.name ?? `Office ${id}` };
      })
      .filter(Boolean);
  }, [tagList, tagInfo?.id]);

  const { fixedRoute, inTransit, currentLocationTagId, inTransitFromTagId, inTransitToTagId } = useMemo(() => {
    const t = transfers ?? [];
    const releases = t.filter((x) => x?.type === 'release' || x?.type === 'archive_release');
    const originalRelease = releases.find((r) => Array.isArray(r?.route_sequence) && r.route_sequence.length > 0);
    let baseRoute = [];
    if (originalRelease) {
      const fromId = originalRelease.from_tag_id;
      if (fromId != null) {
        baseRoute.push({ tag_id: fromId, name: tagIdToName[fromId] ?? `Office ${fromId}`, issued_by: true, wrong_office: false });
      }
      for (const tagId of originalRelease.route_sequence) {
        baseRoute.push({ tag_id: tagId, name: tagIdToName[tagId] ?? `Office ${tagId}`, issued_by: false, wrong_office: false });
      }
    }
    let fixedRoute = [...baseRoute];
    let lastReleaseFrom = originalRelease?.from_tag_id != null ? Number(originalRelease.from_tag_id) : null;
    for (const tr of t) {
      if (tr?.type === 'release' || tr?.type === 'archive_release') {
        lastReleaseFrom = tr.from_tag_id != null ? Number(tr.from_tag_id) : null;
        continue;
      }
      if (tr?.type === 'receive' && tr?.received_at_wrong_office) {
        const wrongTagId = tr.to_tag_id != null ? Number(tr.to_tag_id) : null;
        if (wrongTagId == null) continue;
        let inserted = false;
        const newResult = [];
        for (const step of fixedRoute) {
          newResult.push(step);
          if (!inserted && step.tag_id === lastReleaseFrom) {
            newResult.push({
              tag_id: wrongTagId,
              name: tagIdToName[wrongTagId] ?? `Office ${wrongTagId}`,
              issued_by: false,
              wrong_office: true,
            });
            inserted = true;
          }
        }
        if (!inserted) {
          newResult.push({
            tag_id: wrongTagId,
            name: tagIdToName[wrongTagId] ?? `Office ${wrongTagId}`,
            issued_by: false,
            wrong_office: true,
          });
        }
        fixedRoute = newResult;
        lastReleaseFrom = wrongTagId;
      }
    }
    const lastTransfer = t.length > 0 ? t[t.length - 1] : null;
    const inTransit = lastTransfer?.type === 'release' || lastTransfer?.type === 'archive_release';
    const lastRelease = releases.length > 0 ? releases[releases.length - 1] : null;
    let inTransitFromTagId = null;
    let inTransitToTagId = null;
    let currentLocationTagId = null;
    if (inTransit && lastRelease) {
      inTransitFromTagId = lastRelease.from_tag_id != null ? Number(lastRelease.from_tag_id) : null;
      const seq = lastRelease.route_sequence;
      inTransitToTagId = (Array.isArray(seq) && seq.length > 0) ? Number(seq[0]) : null;
      if (inTransitToTagId == null && inTransitFromTagId != null && fixedRoute.length > 0) {
        const routeOffices = fixedRoute.filter((s) => s.tag_id != null).map((s) => Number(s.tag_id));
        const fromIdx = routeOffices.indexOf(inTransitFromTagId);
        if (fromIdx >= 0 && fromIdx < routeOffices.length - 1) {
          inTransitToTagId = routeOffices[fromIdx + 1];
        }
      }
    } else {
      const docTags = viewingDocument?.tags ?? [];
      currentLocationTagId = docTags.length > 0 ? Number(docTags[0]) : null;
    }
    return { fixedRoute, inTransit, currentLocationTagId, inTransitFromTagId, inTransitToTagId };
  }, [transfers, viewingDocument?.tags, tagIdToName]);

  const { canShowEndorse } = useMemo(() => {
    const t = transfers ?? [];
    const releases = t.filter((x) => x?.type === 'release');
    const originalRelease = releases.find((r) => Array.isArray(r?.route_sequence) && r.route_sequence.length > 0);
    const currentTagId = tagInfo?.id != null ? Number(tagInfo.id) : null;
    if (currentTagId == null || inTransit) {
      return { canShowEndorse: false, hasEndorsed: false };
    }
    if (currentLocationTagId != null && Number(currentLocationTagId) !== currentTagId) {
      return { canShowEndorse: false, hasEndorsed: false };
    }
    const endorsedByCurrent = (endorsements ?? []).some((e) => Number(e.tag_id) === currentTagId);
    if (!originalRelease) {
      const allowEndorse = tagInfo?.allowEndorse !== false;
      return { canShowEndorse: !endorsedByCurrent && allowEndorse, hasEndorsed: endorsedByCurrent };
    }
    const canTake = (originalRelease.route_can_take_action ?? []).length > 0
      ? (originalRelease.route_can_take_action ?? []).map(Number)
      : (originalRelease.route_sequence?.length ? [Number(originalRelease.route_sequence[originalRelease.route_sequence.length - 1])] : []);
    const routeOffices = (originalRelease.route_sequence ?? []).map(Number);
    const inRoute = routeOffices.includes(currentTagId);
    const canTakeAction = canTake.map(Number).includes(currentTagId);
    const canShow = inRoute && !canTakeAction && !endorsedByCurrent;
    const allowEndorse = tagInfo?.allowEndorse !== false;
    return { canShowEndorse: canShow && allowEndorse, hasEndorsed: endorsedByCurrent };
  }, [transfers, endorsements, tagInfo?.id, tagInfo?.allowEndorse, inTransit, currentLocationTagId]);

  const resolvedArchiveReference = viewingDocument?.archiveReference ?? archivePlacementRef ?? null;
  const resolvedArchiveDrawerName = viewingDocument?.archiveDrawerName ?? archivePlacementDrawerName ?? null;
  const resolvedArchiveCabinetCode = viewingDocument?.archiveCabinetCode ?? archivePlacementCabinetCode ?? null;
  const resolvedArchiveDrawerCode = viewingDocument?.archiveDrawerCode ?? archivePlacementDrawerCode ?? null;
  const resolvedArchiveFolderNumber = viewingDocument?.archiveFolderNumber ?? archivePlacementFolderNumber ?? null;
  const resolvedArchiveFolderName = viewingDocument?.archiveFolderName ?? archivePlacementFolderName ?? null;
  const resolvedArchivedAt = viewingDocument?.archivedAt ?? archivePlacementArchivedAt ?? null;
  const resolvedArchiveLocationLine = formatArchiveCabinetDrawerLine({
    cabinetCode: resolvedArchiveCabinetCode,
    drawerName: resolvedArchiveDrawerName,
    drawerCode: resolvedArchiveDrawerCode,
    folderNumber: resolvedArchiveFolderNumber,
    folderName: resolvedArchiveFolderName,
  });
  const hasArchivePlacement = Boolean(resolvedArchiveReference || resolvedArchiveDrawerName);
  const canMarkArchive =
    !!docId &&
    !!tagInfo &&
    (viewingDocument?.status === 'Approved' || viewingDocument?.status === 'Rejected') &&
    viewingDocument?.copyState !== 'Digital (physical pending)' &&
    (!viewingDocument?.markedForArchiving || !hasArchivePlacement);
  const hasFixedRouting = fixedRoute.length > 0;

  const selectedArchiveCabinetEntity = useMemo(() => {
    if (!selectedCabinetId) return null;
    return archiveCabinets.find((x) => String(x.id) === String(selectedCabinetId)) ?? null;
  }, [archiveCabinets, selectedCabinetId]);

  const drawersInSelectedCabinet = useMemo(() => {
    if (!selectedCabinetId) return [];
    const c = selectedArchiveCabinetEntity;
    return Array.isArray(c?.drawers) ? c.drawers : [];
  }, [selectedArchiveCabinetEntity, selectedCabinetId]);

  const selectedArchiveDrawer = useMemo(() => {
    if (!selectedDrawerId) return null;
    return drawersInSelectedCabinet.find((d) => String(d.id) === String(selectedDrawerId)) ?? null;
  }, [drawersInSelectedCabinet, selectedDrawerId]);

  const foldersInSelectedDrawer = useMemo(() => {
    const raw = selectedArchiveDrawer?.folders;
    if (!Array.isArray(raw)) return [];
    return [...raw].sort((a, b) => Number(a.folder_number) - Number(b.folder_number));
  }, [selectedArchiveDrawer]);

  const allArchiveModalFoldersWithPath = useMemo(() => {
    const out = [];
    for (const cab of archiveCabinets) {
      for (const d of cab.drawers ?? []) {
        for (const f of d.folders ?? []) {
          if (f?.id == null) continue;
          out.push({
            id: f.id,
            folder: f,
            drawer: d,
            cabinet: cab,
            pathLine: archiveFolderFullPath(cab, d, f),
          });
        }
      }
    }
    return out;
  }, [archiveCabinets]);

  const archiveModalFolderSearchMatches = useMemo(() => {
    const q = archiveModalFolderSearch.trim().toLowerCase();
    if (q.length === 0) return [];
    return allArchiveModalFoldersWithPath
      .filter((row) => {
        const pl = row.pathLine.toLowerCase();
        if (pl.includes(q)) return true;
        const n = row.folder?.folder_number != null ? String(row.folder.folder_number) : '';
        const name = row.folder?.name != null ? String(row.folder.name).toLowerCase() : '';
        return n.includes(q) || name.includes(q);
      })
      .slice(0, 50);
  }, [allArchiveModalFoldersWithPath, archiveModalFolderSearch]);

  const needsArchiveFolder = foldersInSelectedDrawer.length > 0;
  const localArchiveConfirmDisabled =
    !selectedCabinetId ||
    !selectedDrawerId ||
    archiveStructureLoading ||
    foldersInSelectedDrawer.length === 0 ||
    !selectedFolderId;

  useEffect(() => {
    if (!selectedDrawerId) {
      setSelectedFolderId('');
      return;
    }
    if (foldersInSelectedDrawer.length === 1) {
      setSelectedFolderId(String(foldersInSelectedDrawer[0].id));
    } else {
      setSelectedFolderId('');
    }
  }, [selectedDrawerId, foldersInSelectedDrawer]);

  const canTakeActionByStatus = useMemo(
    () =>
      Boolean(canApproveReject && onStatusChange && docId) &&
      (viewingDocument?.status === 'Under Review' || viewingDocument?.status === 'Needs Action') &&
      viewingDocument?.showNeedsActionBadge !== false,
    [canApproveReject, onStatusChange, docId, viewingDocument?.status, viewingDocument?.showNeedsActionBadge]
  );
  const isDigitalPendingActionLocked =
    String(viewingDocument?.copyState ?? '').toLowerCase().includes('digital') &&
    String(viewingDocument?.copyState ?? '').toLowerCase().includes('pending');

  const documentToolbarActions = useMemo(() => {
    const list = [];
    if (hasTrackingCode) {
      list.push({
        key: 'print',
        label: 'Print Barcode',
        icon: DOC_VIEWER_ICON_PRINT,
        onClick: () => setShowPrintBarcode(true),
      });
    }
    if (canShowEndorse && docId) {
      list.push({
        key: 'endorse',
        label: 'Endorse',
        icon: isDigitalPendingActionLocked ? DOC_VIEWER_ICON_LOCK : DOC_VIEWER_ICON_ENDORSE,
        disabled: isDigitalPendingActionLocked,
        title: isDigitalPendingActionLocked
          ? 'Restricted: wait for physical document before endorsing'
          : undefined,
        onClick: () => setShowEndorseForm(true),
      });
    }
    if (docId) {
      list.push({
        key: 'note',
        label: 'Note',
        icon: isDigitalPendingActionLocked ? DOC_VIEWER_ICON_LOCK : DOC_VIEWER_ICON_NOTE,
        disabled: isDigitalPendingActionLocked,
        title: isDigitalPendingActionLocked
          ? 'Restricted: wait for physical document before adding notes'
          : undefined,
        onClick: () => {
          setNoteError(null);
          setShowNoteForm(true);
        },
      });
    }
    if (canTakeActionByStatus) {
      list.push({
        key: 'takeAction',
        label: 'Take Action',
        icon: isDigitalPendingActionLocked ? DOC_VIEWER_ICON_LOCK : DOC_VIEWER_ICON_TAKE_ACTION,
        disabled: isDigitalPendingActionLocked,
        title: isDigitalPendingActionLocked
          ? 'Restricted: physical document must be received at your office first'
          : undefined,
        onClick: () => setShowActionTakenForm(true),
      });
    }
    return list;
  }, [hasTrackingCode, canShowEndorse, docId, canTakeActionByStatus, isDigitalPendingActionLocked]);

  const handleEndorse = async () => {
    const remarks = endorseRemarks?.trim();
    if (!docId || endorsing || !remarks) return;
    setEndorsing(true);
    try {
      await apiCall(`/api/document-endorsements/${docId}`, {
        method: 'POST',
        body: JSON.stringify({ remarks }),
      });
      setShowEndorseForm(false);
      setEndorseRemarks('');
      setNoteRefreshTrigger((t) => t + 1);
      onEndorsementSuccess?.();
    } catch (err) {
      alert(err.message || 'Failed to endorse');
    } finally {
      setEndorsing(false);
    }
  };

  const handleUpdateEndorsementRemarks = async (endorsementId) => {
    const remarks = editEndorsementRemarks?.trim();
    if (!remarks || endorsementUpdating) return;
    setEndorsementUpdating(true);
    try {
      await apiCall(`/api/document-endorsements/${endorsementId}`, {
        method: 'PATCH',
        body: JSON.stringify({ remarks }),
      });
      setEditingEndorsementId(null);
      setEditEndorsementRemarks('');
      setNoteRefreshTrigger((t) => t + 1);
    } catch (err) {
      alert(err.message || 'Failed to update endorsement remarks');
    } finally {
      setEndorsementUpdating(false);
    }
  };

  const startEditingEndorsement = (entry) => {
    setEditingEndorsementId(entry.endorsementId ?? entry.id);
    setEditEndorsementRemarks(entry.noteText || '');
  };

  const cancelEditingEndorsement = () => {
    setEditingEndorsementId(null);
    setEditEndorsementRemarks('');
  };

  const handleUpdateStatusChangeRemarks = async (statusChangeId) => {
    if (statusChangeUpdating) return;
    setStatusChangeUpdating(true);
    try {
      await apiCall(`/api/document-status-changes/${statusChangeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ remarks: editStatusChangeRemarks?.trim() || '' }),
      });
      setEditingStatusChangeId(null);
      setEditStatusChangeRemarks('');
      setNoteRefreshTrigger((t) => t + 1);
    } catch (err) {
      alert(err.message || 'Failed to update remarks');
    } finally {
      setStatusChangeUpdating(false);
    }
  };

  const startEditingStatusChange = (entry) => {
    setEditingStatusChangeId(entry.statusChangeId ?? entry.id);
    setEditStatusChangeRemarks(entry.noteText || '');
  };

  const cancelEditingStatusChange = () => {
    setEditingStatusChangeId(null);
    setEditStatusChangeRemarks('');
  };

  if (!viewingDocument) return null;

  const isNeedsActionPaperless = (e) =>
    e.source === 'paperless' && e.changes?.custom_fields?.field === 'Document Status' && e.changes?.custom_fields?.value === 'Needs Action';

  const historyEntries = (history || []).filter(
    (e) => (e.source === 'transfer' || e.source === 'paperless') && !isNeedsActionPaperless(e)
  );
  const statusChangeEntries = (history || []).filter(
    (e) => e.source === 'status_change' || isNeedsActionPaperless(e)
  );
  const noteEntries = (history || []).filter((e) => e.source === 'note');
  const endorsementEntries = (history || []).filter((e) => e.source === 'endorsement');

  const renderEntry = (entry, index, isLast) => (
    <div key={entry.id ?? `entry-${index}`} style={{ position: 'relative', paddingLeft: '20px', marginBottom: 10 }}>
      {!isLast && (
        <div style={{ position: 'absolute', left: 6, top: 24, bottom: -12, width: 2, background: '#e9ecef' }} />
      )}
      <div
        className={isLast ? 'document-viewer-timeline-dot-current' : ''}
        style={{
          position: 'absolute',
          left: 0,
          top: 6,
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: '#2a5196',
          border: '2px solid #fff',
          boxShadow: '0 0 0 2px #e9ecef',
        }}
      />
      <div style={{ background: '#fff', borderRadius: 8, padding: 10, border: '1px solid #e9ecef', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#2a5196', marginBottom: 4 }}>{getActionText(entry)}</div>
        {((entry.source === 'note' || entry.source === 'status_change' || entry.source === 'endorsement') && entry.noteText) && (
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{entry.noteText}</div>
        )}
        <div style={{ fontSize: 12, color: '#6c757d' }}>{formatTimestamp(entry.timestamp)}</div>
      </div>
    </div>
  );

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.35)',
        zIndex: 3000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 0.2s'
      }}
      onClick={onClose}
    >
      {/* Prev/Next navigation - outside modal, on overlay */}
      {onNavigate && (prevDoc || nextDoc) && (
        <>
          {prevDoc && (
            <button
              onClick={(e) => { e.stopPropagation(); onNavigate(prevDoc); }}
              aria-label="Previous document"
              style={{
                position: 'absolute',
                zIndex: 3010,
                left: 16,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.95)',
                border: '1px solid #e5e7eb',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                boxSizing: 'border-box',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 36,
                lineHeight: 1,
                padding: 0,
                color: '#2a5196',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          {nextDoc && (
            <button
              onClick={(e) => { e.stopPropagation(); onNavigate(nextDoc); }}
              aria-label="Next document"
              style={{
                position: 'absolute',
                zIndex: 3010,
                right: 16,
                left: 'auto',
                top: '50%',
                transform: 'translateY(-50%)',
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.95)',
                border: '1px solid #e5e7eb',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                boxSizing: 'border-box',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 36,
                lineHeight: 1,
                padding: 0,
                color: '#2a5196',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </>
      )}
      <div 
        style={{
          background: '#fff',
          borderRadius: 14,
          minWidth: 840,
          maxWidth: '99vw',
          width: '99vw',
          height: '98vh',
          boxShadow: '0 8px 32px rgba(42,81,150,0.18)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'row',
          /* overflow visible so Archive (and similar) dropdowns are not clipped */
          overflow: 'visible'
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 10,
            background: 'none',
            border: 'none',
            fontSize: 18,
            color: '#9ca3af',
            cursor: 'pointer',
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>
        {/* Side Panel */}
        <div style={{
          width: 260,
          minWidth: 220,
          background: '#f8f9fa',
          borderRight: '1px solid #e9ecef',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Side panel header */}
          <div style={{ marginBottom: 12, borderBottom: '1px solid #e9ecef', paddingBottom: 12 }}>
            <h3 style={{ margin: 0, color: '#2a5196', fontWeight: 600, fontSize: '18px' }}>Document</h3>
            <p style={{ margin: '6px 0 0 0', color: '#6c757d', fontSize: 14 }}>{trackingCode || 'No tracking code'}</p>
            {submittedBy ? (
              <p style={{ margin: '6px 0 0 0', fontSize: 13, lineHeight: 1.45, color: '#374151' }}>
                <span style={{ color: '#6c757d', fontWeight: 500 }}>Submitted by: </span>
                {submittedBy}
              </p>
            ) : null}
            <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <StatusBadge status={viewingDocument?.status || 'Under Review'} showNeedsActionBadge={viewingDocument?.showNeedsActionBadge !== false} />
              <ArchiveStateBadges
                markedForArchiving={!!viewingDocument?.markedForArchiving}
                archiveDrawerName={resolvedArchiveDrawerName}
                archiveFolderName={resolvedArchiveFolderName}
                archiveReference={resolvedArchiveReference}
              />
              {viewingDocument?.isUntrackedPublic ? <UntrackedBadge /> : null}
              {viewingDocument?.copyState ? (
                <span
                  title="Document copy state"
                  style={{
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: 9,
                    fontWeight: 600,
                    color: String(viewingDocument.copyState).toLowerCase().includes('pending') ? '#1e3a8a' : '#495057',
                    backgroundColor: String(viewingDocument.copyState).toLowerCase().includes('pending') ? '#dbeafe' : '#e9ecef',
                    letterSpacing: '0.02em',
                  }}
                >
                  {String(viewingDocument.copyState)}
                </span>
              ) : null}
              {String(viewingDocument?.copyState ?? '').toLowerCase().includes('digital') &&
                String(viewingDocument?.copyState ?? '').toLowerCase().includes('pending') ? (
                  <span
                    style={{
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: 9,
                      fontWeight: 600,
                      color: '#7c2d12',
                      backgroundColor: '#ffedd5',
                      letterSpacing: '0.02em',
                    }}
                    title="Action is blocked until physical document is received"
                  >
                    ACTION LOCKED
                  </span>
                ) : null}
              {documentTypeName && (
                <span style={{
                  padding: '2px 5px',
                  borderRadius: 4,
                  fontSize: 9,
                  fontWeight: 600,
                  color: '#495057',
                  backgroundColor: '#e9ecef',
                  letterSpacing: '0.02em',
                }}>
                  {documentTypeName}
                </span>
              )}
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', paddingRight: 8 }}>
            {loadingHistory ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, color: '#6c757d', fontSize: 14 }}>Loading…</div>
            ) : historyError ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, color: '#dc3545', fontSize: 14, textAlign: 'center' }}>{historyError}</div>
            ) : (
              <>
                {fixedRoute.length > 0 && (
                  <CollapsibleSection
                    title="Document Route"
                    count={fixedRoute.filter((s) => !s.issued_by).length}
                    open={routeOpen}
                    onToggle={() => setRouteOpen((o) => !o)}
                  >
                    {(() => {
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingTop: 2 }}>
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
                                  gap: 12,
                                  paddingBottom: idx < steps.length - 1 ? 12 : 0,
                                  position: 'relative',
                                }}
                              >
                                <div
                                  className={isCurrent && !step.wrong_office ? (step.isInTransit ? 'document-viewer-route-pulse-yellow' : 'document-viewer-route-pulse-blue') : ''}
                                  style={{
                                    flexShrink: 0,
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    background: step.wrong_office ? COLORS.wrongOffice : (step.isInTransit ? COLORS.inTransit : COLORS.primary),
                                    border: '2px solid #fff',
                                    boxShadow: '0 0 0 1px #dee2e6',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 11,
                                    color: '#fff',
                                    fontWeight: 600,
                                  }}
                                >
                                  {displayNum ?? ''}
                                </div>
                                {idx < steps.length - 1 && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      left: 11,
                                      top: 26,
                                      bottom: 0,
                                      width: 2,
                                      background: steps[idx + 1]?.wrong_office
                                        ? COLORS.wrongOffice
                                        : (inTransit && (step.isInTransit || steps[idx + 1]?.isInTransit))
                                          ? COLORS.inTransit
                                          : COLORS.primary,
                                    }}
                                  />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', lineHeight: 1.4 }}>
                                    {step.label}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </CollapsibleSection>
                )}

                <CollapsibleSection
                  title="Status"
                  count={statusChangeEntries.length + (hasArchivePlacement && resolvedArchivedAt ? 1 : 0)}
                  open={statusOpen}
                  onToggle={() => setStatusOpen((o) => !o)}
                >
                  {statusChangeEntries.length === 0 &&
                    (!hasArchivePlacement || !resolvedArchivedAt) && (
                    <p style={{ margin: 0, fontSize: 13, color: '#6c757d' }}>No status changes yet</p>
                  )}
                  {statusChangeEntries.length > 0 && (
                    <div>
                      {[...statusChangeEntries]
                        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                        .map((entry, i, arr) => {
                          const isOwnStatusChange = entry.source === 'status_change' && entry.tag_id != null && tagInfo?.id != null && Number(entry.tag_id) === Number(tagInfo.id);
                          const canEditStatusChange = isOwnStatusChange && canApproveReject;
                          const archivedFollows = !!(hasArchivePlacement && resolvedArchivedAt);
                          const isTimelineLast = i === arr.length - 1 && !archivedFollows;
                          const rendered = renderEntry(entry, i, isTimelineLast);
                          if (canEditStatusChange) {
                            return (
                              <div key={entry.id ?? `status-${i}`} style={{ position: 'relative' }}>
                                {rendered}
                                <button
                                  type="button"
                                  onClick={() => startEditingStatusChange(entry)}
                                  aria-label="Edit remarks"
                                  style={{
                                    position: 'absolute',
                                    top: 6,
                                    right: 6,
                                    padding: 4,
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#6c757d',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                              </div>
                            );
                          }
                          return rendered;
                        })}
                    </div>
                  )}
                  {hasArchivePlacement && resolvedArchivedAt && (
                    <div style={{ position: 'relative', paddingLeft: 20, marginBottom: 0 }}>
                      <div
                        className="document-viewer-timeline-dot-current"
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 6,
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          background: '#2a5196',
                          border: '2px solid #fff',
                          boxShadow: '0 0 0 2px #e9ecef',
                        }}
                      />
                      <div
                        style={{
                          background: '#fff',
                          borderRadius: 8,
                          padding: '10px 12px',
                          border: '1px solid #e9ecef',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#2a5196', marginBottom: 6 }}>Archived at</div>
                        {resolvedArchiveLocationLine && (
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: '#0f172a',
                              marginBottom: 6,
                              lineHeight: 1.45,
                              wordBreak: 'break-word',
                            }}
                          >
                            {resolvedArchiveLocationLine}
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: 12,
                            color: '#64748b',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {formatArchivedAt(resolvedArchivedAt)}
                        </div>
                      </div>
                    </div>
                  )}
                </CollapsibleSection>

                <CollapsibleSection
                  title={
                    endorsementProgress && endorsementProgress.required > 0
                      ? `Notes (${endorsementProgress.endorsed}/${endorsementProgress.required} endorsement)`
                      : 'Notes'
                  }
                  count={noteEntries.length + endorsementEntries.length}
                  open={notesOpen}
                  onToggle={() => setNotesOpen((o) => !o)}
                >
                  {noteEntries.length === 0 && endorsementEntries.length === 0 && (
                    <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#6c757d' }}>No notes yet</p>
                  )}
                  {[...noteEntries, ...endorsementEntries]
                    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                    .map((entry, i, arr) => {
                      const isOwnOfficeNote = entry.source === 'note' && entry.tag_id != null && tagInfo?.id != null && Number(entry.tag_id) === Number(tagInfo.id);
                      const canEditNote = isOwnOfficeNote || tagInfo?.id == null;
                      const isOwnEndorsement = entry.source === 'endorsement' && entry.tag_id != null && tagInfo?.id != null && Number(entry.tag_id) === Number(tagInfo.id);
                      const canEditEndorsement = isOwnEndorsement && tagInfo?.allowEndorse !== false;
                      const rendered = renderEntry(entry, i, i === arr.length - 1);
                      if (entry.source === 'note' && canEditNote && entry.noteId != null) {
                        return (
                          <div key={entry.id ?? `entry-${i}`} style={{ position: 'relative' }}>
                            {rendered}
                            <button
                              type="button"
                              onClick={() => startEditingNote(entry)}
                              aria-label="Edit note"
                              style={{
                                position: 'absolute',
                                top: 6,
                                right: 6,
                                padding: 4,
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#6c757d',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          </div>
                        );
                      }
                      if (canEditEndorsement) {
                        return (
                          <div key={entry.id ?? `entry-${i}`} style={{ position: 'relative' }}>
                            {rendered}
                            <button
                              type="button"
                              onClick={() => startEditingEndorsement(entry)}
                              aria-label="Edit remarks"
                              style={{
                                position: 'absolute',
                                top: 6,
                                right: 6,
                                padding: 4,
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#6c757d',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          </div>
                        );
                      }
                      return rendered;
                    })}
                </CollapsibleSection>

                <CollapsibleSection
                  title="Document History"
                  count={historyEntries.filter((e) => getActionText(e)).length}
                  open={historyOpen}
                  onToggle={() => setHistoryOpen((o) => !o)}
                >
                  {(() => {
                    const filtered = historyEntries.filter((e) => getActionText(e));
                    return filtered.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 13, color: '#6c757d' }}>No routing or history yet</p>
                    ) : (
                      [...filtered]
                        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                        .map((entry, i, arr) => renderEntry(entry, i, i === arr.length - 1))
                    );
                  })()}
                </CollapsibleSection>
              </>
            )}
          </div>
        </div>

        {/* Main Content - document area uses remaining space */}
        <div style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          padding: '12px 16px 12px 12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          overflow: 'visible',
        }}>
          {previewSrc && (
            <div
              style={{
                flex: 1,
                minHeight: 320,
                minWidth: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                marginBottom: 12,
                borderRadius: 8,
              }}
            >
              <iframe
                src={previewSrc}
                title="Document Viewer"
                style={{
                  flex: 1,
                  minHeight: 0,
                  width: '100%',
                  border: 'none',
                  borderRadius: 8,
                }}
              />
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', flexShrink: 0 }}>
            {documentToolbarActions.map((a) => (
              <ViewerToolbarButton key={a.key} icon={a.icon} onClick={a.onClick} disabled={!!a.disabled} title={a.title}>
                {a.label}
              </ViewerToolbarButton>
            ))}
            {canMarkArchive && (
              <div ref={archiveFabRef} style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch' }}>
                {archiveFabExpanded && (
                  <div
                    role="menu"
                    aria-label="Archive options"
                    style={{
                      position: 'absolute',
                      left: 0,
                      bottom: '100%',
                      marginBottom: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      minWidth: 260,
                      padding: 8,
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
                      zIndex: 20,
                    }}
                  >
                    {!hasFixedRouting && (
                      <ViewerToolbarButton
                        role="menuitem"
                        size="sm"
                        style={{ width: '100%', justifyContent: 'flex-start' }}
                        icon={(
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            <polyline points="9 22 9 12 15 12 15 22" />
                          </svg>
                        )}
                        onClick={() => {
                          setArchiveError(null);
                          setSelectedCabinetId('');
                          setSelectedDrawerId('');
                          setSelectedFolderId('');
                          setArchiveMode('local');
                          setHandoffOfficeId('');
                          setArchiveFabExpanded(false);
                          setShowArchiveModal(true);
                        }}
                      >
                        Archive (no fixed routing)
                      </ViewerToolbarButton>
                    )}
                    <ViewerToolbarButton
                      role="menuitem"
                      size="sm"
                      style={{ width: '100%', justifyContent: 'flex-start' }}
                      icon={(
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                      )}
                      onClick={() => {
                        setArchiveError(null);
                        setSelectedCabinetId('');
                        setSelectedDrawerId('');
                        setSelectedFolderId('');
                        setArchiveMode('local');
                        setHandoffOfficeId('');
                        setArchiveFabExpanded(false);
                        setShowArchiveModal(true);
                      }}
                    >
                      Archive in this office
                    </ViewerToolbarButton>
                    <ViewerToolbarButton
                      role="menuitem"
                      size="sm"
                      disabled={handoffOfficeOptions.length === 0}
                      title={handoffOfficeOptions.length === 0 ? 'No other offices to send to' : undefined}
                      style={{ width: '100%', justifyContent: 'flex-start' }}
                      icon={(
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M22 2L11 13" />
                          <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                        </svg>
                      )}
                      onClick={() => {
                        if (handoffOfficeOptions.length === 0) return;
                        setArchiveError(null);
                        setSelectedCabinetId('');
                        setSelectedDrawerId('');
                        setSelectedFolderId('');
                        setArchiveMode('handoff');
                        setHandoffOfficeId('');
                        setArchiveFabExpanded(false);
                        setShowArchiveModal(true);
                      }}
                    >
                      Send for archiving
                    </ViewerToolbarButton>
                  </div>
                )}
                <ViewerToolbarButton
                  aria-haspopup="menu"
                  aria-expanded={archiveFabExpanded}
                  icon={DOC_VIEWER_ICON_ARCHIVE}
                  trailing={<DOC_VIEWER_ICON_CHEVRON expanded={archiveFabExpanded} />}
                  onClick={() => setArchiveFabExpanded((x) => !x)}
                >
                  Archive
                </ViewerToolbarButton>
              </div>
            )}
          </div>
        </div>
      </div>

      {showDigitalOnlyNotice && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 4500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            boxSizing: 'border-box',
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowDigitalOnlyNotice(false);
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="digital-only-notice-title"
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
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #dee2e6' }}>
              <h4 id="digital-only-notice-title" style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#2a5196' }}>
                Digital document notice
              </h4>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowDigitalOnlyNotice(false)}
                style={{
                  padding: 0,
                  margin: 0,
                  width: 32,
                  height: 32,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
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
            <div style={{ padding: '20px', color: '#4b5563', fontSize: 14, lineHeight: 1.55 }}>
              The current document is <strong>digital only</strong>. The physical document will follow.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 20px', borderTop: '1px solid #dee2e6', background: '#fff' }}>
              <button
                type="button"
                onClick={() => setShowDigitalOnlyNotice(false)}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#fff',
                  background: '#2a5196',
                  border: '1px solid transparent',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showActionTakenForm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 4000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => !actionSubmitting && setShowActionTakenForm(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: '#374151' }}>Take Action</p>
            <p style={{ margin: '0 0 12px', fontSize: 14, color: '#6c757d' }}>Choose outcome and add remarks.</p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="radio" name="actionOutcome" checked={actionOutcome === 'Approved'} onChange={() => setActionOutcome('Approved')} />
                Approve
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="radio" name="actionOutcome" checked={actionOutcome === 'Rejected'} onChange={() => setActionOutcome('Rejected')} />
                Reject
              </label>
            </div>
            <textarea
              value={actionRemarks}
              onChange={(e) => setActionRemarks(e.target.value)}
              placeholder="Enter remarks…"
              rows={3}
              maxLength={5000}
              disabled={actionSubmitting}
              style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => !actionSubmitting && setShowActionTakenForm(false)}
                disabled={actionSubmitting}
                style={{
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#6c757d',
                  background: '#fff',
                  border: '1px solid #ced4da',
                  borderRadius: 6,
                  cursor: actionSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!actionRemarks.trim() || actionSubmitting) return;
                  setActionSubmitting(true);
                  try {
                    await onStatusChange(docId, actionOutcome, actionRemarks.trim());
                    setShowActionTakenForm(false);
                    setActionRemarks('');
                    setActionOutcome('Approved');
                  } finally {
                    setActionSubmitting(false);
                  }
                }}
                disabled={!actionRemarks.trim() || actionSubmitting}
                style={{
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  background: '#2a5196',
                  border: 'none',
                  borderRadius: 6,
                  cursor: !actionRemarks.trim() || actionSubmitting ? 'not-allowed' : 'pointer',
                  opacity: !actionRemarks.trim() || actionSubmitting ? 0.7 : 1,
                }}
              >
                {actionSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showArchiveModal && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 4000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            boxSizing: 'border-box',
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !archiveSubmitting) {
              setArchiveMode('local');
              setHandoffOfficeId('');
              setShowArchiveModal(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-modal-title"
            style={{
              background: '#fff',
              borderRadius: 6,
              boxShadow: '0 0.5rem 1rem rgba(0, 0, 0, 0.15)',
              width: '100%',
              maxWidth: 480,
              maxHeight: 'min(90vh, 100%)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid rgba(0,0,0,0.1)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
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
                id="archive-modal-title"
                className="modal-title"
                style={{ margin: 0, fontSize: 18, fontWeight: 600, color: COLORS.primary }}
              >
                Archive document
              </h4>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                disabled={archiveSubmitting}
                onClick={() => {
                  if (archiveSubmitting) return;
                  setArchiveMode('local');
                  setHandoffOfficeId('');
                  setShowArchiveModal(false);
                }}
                style={{
                  padding: 0,
                  margin: 0,
                  width: 32,
                  height: 32,
                  border: 'none',
                  background: 'transparent',
                  cursor: archiveSubmitting ? 'not-allowed' : 'pointer',
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

            <div className="modal-body" style={{ padding: '20px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
              <div className="btn-group" role="group" aria-label="Archive mode" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={archiveMode === 'local' ? 'btn btn-primary' : 'btn btn-outline-primary'}
                  disabled={archiveSubmitting}
                  onClick={() => {
                    setArchiveError(null);
                    setArchiveMode('local');
                    setArchiveModalFolderSearch('');
                  }}
                  style={{
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 4,
                    border: archiveMode === 'local' ? '1px solid transparent' : '1px solid #ced4da',
                    background: archiveMode === 'local' ? COLORS.primary : '#fff',
                    color: archiveMode === 'local' ? '#fff' : COLORS.primary,
                    cursor: archiveSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Archive in this office
                </button>
                <button
                  type="button"
                  className={archiveMode === 'handoff' ? 'btn btn-primary' : 'btn btn-outline-primary'}
                  disabled={archiveSubmitting || handoffOfficeOptions.length === 0}
                  onClick={() => {
                    setArchiveError(null);
                    setArchiveMode('handoff');
                    setArchiveModalFolderSearch('');
                    setSelectedDrawerId('');
                    setSelectedFolderId('');
                    setSelectedCabinetId('');
                  }}
                  style={{
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 4,
                    border: archiveMode === 'handoff' ? '1px solid transparent' : '1px solid #ced4da',
                    background: archiveMode === 'handoff' ? COLORS.primary : '#fff',
                    color: archiveMode === 'handoff' ? '#fff' : COLORS.primary,
                    cursor: archiveSubmitting || handoffOfficeOptions.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                  title={handoffOfficeOptions.length === 0 ? 'No other offices available' : undefined}
                >
                  Send for archiving
                </button>
              </div>
              {archiveMode === 'handoff' && (
                <p className="text-muted" style={{ margin: '0 0 16px', fontSize: 14, color: '#6c757d', lineHeight: 1.45 }}>
                  The document will go in transit like a release. Only the office you choose can complete archiving there.
                </p>
              )}
              {archiveError && (
                <div className="alert alert-danger" role="alert" style={{ margin: '0 0 12px', padding: '10px 12px', fontSize: 13, color: '#842029', background: '#f8d7da', border: '1px solid #f5c2c7', borderRadius: 4 }}>
                  {archiveError}
                </div>
              )}
              {archiveMode === 'handoff' ? (
                <>
                  <label htmlFor="archive-handoff-office" className="form-label" style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 8 }}>
                    Archiving office
                  </label>
                  <select
                    id="archive-handoff-office"
                    className="form-select form-control"
                    value={handoffOfficeId}
                    onChange={(e) => setHandoffOfficeId(e.target.value)}
                    disabled={archiveSubmitting}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 12px',
                      fontSize: 14,
                      border: '1px solid #ced4da',
                      borderRadius: 4,
                      marginBottom: 0,
                      background: '#fff',
                    }}
                  >
                    <option value="">— Select office —</option>
                    {handoffOfficeOptions.map((o) => (
                      <option key={o.id} value={String(o.id)}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : archiveStructureLoading ? (
                <p className="text-muted" style={{ margin: 0, fontSize: 14, color: '#6c757d' }}>Loading cabinets…</p>
              ) : (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label
                      htmlFor="archive-modal-folder-search"
                      className="form-label"
                      style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 8 }}
                    >
                      Search folder
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="archive-modal-folder-search"
                        type="search"
                        className="form-control"
                        value={archiveModalFolderSearch}
                        onChange={(e) => setArchiveModalFolderSearch(e.target.value)}
                        autoComplete="off"
                        disabled={archiveSubmitting}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '10px 12px',
                          fontSize: 14,
                          border: '1px solid #ced4da',
                          borderRadius: 4,
                          background: '#fff',
                          color: '#212529',
                        }}
                      />
                      {archiveModalFolderSearchMatches.length > 0 && (
                        <ul
                          role="listbox"
                          aria-label="Folder suggestions"
                          className="list-group"
                          style={{
                            listStyle: 'none',
                            margin: '4px 0 0',
                            padding: 0,
                            border: '1px solid #ced4da',
                            borderRadius: 4,
                            maxHeight: 220,
                            overflowY: 'auto',
                            background: '#fff',
                            boxShadow: '0 0.125rem 0.25rem rgba(0, 0, 0, 0.075)',
                            zIndex: 1,
                          }}
                        >
                          {archiveModalFolderSearchMatches.map((row, idx) => (
                            <li key={row.id} role="option" className="list-group-item" style={{ padding: 0, border: 'none', borderBottom: idx < archiveModalFolderSearchMatches.length - 1 ? '1px solid #dee2e6' : 'none' }}>
                              <button
                                type="button"
                                disabled={archiveSubmitting}
                                onClick={() => {
                                  if (archiveSubmitting) return;
                                  setSelectedCabinetId(String(row.cabinet.id));
                                  setSelectedDrawerId(String(row.drawer.id));
                                  setSelectedFolderId(String(row.folder.id));
                                  setArchiveModalFolderSearch('');
                                }}
                                className="list-group-item-action"
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '10px 12px',
                                  fontSize: 13,
                                  color: '#212529',
                                  border: 'none',
                                  background: '#fff',
                                  cursor: archiveSubmitting ? 'not-allowed' : 'pointer',
                                  fontFamily: 'inherit',
                                }}
                                onMouseEnter={(e) => {
                                  if (!archiveSubmitting) e.currentTarget.style.background = '#f8f9fa';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#fff';
                                }}
                              >
                                {row.pathLine}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                  <label htmlFor="archive-cabinet-select" className="form-label" style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 8 }}>
                    Cabinet
                  </label>
                  <select
                    id="archive-cabinet-select"
                    className="form-select form-control"
                    value={selectedCabinetId}
                    onChange={(e) => {
                      setSelectedCabinetId(e.target.value);
                      setSelectedDrawerId('');
                      setSelectedFolderId('');
                    }}
                    disabled={archiveSubmitting}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 12px',
                      fontSize: 14,
                      border: '1px solid #ced4da',
                      borderRadius: 4,
                      marginBottom: 16,
                      background: '#fff',
                    }}
                  >
                    <option value="">— Select cabinet —</option>
                    {archiveCabinets.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        C{c.code}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="archive-drawer-select" className="form-label" style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 8 }}>
                    Drawer
                  </label>
                  <select
                    id="archive-drawer-select"
                    className="form-select form-control"
                    value={selectedDrawerId}
                    onChange={(e) => {
                      setSelectedDrawerId(e.target.value);
                      setSelectedFolderId('');
                    }}
                    disabled={archiveSubmitting || !selectedCabinetId}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 12px',
                      fontSize: 14,
                      border: '1px solid #ced4da',
                      borderRadius: 4,
                      marginBottom: 16,
                      background: '#fff',
                    }}
                  >
                    <option value="">{selectedCabinetId ? '— Select drawer —' : '— Choose a cabinet first —'}</option>
                    {drawersInSelectedCabinet.map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        {drawerOptionLabel(d)}
                      </option>
                    ))}
                  </select>
                  {selectedDrawerId && (
                    <>
                      {needsArchiveFolder ? (
                        <>
                          <label htmlFor="archive-folder-select" className="form-label" style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#212529', marginBottom: 8 }}>
                            Folder
                          </label>
                          <select
                            id="archive-folder-select"
                            className="form-select form-control"
                            value={selectedFolderId}
                            onChange={(e) => setSelectedFolderId(e.target.value)}
                            disabled={archiveSubmitting}
                            style={{
                              width: '100%',
                              boxSizing: 'border-box',
                              padding: '10px 12px',
                              fontSize: 14,
                              border: '1px solid #ced4da',
                              borderRadius: 4,
                              marginBottom: 16,
                              background: '#fff',
                            }}
                          >
                            <option value="">— Select folder —</option>
                            {foldersInSelectedDrawer.map((f) => (
                              <option key={f.id} value={String(f.id)}>
                                {selectedArchiveCabinetEntity && selectedArchiveDrawer
                                  ? archiveFolderFullPath(selectedArchiveCabinetEntity, selectedArchiveDrawer, f)
                                  : folderOptionLabel(f)}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <p className="text-muted" style={{ margin: '0 0 16px', fontSize: 13, color: '#6c757d' }}>No folders in this drawer.</p>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            <div
              className="modal-footer"
              style={{
                display: 'flex',
                gap: 10,
                justifyContent: 'flex-end',
                alignItems: 'center',
                padding: '12px 20px',
                borderTop: '1px solid #dee2e6',
                flexShrink: 0,
                background: '#fff',
              }}
            >
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  if (archiveSubmitting) return;
                  setArchiveMode('local');
                  setHandoffOfficeId('');
                  setShowArchiveModal(false);
                }}
                disabled={archiveSubmitting}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#6c757d',
                  background: '#fff',
                  border: '1px solid #6c757d',
                  borderRadius: 4,
                  cursor: archiveSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  archiveSubmitting ||
                  (archiveMode === 'local' && localArchiveConfirmDisabled) ||
                  (archiveMode === 'handoff' && !handoffOfficeId)
                }
                onClick={async () => {
                  if (!docId) return;
                  if (archiveMode === 'local') {
                    if (!selectedDrawerId || localArchiveConfirmDisabled) return;
                    setArchiveSubmitting(true);
                    setArchiveError(null);
                    try {
                      const body = {
                        drawer_id: parseInt(selectedDrawerId, 10),
                        folder_id: parseInt(selectedFolderId, 10),
                      };
                      const data = await apiCall(API_ENDPOINTS.DOCUMENT_ARCHIVE(docId), {
                        method: 'POST',
                        body: JSON.stringify(body),
                      });
                      setShowArchiveModal(false);
                      setArchiveMode('local');
                      setHandoffOfficeId('');
                      if (data?.archive_reference) setArchivePlacementRef(data.archive_reference);
                      if (data?.drawer?.name) setArchivePlacementDrawerName(data.drawer.name);
                      if (data?.drawer?.cabinet_code != null) setArchivePlacementCabinetCode(data.drawer.cabinet_code);
                      if (data?.drawer?.drawer_code != null) setArchivePlacementDrawerCode(data.drawer.drawer_code);
                      const fn = data?.drawer?.folder_number;
                      setArchivePlacementFolderNumber(fn != null && fn !== '' ? Number(fn) : null);
                      const fName = data?.drawer?.folder_name;
                      setArchivePlacementFolderName(
                        fName != null && String(fName).trim() !== '' ? String(fName).trim() : null
                      );
                      onArchiveSuccess?.();
                    } catch (err) {
                      setArchiveError(err.message || 'Could not mark for archive');
                    } finally {
                      setArchiveSubmitting(false);
                    }
                    return;
                  }
                  if (!handoffOfficeId) return;
                  setArchiveSubmitting(true);
                  setArchiveError(null);
                  try {
                    await apiCall(API_ENDPOINTS.DOCUMENT_ARCHIVE_HANDOFF(docId), {
                      method: 'POST',
                      body: JSON.stringify({ to_tag_id: parseInt(handoffOfficeId, 10) }),
                    });
                    setShowArchiveModal(false);
                    setArchiveMode('local');
                    setHandoffOfficeId('');
                    onArchiveSuccess?.();
                  } catch (err) {
                    setArchiveError(err.message || 'Could not send for archiving');
                  } finally {
                    setArchiveSubmitting(false);
                  }
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#fff',
                  background:
                    archiveSubmitting ||
                    (archiveMode === 'local' && localArchiveConfirmDisabled) ||
                    (archiveMode === 'handoff' && !handoffOfficeId)
                      ? '#94a3b8'
                      : COLORS.primary,
                  border: '1px solid transparent',
                  borderRadius: 4,
                  cursor:
                    archiveSubmitting ||
                    (archiveMode === 'local' && localArchiveConfirmDisabled) ||
                    (archiveMode === 'handoff' && !handoffOfficeId)
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {archiveSubmitting
                  ? archiveMode === 'handoff'
                    ? 'Sending…'
                    : 'Archiving…'
                  : archiveMode === 'handoff'
                    ? 'Send for archiving'
                    : 'Confirm archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEndorseForm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 4000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => !endorsing && setShowEndorseForm(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: '#374151' }}>Endorse</p>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#6c757d' }}>Add remarks for this endorsement.</p>
            <textarea
              value={endorseRemarks}
              onChange={(e) => setEndorseRemarks(e.target.value)}
              placeholder="Enter remarks…"
              rows={3}
              maxLength={5000}
              disabled={endorsing}
              style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => !endorsing && setShowEndorseForm(false)}
                disabled={endorsing}
                style={{
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#6c757d',
                  background: '#fff',
                  border: '1px solid #ced4da',
                  borderRadius: 6,
                  cursor: endorsing ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleEndorse}
                disabled={!endorseRemarks?.trim() || endorsing}
                style={{
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  background: '#2a5196',
                  border: 'none',
                  borderRadius: 6,
                  cursor: !endorseRemarks?.trim() || endorsing ? 'not-allowed' : 'pointer',
                  opacity: !endorseRemarks?.trim() || endorsing ? 0.7 : 1,
                }}
              >
                {endorsing ? 'Endorsing…' : 'Endorse'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNoteForm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 4000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => !noteSubmitting && setShowNoteForm(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: '#374151' }}>Add Note</p>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#6c757d' }}>Add a note for this document.</p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Enter note…"
              rows={3}
              maxLength={5000}
              disabled={noteSubmitting}
              style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 10 }}
            />
            {noteError && <div style={{ fontSize: 13, color: '#dc3545', marginBottom: 10 }}>{noteError}</div>}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => !noteSubmitting && setShowNoteForm(false)}
                disabled={noteSubmitting}
                style={{
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#6c757d',
                  background: '#fff',
                  border: '1px solid #ced4da',
                  borderRadius: 6,
                  cursor: noteSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddNote}
                disabled={!noteText?.trim() || noteSubmitting}
                style={{
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  background: '#2a5196',
                  border: 'none',
                  borderRadius: 6,
                  cursor: !noteText?.trim() || noteSubmitting ? 'not-allowed' : 'pointer',
                  opacity: !noteText?.trim() || noteSubmitting ? 0.7 : 1,
                }}
              >
                {noteSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingNoteId != null && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 4000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => !noteUpdating && cancelEditingNote()}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              maxWidth: 420,
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: '#374151' }}>Edit Note</p>
            <textarea
              value={editNoteText}
              onChange={(e) => setEditNoteText(e.target.value)}
              placeholder="Note…"
              rows={4}
              maxLength={5000}
              disabled={noteUpdating}
              style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={cancelEditingNote}
                disabled={noteUpdating}
                style={{ padding: '10px 20px', fontSize: 14, fontWeight: 500, color: '#6c757d', background: '#fff', border: '1px solid #ced4da', borderRadius: 6, cursor: noteUpdating ? 'not-allowed' : 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleUpdateNote(editingNoteId)}
                disabled={!editNoteText?.trim() || noteUpdating}
                style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, color: '#fff', background: '#2a5196', border: 'none', borderRadius: 6, cursor: !editNoteText?.trim() || noteUpdating ? 'not-allowed' : 'pointer', opacity: !editNoteText?.trim() || noteUpdating ? 0.7 : 1 }}
              >
                {noteUpdating ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingEndorsementId != null && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 4000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => !endorsementUpdating && cancelEditingEndorsement()}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              maxWidth: 420,
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: '#374151' }}>Edit Endorse Remarks</p>
            <textarea
              value={editEndorsementRemarks}
              onChange={(e) => setEditEndorsementRemarks(e.target.value)}
              placeholder="Remarks…"
              rows={4}
              maxLength={5000}
              disabled={endorsementUpdating}
              style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={cancelEditingEndorsement}
                disabled={endorsementUpdating}
                style={{ padding: '10px 20px', fontSize: 14, fontWeight: 500, color: '#6c757d', background: '#fff', border: '1px solid #ced4da', borderRadius: 6, cursor: endorsementUpdating ? 'not-allowed' : 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleUpdateEndorsementRemarks(editingEndorsementId)}
                disabled={!editEndorsementRemarks?.trim() || endorsementUpdating}
                style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, color: '#fff', background: '#2a5196', border: 'none', borderRadius: 6, cursor: !editEndorsementRemarks?.trim() || endorsementUpdating ? 'not-allowed' : 'pointer', opacity: !editEndorsementRemarks?.trim() || endorsementUpdating ? 0.7 : 1 }}
              >
                {endorsementUpdating ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingStatusChangeId != null && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 4000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => !statusChangeUpdating && cancelEditingStatusChange()}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              maxWidth: 420,
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: '#374151' }}>Edit Status Remarks</p>
            <textarea
              value={editStatusChangeRemarks}
              onChange={(e) => setEditStatusChangeRemarks(e.target.value)}
              placeholder="Remarks…"
              rows={4}
              maxLength={5000}
              disabled={statusChangeUpdating}
              style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={cancelEditingStatusChange}
                disabled={statusChangeUpdating}
                style={{ padding: '10px 20px', fontSize: 14, fontWeight: 500, color: '#6c757d', background: '#fff', border: '1px solid #ced4da', borderRadius: 6, cursor: statusChangeUpdating ? 'not-allowed' : 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleUpdateStatusChangeRemarks(editingStatusChangeId)}
                disabled={statusChangeUpdating}
                style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, color: '#fff', background: '#2a5196', border: 'none', borderRadius: 6, cursor: statusChangeUpdating ? 'not-allowed' : 'pointer', opacity: statusChangeUpdating ? 0.7 : 1 }}
              >
                {statusChangeUpdating ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrintBarcode && hasTrackingCode && (
        <PrintBarcodeModal
          trackingCode={trackingCode}
          documentTitle={trackingCode}
          onClose={() => setShowPrintBarcode(false)}
          onPrint={() => setShowPrintBarcode(false)}
        />
      )}

      <style>{`
        .document-viewer-timeline-dot-current {
          animation: docViewerTimelinePulse 2s ease-in-out infinite;
        }
        @keyframes docViewerTimelinePulse {
          0%, 100% {
            box-shadow: 0 0 0 2px #e9ecef;
          }
          50% {
            box-shadow: 0 0 0 4px #2a5196, 0 0 12px rgba(42,81,150,0.35);
          }
        }
        .document-viewer-route-pulse-blue {
          animation: docViewerRoutePulseBlue 2s ease-in-out infinite;
        }
        .document-viewer-route-pulse-yellow {
          animation: docViewerRoutePulseYellow 2s ease-in-out infinite;
        }
        @keyframes docViewerRoutePulseBlue {
          0%, 100% {
            box-shadow: 0 0 0 1px #dee2e6;
          }
          50% {
            box-shadow: 0 0 0 4px #2a5196, 0 0 12px rgba(42,81,150,0.35);
          }
        }
        @keyframes docViewerRoutePulseYellow {
          0%, 100% {
            box-shadow: 0 0 0 1px #dee2e6;
          }
          50% {
            box-shadow: 0 0 0 4px #f59e0b, 0 0 12px rgba(245,158,11,0.4);
          }
        }
      `}</style>
    </div>
  );
}

export default DocumentViewerModal; 