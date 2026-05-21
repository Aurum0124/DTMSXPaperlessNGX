import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { apiCall } from '../../services/api.js';
import { API_ENDPOINTS } from '../../constants/index.js';
import ConfirmationModal from './ConfirmationModal.jsx';
import TrackingCodeInput from '../TrackingCodeInput.jsx';
import { getCopyStateFieldIdAsync } from '../../services/customFields.js';

const MAX_RECENT_RELEASES = 5;

function recentReleasesStorageKey(tagId) {
  return `dts_recent_releases_${tagId}`;
}

function RevertReleaseIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}

/**
 * ReleaseModal Component
 *
 * Opened when user clicks Release. Prompts to scan document barcode.
 * If fixed routing is enabled for the office, shows option to select how many
 * offices and which offices the document must go through.
 */
function ReleaseModal({ open, tagInfo, allTags = [], files = [], onClose, onSuccess }) {
  const [scanInput, setScanInput] = useState('');
  const [status, setStatus] = useState('idle'); // idle | searching | routing | releasing | success | error
  const [message, setMessage] = useState('');
  const [step, setStep] = useState(1); // 1: scan, 2: route (if fixed routing), 3: releasing
  const [foundDoc, setFoundDoc] = useState(null);
  const [foundCode, setFoundCode] = useState('');
  const [routeCount, setRouteCount] = useState(1);
  const [routeCountInput, setRouteCountInput] = useState('1');
  const [routeOffices, setRouteOffices] = useState([null]);
  const [routeCanTakeAction, setRouteCanTakeAction] = useState(new Set([0]));
  const [routeNeedEndorsement, setRouteNeedEndorsement] = useState(new Set());
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedDigitalOfficeId, setSelectedDigitalOfficeId] = useState('');
  const [digitalPolicy, setDigitalPolicy] = useState('digital_first'); // digital_first | digital_only
  const [digitalArchiveCabinets, setDigitalArchiveCabinets] = useState([]);
  const [digitalArchiveLoading, setDigitalArchiveLoading] = useState(false);
  const [selectedDigitalCabinetId, setSelectedDigitalCabinetId] = useState('');
  const [selectedDigitalDrawerId, setSelectedDigitalDrawerId] = useState('');
  const [selectedDigitalFolderId, setSelectedDigitalFolderId] = useState('');
  const [removeCanTakeActionConfirm, setRemoveCanTakeActionConfirm] = useState(null); // { idx } when showing
  const [releaseMode, setReleaseMode] = useState('release'); // release | digital_release | digital_release_routed
  const [recentReleases, setRecentReleases] = useState([]);
  const [revertConfirm, setRevertConfirm] = useState(null); // { documentId, trackingCode, title }
  const [pendingDigitalRouteConfirm, setPendingDigitalRouteConfirm] = useState(null); // { doc, code, remainingRoute }
  const [detectedDigitalFixedRoute, setDetectedDigitalFixedRoute] = useState(null); // number[] | null
  const [foundDocumentIsDigitalOnly, setFoundDocumentIsDigitalOnly] = useState(false);
  const [revertingId, setRevertingId] = useState(null);
  const inputRef = useRef(null);
  const revertInFlightRef = useRef(false);
  const copyStateFieldIdRef = useRef(null);

  const fixedRoutingEnabled = !!tagInfo?.fixedRoutingEnabled;
  const otherTags = (allTags?.results ?? allTags ?? []).filter(
    (t) => t && (t.id ?? t.pk) !== tagInfo?.id
  );

  const persistRecentReleases = useCallback(
    (list) => {
      const tid = tagInfo?.id;
      if (tid == null) return;
      try {
        sessionStorage.setItem(recentReleasesStorageKey(tid), JSON.stringify(list));
      } catch {
        /* ignore quota / private mode */
      }
    },
    [tagInfo?.id]
  );

  const pushRecentRelease = useCallback(
    (doc, trackingCode) => {
      if (!doc?.id || !trackingCode || tagInfo?.id == null) return;
      const entry = {
        documentId: doc.id,
        trackingCode,
        title: doc.title || doc.filename || `Document ${doc.id}`,
        releasedAt: Date.now(),
      };
      setRecentReleases((prev) => {
        const next = [entry, ...prev.filter((x) => x.documentId !== doc.id)].slice(0, MAX_RECENT_RELEASES);
        persistRecentReleases(next);
        return next;
      });
    },
    [tagInfo?.id, persistRecentReleases]
  );

  useEffect(() => {
    if (open && tagInfo?.id != null) {
      try {
        const raw = sessionStorage.getItem(recentReleasesStorageKey(tagInfo.id));
        if (raw) {
          const parsed = JSON.parse(raw);
          setRecentReleases(Array.isArray(parsed) ? parsed : []);
        } else {
          setRecentReleases([]);
        }
      } catch {
        setRecentReleases([]);
      }
    }
  }, [open, tagInfo?.id]);

  useEffect(() => {
    if (open) {
      setScanInput('');
      setStatus('idle');
      setMessage('');
      setStep(1);
      setFoundDoc(null);
      setFoundCode('');
      setRouteCount(1);
      setRouteCountInput('1');
      setRouteOffices([null]);
      setRouteCanTakeAction(new Set([0]));
      setRouteNeedEndorsement(new Set());
      setSelectedTemplateId('');
      setSelectedDigitalOfficeId('');
      setDigitalPolicy('digital_first');
      setDigitalArchiveCabinets([]);
      setDigitalArchiveLoading(false);
      setSelectedDigitalCabinetId('');
      setSelectedDigitalDrawerId('');
      setSelectedDigitalFolderId('');
      setRemoveCanTakeActionConfirm(null);
      setReleaseMode('release');
      setRevertConfirm(null);
      setPendingDigitalRouteConfirm(null);
      setDetectedDigitalFixedRoute(null);
      setFoundDocumentIsDigitalOnly(false);
      if (fixedRoutingEnabled) {
        setTemplatesLoading(true);
        apiCall('/api/route-templates')
          .then((data) => setTemplates(data?.templates ?? []))
          .catch(() => setTemplates([]))
          .finally(() => setTemplatesLoading(false));
      } else {
        setTemplates([]);
        setTemplatesLoading(false);
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, fixedRoutingEnabled]);

  useEffect(() => {
    if ((releaseMode !== 'digital_release' && releaseMode !== 'digital_release_routed') || digitalPolicy !== 'digital_only') {
      setDigitalArchiveCabinets([]);
      setSelectedDigitalCabinetId('');
      setSelectedDigitalDrawerId('');
      setSelectedDigitalFolderId('');
      return;
    }
    let cancelled = false;
    const loadCabinets = async () => {
      setDigitalArchiveLoading(true);
      try {
        const data = await apiCall('/api/archive-cabinets');
        if (cancelled) return;
        const cabinets = Array.isArray(data?.cabinets) ? data.cabinets : [];
        setDigitalArchiveCabinets(cabinets);
      } catch {
        if (!cancelled) setDigitalArchiveCabinets([]);
      } finally {
        if (!cancelled) setDigitalArchiveLoading(false);
      }
    };
    loadCabinets();
    return () => {
      cancelled = true;
    };
  }, [releaseMode, digitalPolicy]);

  const selectedDigitalCabinetEntity = useMemo(() => {
    if (!selectedDigitalCabinetId) return null;
    return digitalArchiveCabinets.find((x) => String(x.id) === String(selectedDigitalCabinetId)) ?? null;
  }, [digitalArchiveCabinets, selectedDigitalCabinetId]);

  const digitalDrawersInCabinet = useMemo(() => {
    return Array.isArray(selectedDigitalCabinetEntity?.drawers) ? selectedDigitalCabinetEntity.drawers : [];
  }, [selectedDigitalCabinetEntity]);

  const selectedDigitalDrawerEntity = useMemo(() => {
    if (!selectedDigitalDrawerId) return null;
    return digitalDrawersInCabinet.find((d) => String(d.id) === String(selectedDigitalDrawerId)) ?? null;
  }, [digitalDrawersInCabinet, selectedDigitalDrawerId]);

  const digitalFoldersInDrawer = useMemo(() => {
    const raw = selectedDigitalDrawerEntity?.folders;
    if (!Array.isArray(raw)) return [];
    return [...raw].sort((a, b) => Number(a.folder_number) - Number(b.folder_number));
  }, [selectedDigitalDrawerEntity]);

  const applyRouteCount = (num) => {
    const n = Math.max(1, Math.min(10, num));
    setRouteCount(n);
    setRouteCountInput(String(n));
    setRouteOffices((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push(null);
      return next;
    });
      setRouteCanTakeAction(new Set(n > 0 ? [n - 1] : []));
    setRouteNeedEndorsement(new Set());
  };

  const handleRouteCountChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2) || '';
    setSelectedTemplateId('');
    setRouteCountInput(raw);
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
      applyRouteCount(parsed);
    }
  };

  const handleRouteCountBlur = () => {
    const parsed = parseInt(routeCountInput, 10);
    const num = routeCountInput === '' || isNaN(parsed) || parsed < 1 ? 1 : Math.min(10, parsed);
    applyRouteCount(num);
  };

  const handleRouteOfficeChange = (idx, tagId) => {
    setSelectedTemplateId('');
    setRouteOffices((prev) => {
      const next = [...prev];
      next[idx] = tagId ? parseInt(tagId, 10) : null;
      return next;
    });
  };

  const handleTemplateSelect = (e) => {
    const id = e.target.value;
    setSelectedTemplateId(id);
    if (id) {
      const t = templates.find((x) => String(x.id) === id);
      if (t && Array.isArray(t.route_sequence) && t.route_sequence.length > 0) {
        const seq = t.route_sequence.map((tid) => parseInt(tid, 10));
        setRouteCount(seq.length);
        setRouteCountInput(String(seq.length));
        setRouteOffices(seq);
        const canTake = (t.route_can_take_action ?? []).map((x) => parseInt(x, 10));
        const canTakeSet = new Set();
        seq.forEach((tid, i) => {
          if (canTake.length > 0 ? canTake.includes(tid) : i === seq.length - 1) canTakeSet.add(i);
        });
        setRouteCanTakeAction(canTakeSet);
        const needEndorsement = (t.route_need_endorsement ?? []).map((x) => parseInt(x, 10));
        const needEndorsementSet = new Set();
        seq.forEach((tid, i) => {
          if (needEndorsement.includes(tid)) needEndorsementSet.add(i);
        });
        setRouteNeedEndorsement(needEndorsementSet);
      }
    } else {
      setRouteCount(1);
      setRouteCountInput('1');
      setRouteOffices([null]);
      setRouteCanTakeAction(new Set([0]));
      setRouteNeedEndorsement(new Set());
    }
  };

  const handleScanSubmit = async (e) => {
    e?.preventDefault();
    const code = scanInput.trim();
    if (!code || !tagInfo?.id) return;

    setStatus('searching');
    setMessage('');

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

      const copyStateFieldId = copyStateFieldIdRef.current ?? (await getCopyStateFieldIdAsync().catch(() => null));
      if (copyStateFieldIdRef.current == null) copyStateFieldIdRef.current = copyStateFieldId;
      let isDigitalOnly = false;
      if (copyStateFieldId != null) {
        const copyStateField = (doc.custom_fields ?? []).find((f) => Number(f.field ?? f) === Number(copyStateFieldId));
        const copyState = String(copyStateField?.value ?? '').toLowerCase();
        isDigitalOnly = copyState.includes('digital only');
      }
      setFoundDocumentIsDigitalOnly(isDigitalOnly);
      if (copyStateFieldId != null && releaseMode === 'release') {
        const copyStateField = (doc.custom_fields ?? []).find((f) => Number(f.field ?? f) === Number(copyStateFieldId));
        const copyState = String(copyStateField?.value ?? '').toLowerCase();
        if (copyState.includes('digital only')) {
          setStatus('error');
          setMessage('This document is digital only and cannot be released normally.');
          return;
        }
        if (copyState.includes('digital') && copyState.includes('pending')) {
          setStatus('error');
          setMessage('Please wait for the physical document before releasing this document.');
          return;
        }
      }

      const rawTags = doc.tags ?? [];
      const docTagIds = rawTags.map((t) => (typeof t === 'object' && t != null ? Number(t.id ?? t.pk ?? t) : Number(t))).filter((n) => !Number.isNaN(n));
      const currentTagId = Number(tagInfo.id);
      if (!docTagIds.includes(currentTagId)) {
        setStatus('error');
        setMessage(`Document is not in ${tagInfo.name}. It may have been moved or received elsewhere.`);
        return;
      }

      setFoundDoc(doc);
      setFoundCode(code);
      setStatus('idle');
      if ((releaseMode === 'digital_release' || releaseMode === 'digital_release_routed') && isDigitalOnly) {
        setDigitalPolicy('digital_only');
      }

      // If document has an existing fixed route (from previous release), preserve the remaining offices
      let remainingRoute = null;
      let currentRoutedTransferType = null;
      try {
        const transfersData = await apiCall(`/api/transfers?document_id=${doc.id}`);
        const transfers = transfersData?.transfers ?? [];
        const releases = transfers.filter(
          (t) => t?.type === 'release' || t?.type === 'digital_release' || t?.type === 'archive_release'
        );
        // Use the latest routed release where the current office is the expected next receiver.
        const candidate = [...releases]
          .reverse()
          .find((t) => Array.isArray(t?.route_sequence) && t.route_sequence.length > 0 && Number(t.route_sequence[0]) === Number(tagInfo.id));
        if (candidate && Array.isArray(candidate.route_sequence)) {
          remainingRoute = candidate.route_sequence.slice(1);
          currentRoutedTransferType = String(candidate.type || '');
        }
      } catch {
        /* ignore */
      }

      if (
        (releaseMode === 'digital_release' || releaseMode === 'digital_release_routed') &&
        currentRoutedTransferType === 'release' &&
        remainingRoute &&
        remainingRoute.length > 0
      ) {
        setStatus('error');
        setMessage('This document has a physical fixed route and cannot be digitally released.');
        setDetectedDigitalFixedRoute(null);
        return;
      }

      if (releaseMode === 'digital_release' && remainingRoute && remainingRoute.length > 0) {
        setDetectedDigitalFixedRoute(remainingRoute);
        setPendingDigitalRouteConfirm({ doc, code, remainingRoute });
        return;
      }
      if (releaseMode === 'digital_release') {
        setDetectedDigitalFixedRoute(null);
      }
      if (releaseMode === 'digital_release') {
        const alreadyConfirmedDoc = foundDoc && Number(foundDoc.id) === Number(doc.id) && foundCode === code;
        if (!alreadyConfirmedDoc) {
          setMessage('Document found. Configure digital release options, then click Send digital release.');
          return;
        }
      }
      if (releaseMode === 'digital_release_routed') {
        const alreadyConfirmedDoc = foundDoc && Number(foundDoc.id) === Number(doc.id) && foundCode === code;
        if (!alreadyConfirmedDoc) {
          setMessage('Document found. Configure digital routed options, then continue.');
          return;
        }
      }
      if ((releaseMode === 'release' || releaseMode === 'digital_release_routed') && remainingRoute && remainingRoute.length > 0) {
        const transferType = releaseMode === 'digital_release_routed' ? 'digital_release' : 'release';
        const nextRouteOffice = remainingRoute.length > 0 ? Number(remainingRoute[0]) : null;
        await doRelease(
          doc,
          code,
          remainingRoute,
          null,
          null,
          transferType,
          transferType === 'digital_release' ? nextRouteOffice : null,
        );
      } else if ((releaseMode === 'release' || releaseMode === 'digital_release_routed') && fixedRoutingEnabled) {
        setStep(2);
      } else {
        const digitalTarget = releaseMode === 'digital_release' ? parseInt(selectedDigitalOfficeId, 10) : null;
        if (releaseMode === 'digital_release' && !digitalTarget && !remainingRoute?.length) {
          setStatus('error');
          setMessage('Select the destination office for digital release.');
          return;
        }
        if ((releaseMode === 'digital_release' || releaseMode === 'digital_release_routed') && digitalPolicy === 'digital_only' && !foundDocumentIsDigitalOnly) {
          if (!selectedDigitalCabinetId) {
            setStatus('error');
            setMessage('Select an archive cabinet for your office before sending digital-only.');
            return;
          }
          if (!selectedDigitalDrawerId) {
            setStatus('error');
            setMessage('Select an archive drawer for your office before sending digital-only.');
            return;
          }
          if (!selectedDigitalFolderId) {
            setStatus('error');
            setMessage('Select an archive folder for your office before sending digital-only.');
            return;
          }
        }
        await doRelease(doc, code, null, null, null, releaseMode, digitalTarget);
      }
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Failed to find document. Please try again.');
    }
  };

  const doRelease = async (
    doc,
    code,
    routeSequence,
    routeCanTakeActionIds = null,
    routeNeedEndorsementIds = null,
    transferType = releaseMode,
    digitalTargetOfficeId = null,
    selectedDigitalPolicy = digitalPolicy,
  ) => {
    if (!doc || !code || !tagInfo?.id) return;

    setStatus('releasing');
    setMessage('');

    try {
      const body = {
        document_id: doc.id,
        tracking_code: code,
        from_tag_id: tagInfo.id,
        to_tag_id: transferType === 'digital_release' ? digitalTargetOfficeId : null,
        type: transferType,
      };
      if (transferType === 'digital_release') {
        body.digital_mode = selectedDigitalPolicy;
        if (selectedDigitalPolicy === 'digital_only') {
          body.cabinet_id = selectedDigitalCabinetId ? parseInt(selectedDigitalCabinetId, 10) : null;
          body.drawer_id = selectedDigitalDrawerId ? parseInt(selectedDigitalDrawerId, 10) : null;
          if (selectedDigitalFolderId) body.folder_id = parseInt(selectedDigitalFolderId, 10);
        }
      }
      if (routeSequence && routeSequence.length > 0) {
        body.route_sequence = routeSequence;
        if (routeCanTakeActionIds && routeCanTakeActionIds.length > 0) {
          body.route_can_take_action = routeCanTakeActionIds;
        }
        if (routeNeedEndorsementIds && routeNeedEndorsementIds.length > 0) {
          body.route_need_endorsement = routeNeedEndorsementIds;
        }
      }

      // Create transfer record first; only clear tags after success so we don't leave
      // the document untagged if validation fails (e.g. endorsement required)
      await apiCall('/api/transfers', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      // Physical release clears office tags (in transit). Digital release tags the destination
      // on the server in the same PATCH as copy state — do not PATCH tags here or we can wipe them.
      if (transferType === 'release') {
        await apiCall(API_ENDPOINTS.DOCUMENT_DETAIL(doc.id), {
          method: 'PATCH',
          body: JSON.stringify({ tags: [] }),
        });
      }

      setStatus('success');
      setMessage(
        transferType === 'digital_release'
          ? (routeSequence?.length
            ? `Digital release sent for ${code}. ${selectedDigitalPolicy === 'digital_only' ? 'Digital-only mode enabled.' : 'Physical copy follows the route.'} (${routeSequence.length} office(s)).`
            : `Digital release sent for ${code}. ${selectedDigitalPolicy === 'digital_only' ? 'This is marked as digital-only.' : 'Physical copy is expected to follow.'}`)
          : (routeSequence?.length
            ? `Document ${code} released. It must go through ${routeSequence.length} office(s) in order.`
            : `Document ${code} released. It can be received when scanned at the destination department.`)
      );
      pushRecentRelease(doc, code);
      setScanInput('');
      setFoundDoc(null);
      setFoundCode('');
      setStep(1);

      if (onSuccess) onSuccess();
      setTimeout(() => {
        setStatus('idle');
        setMessage('');
      }, 1500);
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Failed to release document. Please try again.');
    }
  };

  const handleRouteConfirm = () => {
    const sequence = routeOffices
      .slice(0, routeCount)
      .map((id) => (id != null ? id : null))
      .filter((id) => id != null);
    if (fixedRoutingEnabled && sequence.length === 0) {
      setMessage('Please select at least one office for the route.');
      return;
    }
    const canTakeAction = sequence.length > 0
      ? sequence.filter((_, i) => routeCanTakeAction.has(i)).map((id) => id)
      : null;
    const needEndorsement = sequence.length > 0
      ? sequence.filter((_, i) => routeNeedEndorsement.has(i)).map((id) => id)
      : null;
    const transferType = releaseMode === 'digital_release_routed' ? 'digital_release' : releaseMode;
    if (transferType === 'digital_release' && digitalPolicy === 'digital_only' && !foundDocumentIsDigitalOnly) {
      if (!selectedDigitalCabinetId) {
        setMessage('Select an archive cabinet for your office before sending digital-only.');
        return;
      }
      if (!selectedDigitalDrawerId) {
        setMessage('Select an archive drawer for your office before sending digital-only.');
        return;
      }
      if (!selectedDigitalFolderId) {
        setMessage('Select an archive folder for your office before sending digital-only.');
        return;
      }
    }
    const firstRouteOffice = sequence.length > 0 ? sequence[0] : null;
    doRelease(
      foundDoc,
      foundCode,
      sequence.length > 0 ? sequence : null,
      canTakeAction,
      needEndorsement,
      transferType,
      transferType === 'digital_release' ? firstRouteOffice : null,
      transferType === 'digital_release' ? digitalPolicy : 'digital_first',
    );
  };

  const handleBack = () => {
    setStep(1);
    setFoundDoc(null);
    setFoundCode('');
    setStatus('idle');
    setMessage('');
  };

  const performRevertRelease = async () => {
    const target = revertConfirm;
    if (!target?.documentId || revertInFlightRef.current) return;
    revertInFlightRef.current = true;
    setRevertingId(target.documentId);
    setRevertConfirm(null);
    try {
      await apiCall(API_ENDPOINTS.TRANSFERS_REVERT_RELEASE, {
        method: 'POST',
        body: JSON.stringify({ document_id: target.documentId }),
      });
      setRecentReleases((prev) => {
        const next = prev.filter((x) => x.documentId !== target.documentId);
        persistRecentReleases(next);
        return next;
      });
      setStatus('idle');
      setMessage(`Release undone for ${target.trackingCode}. The document is back at your office.`);
      onSuccess?.();
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Could not undo release.');
    } finally {
      revertInFlightRef.current = false;
      setRevertingId(null);
    }
  };

  if (!open) return null;

  const primary = '#2a5196';
  const muted = '#6c757d';
  const borderInput = '#ced4da';
  const hasScannedDoc = Boolean(foundDoc && foundCode === scanInput.trim());
  const showDigitalModeOptions =
    (releaseMode === 'digital_release' || releaseMode === 'digital_release_routed') &&
    hasScannedDoc &&
    (releaseMode !== 'digital_release' || !detectedDigitalFixedRoute?.length) &&
    !foundDocumentIsDigitalOnly;

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
        aria-labelledby="release-modal-title"
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
            id="release-modal-title"
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 500,
              color: primary,
              lineHeight: 1.2,
            }}
          >
            Release Document
          </h2>
          <button
            type="button"
            onClick={step === 2 ? handleBack : onClose}
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
            aria-label={step === 2 ? 'Back' : 'Close'}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '20px 20px 0', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
        {step === 1 && recentReleases.length > 0 && (
          <div
            style={{
              marginBottom: 16,
              padding: '12px 14px',
              background: '#f8f9fa',
              border: `1px solid ${borderInput}`,
              borderRadius: 4,
            }}
          >
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#495057', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Recently released
            </p>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: muted, lineHeight: 1.45 }}>
              Undo only works if the document is still in transit (no office has received it yet). Fixed-route releases are safe to revert the same way.
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentReleases.map((r, i) => (
                <li
                  key={`${r.documentId}-${r.releasedAt}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    background: '#fff',
                    borderRadius: 4,
                    border: `1px solid ${borderInput}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.title}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{r.trackingCode}</div>
                  </div>
                  <button
                    type="button"
                    title="Undo release"
                    aria-label={`Undo release for ${r.trackingCode}`}
                    disabled={revertingId != null || status === 'searching' || status === 'releasing'}
                    onClick={() => setRevertConfirm({ documentId: r.documentId, trackingCode: r.trackingCode, title: r.title })}
                    style={{
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 40,
                      height: 40,
                      padding: 0,
                      border: `1px solid ${borderInput}`,
                      borderRadius: 4,
                      background: '#fff',
                      color: '#475569',
                      cursor: revertingId != null || status === 'searching' || status === 'releasing' ? 'not-allowed' : 'pointer',
                      opacity: revertingId != null || status === 'searching' || status === 'releasing' ? 0.5 : 1,
                    }}
                  >
                    {revertingId === r.documentId ? (
                      <span style={{ width: 16, height: 16, border: '2px solid #ced4da', borderTopColor: primary, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    ) : (
                      <RevertReleaseIcon />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 1 && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setReleaseMode('digital_release')}
                  style={{
                    padding: '7px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 4,
                    border: releaseMode === 'digital_release' ? '1px solid transparent' : `1px solid ${borderInput}`,
                    background: releaseMode === 'digital_release' ? primary : '#fff',
                    color: releaseMode === 'digital_release' ? '#fff' : '#374151',
                    cursor: 'pointer',
                  }}
                >
                  Digital release
                </button>
                {fixedRoutingEnabled && (
                  <button
                    type="button"
                    onClick={() => setReleaseMode('digital_release_routed')}
                    style={{
                      padding: '7px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: releaseMode === 'digital_release_routed' ? '1px solid transparent' : `1px solid ${borderInput}`,
                      background: releaseMode === 'digital_release_routed' ? primary : '#fff',
                      color: releaseMode === 'digital_release_routed' ? '#fff' : '#374151',
                      cursor: 'pointer',
                    }}
                  >
                    Digital routed
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setReleaseMode('release')}
                  style={{
                    padding: '7px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 4,
                    border: releaseMode === 'release' ? '1px solid transparent' : `1px solid ${borderInput}`,
                    background: releaseMode === 'release' ? primary : '#fff',
                    color: releaseMode === 'release' ? '#fff' : '#374151',
                    cursor: 'pointer',
                  }}
                >
                  Standard release
                </button>
              </div>
            </div>
            <p style={{ color: muted, fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
              Scan the document barcode. The document will be released from
              <strong style={{ display: 'block', marginTop: 6, color: primary }}>
                {tagInfo?.name || 'your department'}.
              </strong>
              {releaseMode === 'digital_release' && (
                <span style={{ display: 'block', marginTop: 8 }}>
                  Digital release sends directly to one office now and does not go through release/receive transit.
                </span>
              )}
              {releaseMode === 'digital_release_routed' && (
                <span style={{ display: 'block', marginTop: 8 }}>
                  Digital routed uses your fixed route to forward digitally in sequence (physical copy still follows separately).
                </span>
              )}
              {showDigitalModeOptions && (
                <span style={{ display: 'block', marginTop: 8 }}>
                  Choose whether this release is digital-only or digital-first with physical follow-up.
                </span>
              )}
              {fixedRoutingEnabled && releaseMode !== 'digital_release' && (
                <span style={{ display: 'block', marginTop: 8 }}>
                  You will then select the fixed route (offices in order).
                </span>
              )}
            </p>

            <form id="release-scan-form" onSubmit={handleScanSubmit}>
              {showDigitalModeOptions && (
                <div style={{ marginBottom: 12 }}>
                  <label htmlFor="release-digital-policy" style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#212529' }}>
                    Digital mode
                  </label>
                  <select
                    id="release-digital-policy"
                    value={digitalPolicy}
                    onChange={(e) => setDigitalPolicy(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: 14,
                      border: `1px solid ${borderInput}`,
                      borderRadius: 4,
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="digital_first">Digital first (physical follows)</option>
                    <option value="digital_only">Digital only</option>
                  </select>
                </div>
              )}
              {releaseMode === 'digital_release' && foundDoc && foundCode === scanInput.trim() && !detectedDigitalFixedRoute?.length && (
                <div style={{ marginBottom: 12 }}>
                  <label htmlFor="release-digital-office" style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#212529' }}>
                    Send digital release to
                  </label>
                  <select
                    id="release-digital-office"
                    value={selectedDigitalOfficeId}
                    onChange={(e) => setSelectedDigitalOfficeId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: 14,
                      border: `1px solid ${borderInput}`,
                      borderRadius: 4,
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="">-- Select office --</option>
                    {otherTags.map((t) => {
                      const tid = t.id ?? t.pk;
                      return (
                        <option key={tid} value={tid}>
                          {t.name ?? `Office ${tid}`}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
              {(releaseMode === 'digital_release' || releaseMode === 'digital_release_routed') && hasScannedDoc && digitalPolicy === 'digital_only' && !foundDocumentIsDigitalOnly && (releaseMode !== 'digital_release' || !detectedDigitalFixedRoute?.length) && (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label htmlFor="release-digital-cabinet" style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#212529' }}>
                      Archive cabinet (your office)
                    </label>
                    <select
                      id="release-digital-cabinet"
                      value={selectedDigitalCabinetId}
                      onChange={(e) => {
                        setSelectedDigitalCabinetId(e.target.value);
                        setSelectedDigitalDrawerId('');
                        setSelectedDigitalFolderId('');
                      }}
                      disabled={digitalArchiveLoading}
                      style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: `1px solid ${borderInput}`, borderRadius: 4, boxSizing: 'border-box' }}
                    >
                      <option value="">{digitalArchiveLoading ? '-- Loading cabinets --' : '-- Select cabinet --'}</option>
                      {digitalArchiveCabinets.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          C{c.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label htmlFor="release-digital-drawer" style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#212529' }}>
                      Archive drawer (your office)
                    </label>
                    <select
                      id="release-digital-drawer"
                      value={selectedDigitalDrawerId}
                      onChange={(e) => {
                        setSelectedDigitalDrawerId(e.target.value);
                        setSelectedDigitalFolderId('');
                      }}
                      disabled={!selectedDigitalCabinetId}
                      style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: `1px solid ${borderInput}`, borderRadius: 4, boxSizing: 'border-box' }}
                    >
                      <option value="">{selectedDigitalCabinetId ? '-- Select drawer --' : '-- Choose cabinet first --'}</option>
                      {digitalDrawersInCabinet.map((d) => (
                        <option key={d.id} value={String(d.id)}>
                          D{d.drawer_code} - {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedDigitalDrawerId && digitalFoldersInDrawer.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <label htmlFor="release-digital-folder" style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#212529' }}>
                        Archive folder
                      </label>
                      <select
                        id="release-digital-folder"
                        value={selectedDigitalFolderId}
                        onChange={(e) => setSelectedDigitalFolderId(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: `1px solid ${borderInput}`, borderRadius: 4, boxSizing: 'border-box' }}
                      >
                        <option value="">-- Select folder --</option>
                        {digitalFoldersInDrawer.map((f) => (
                          <option key={f.id} value={String(f.id)}>
                            F{f.folder_number}{f.name ? ` - ${f.name}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
              <div style={{ marginBottom: 16 }}>
                <TrackingCodeInput
                  inputRef={inputRef}
                  value={scanInput}
                  onChange={(v) => {
                    setScanInput(v);
                    const next = String(v ?? '').trim();
                    if (foundCode && next !== foundCode) {
                      setFoundDoc(null);
                      setFoundCode('');
                      setDetectedDigitalFixedRoute(null);
                      setFoundDocumentIsDigitalOnly(false);
                    }
                  }}
                  trackingCodes={files.map((f) => f.trackingCode).filter(Boolean)}
                  showSuggestions={false}
                  inputProps={{
                    placeholder: 'Scan or type tracking code...',
                    disabled: status === 'searching',
                  }}
                />
              </div>
            </form>
          </>
        )}

        {step === 2 && fixedRoutingEnabled && (
          <>
            <p style={{ color: muted, fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
              Document <strong style={{ color: '#212529' }}>{foundCode}</strong> found. Use a template or select offices (in order).
            </p>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="release-template-select" style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#212529' }}>
                Use template
              </label>
              <select
                id="release-template-select"
                value={selectedTemplateId}
                onChange={handleTemplateSelect}
                disabled={templatesLoading}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: 14,
                  border: `1px solid ${borderInput}`,
                  borderRadius: 4,
                  boxSizing: 'border-box',
                }}
              >
                {templatesLoading ? (
                  <option value="">Loading templates…</option>
                ) : templates.length === 0 ? (
                  <option value="">No templates available</option>
                ) : (
                  <>
                    <option value="">-- None, select manually --</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
            {otherTags.length === 0 && (
              <p style={{ color: '#d97706', fontSize: 13, marginBottom: 12 }}>
                No other offices available. Add more offices in Admin to define a route.
              </p>
            )}

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="release-route-count" style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#212529' }}>
                Number of offices
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    const n = Math.max(1, routeCount - 1);
                    applyRouteCount(n);
                    setSelectedTemplateId('');
                  }}
                  disabled={routeCount <= 1}
                  aria-label="Decrease"
                  style={{
                    width: 36,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    fontWeight: 600,
                    color: routeCount <= 1 ? '#9ca3af' : '#374151',
                    background: '#fff',
                    border: `1px solid ${borderInput}`,
                    borderRadius: 4,
                    cursor: routeCount <= 1 ? 'not-allowed' : 'pointer',
                    opacity: routeCount <= 1 ? 0.6 : 1,
                  }}
                >
                  −
                </button>
                <input
                  id="release-route-count"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={routeCountInput}
                  onChange={handleRouteCountChange}
                  onBlur={handleRouteCountBlur}
                  style={{
                    width: 60,
                    padding: '8px 12px',
                    fontSize: 14,
                    border: `1px solid ${borderInput}`,
                    borderRadius: 4,
                    boxSizing: 'border-box',
                    textAlign: 'center',
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const n = Math.min(10, routeCount + 1);
                    applyRouteCount(n);
                    setSelectedTemplateId('');
                  }}
                  disabled={routeCount >= 10}
                  aria-label="Increase"
                  style={{
                    width: 36,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    fontWeight: 600,
                    color: routeCount >= 10 ? '#9ca3af' : '#374151',
                    background: '#fff',
                    border: `1px solid ${borderInput}`,
                    borderRadius: 4,
                    cursor: routeCount >= 10 ? 'not-allowed' : 'pointer',
                    opacity: routeCount >= 10 ? 0.6 : 1,
                  }}
                >
                  +
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8, color: '#212529' }}>
                Offices (in order)
              </label>
              <p style={{ fontSize: 12, color: muted, marginBottom: 10 }}>Check offices that can approve or reject documents. Check offices that must endorse before action can be taken.</p>
              {routeOffices.slice(0, routeCount).map((selectedId, idx) => {
                const isLast = idx === routeCount - 1;
                const checkedCanTake = routeCanTakeAction.has(idx);
                const checkedNeedEndorsement = routeNeedEndorsement.has(idx);
                return (
                  <div key={idx} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
                    <select
                      value={selectedId ?? ''}
                      onChange={(e) => handleRouteOfficeChange(idx, e.target.value)}
                      style={{
                        flex: 1,
                        minWidth: 120,
                        padding: '8px 12px',
                        fontSize: 14,
                        border: `1px solid ${borderInput}`,
                        borderRadius: 4,
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="">-- Select office --</option>
                      {otherTags.map((t) => {
                        const tid = t.id ?? t.pk;
                        return (
                          <option key={tid} value={tid}>
                            {t.name ?? `Office ${tid}`}
                          </option>
                        );
                      })}
                    </select>
                    <label
                      title="Can take action"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 13,
                        color: '#374151',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        flexShrink: 0,
                        minWidth: 'fit-content',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checkedCanTake}
                        onChange={() => {
                          if (checkedCanTake && isLast) {
                            setRemoveCanTakeActionConfirm({ idx });
                            return;
                          }
                          setRouteCanTakeAction((prev) => {
                            const next = new Set(prev);
                            if (next.has(idx)) next.delete(idx);
                            else next.add(idx);
                            return next;
                          });
                        }}
                        style={{ margin: 0, flexShrink: 0 }}
                      />
                      <span style={{ color: 'inherit' }}>Can take action</span>
                    </label>
                    <label
                      title="Need endorsement"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 13,
                        color: '#374151',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        flexShrink: 0,
                        minWidth: 'fit-content',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checkedNeedEndorsement}
                        onChange={() => {
                          setRouteNeedEndorsement((prev) => {
                            const next = new Set(prev);
                            if (next.has(idx)) next.delete(idx);
                            else next.add(idx);
                            return next;
                          });
                        }}
                        style={{ margin: 0, flexShrink: 0 }}
                      />
                      <span style={{ color: 'inherit' }}>Need endorsement</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </>
        )}

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
            {message || 'Document released successfully.'}
          </div>
        )}
        {message && status !== 'success' && (
          <p
            style={{
              marginBottom: 16,
              fontSize: 14,
              color: status === 'error' ? '#842029' : '#0f5132',
              textAlign: 'left',
            }}
          >
            {message}
          </p>
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
          {step === 1 ? (
            <>
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
                form="release-scan-form"
                disabled={
                  status === 'searching' ||
                  !scanInput.trim() ||
                  (releaseMode === 'digital_release' && foundDoc && foundCode === scanInput.trim() && !detectedDigitalFixedRoute?.length && !selectedDigitalOfficeId) ||
                  ((releaseMode === 'digital_release' || releaseMode === 'digital_release_routed') && hasScannedDoc && digitalPolicy === 'digital_only' && !foundDocumentIsDigitalOnly && (releaseMode !== 'digital_release' || !detectedDigitalFixedRoute?.length) && !selectedDigitalCabinetId) ||
                  ((releaseMode === 'digital_release' || releaseMode === 'digital_release_routed') && hasScannedDoc && digitalPolicy === 'digital_only' && !foundDocumentIsDigitalOnly && (releaseMode !== 'digital_release' || !detectedDigitalFixedRoute?.length) && !selectedDigitalDrawerId) ||
                  ((releaseMode === 'digital_release' || releaseMode === 'digital_release_routed') && hasScannedDoc && digitalPolicy === 'digital_only' && !foundDocumentIsDigitalOnly && (releaseMode !== 'digital_release' || !detectedDigitalFixedRoute?.length) && !selectedDigitalFolderId)
                }
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#fff',
                  background:
                    status === 'searching' ||
                    !scanInput.trim() ||
                    (releaseMode === 'digital_release' && foundDoc && foundCode === scanInput.trim() && !detectedDigitalFixedRoute?.length && !selectedDigitalOfficeId) ||
                    ((releaseMode === 'digital_release' || releaseMode === 'digital_release_routed') && hasScannedDoc && digitalPolicy === 'digital_only' && !foundDocumentIsDigitalOnly && (releaseMode !== 'digital_release' || !detectedDigitalFixedRoute?.length) && !selectedDigitalCabinetId) ||
                    ((releaseMode === 'digital_release' || releaseMode === 'digital_release_routed') && hasScannedDoc && digitalPolicy === 'digital_only' && !foundDocumentIsDigitalOnly && (releaseMode !== 'digital_release' || !detectedDigitalFixedRoute?.length) && !selectedDigitalDrawerId) ||
                    ((releaseMode === 'digital_release' || releaseMode === 'digital_release_routed') && hasScannedDoc && digitalPolicy === 'digital_only' && !foundDocumentIsDigitalOnly && (releaseMode !== 'digital_release' || !detectedDigitalFixedRoute?.length) && !selectedDigitalFolderId)
                      ? '#6c757d'
                      : primary,
                  border: '1px solid transparent',
                  borderRadius: 4,
                  cursor:
                    status === 'searching' ||
                    !scanInput.trim() ||
                    (releaseMode === 'digital_release' && foundDoc && foundCode === scanInput.trim() && !detectedDigitalFixedRoute?.length && !selectedDigitalOfficeId) ||
                    ((releaseMode === 'digital_release' || releaseMode === 'digital_release_routed') && hasScannedDoc && digitalPolicy === 'digital_only' && !foundDocumentIsDigitalOnly && (releaseMode !== 'digital_release' || !detectedDigitalFixedRoute?.length) && !selectedDigitalCabinetId) ||
                    ((releaseMode === 'digital_release' || releaseMode === 'digital_release_routed') && hasScannedDoc && digitalPolicy === 'digital_only' && !foundDocumentIsDigitalOnly && (releaseMode !== 'digital_release' || !detectedDigitalFixedRoute?.length) && !selectedDigitalDrawerId) ||
                    ((releaseMode === 'digital_release' || releaseMode === 'digital_release_routed') && hasScannedDoc && digitalPolicy === 'digital_only' && !foundDocumentIsDigitalOnly && (releaseMode !== 'digital_release' || !detectedDigitalFixedRoute?.length) && !selectedDigitalFolderId)
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {status === 'searching'
                  ? 'Searching…'
                  : releaseMode === 'digital_release'
                    ? (foundDoc && foundCode === scanInput.trim() ? 'Send digital release' : 'Find document')
                    : releaseMode === 'digital_release_routed'
                      ? 'Find & set digital route'
                      : 'Find & continue'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleBack}
                disabled={status === 'releasing'}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#212529',
                  background: '#fff',
                  border: '1px solid #ced4da',
                  borderRadius: 4,
                  cursor: status === 'releasing' ? 'not-allowed' : 'pointer',
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleRouteConfirm}
                disabled={status === 'releasing'}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#fff',
                  background: status === 'releasing' ? '#6c757d' : primary,
                  border: '1px solid transparent',
                  borderRadius: 4,
                  cursor: status === 'releasing' ? 'not-allowed' : 'pointer',
                }}
              >
                {status === 'releasing' ? 'Releasing…' : 'Release'}
              </button>
            </>
          )}
        </div>
      </div>

      <ConfirmationModal
        open={removeCanTakeActionConfirm != null}
        title="Remove from offices that can take action?"
        message="The last office in the route usually takes action on documents. Are you sure you want to remove it from offices that can take action?"
        confirmLabel="Yes, remove"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (removeCanTakeActionConfirm != null) {
            const idx = removeCanTakeActionConfirm.idx;
            setRouteCanTakeAction((prev) => {
              const next = new Set(prev);
              if (next.has(idx)) next.delete(idx);
              else next.add(idx);
              return next;
            });
            setRemoveCanTakeActionConfirm(null);
          }
        }}
        onCancel={() => setRemoveCanTakeActionConfirm(null)}
      />

      <ConfirmationModal
        open={revertConfirm != null}
        title="Undo this release?"
        message={
          revertConfirm
            ? `Put "${revertConfirm.title}" (${revertConfirm.trackingCode}) back at ${tagInfo?.name || 'your office'}? This only works if the document has not been received yet.`
            : ''
        }
        confirmLabel="Undo release"
        cancelLabel="Cancel"
        onConfirm={() => performRevertRelease()}
        onCancel={() => setRevertConfirm(null)}
      />

      <ConfirmationModal
        open={pendingDigitalRouteConfirm != null}
        title="Fixed route detected"
        message={
          pendingDigitalRouteConfirm
            ? `This document has a fixed route with ${pendingDigitalRouteConfirm.remainingRoute.length} remaining office(s). Would you like to release digitally to the fixed route now?`
            : ''
        }
        confirmLabel="Yes, use fixed route"
        cancelLabel="No"
        onConfirm={async () => {
          const pending = pendingDigitalRouteConfirm;
          if (!pending?.doc || !pending?.code || !pending?.remainingRoute?.length) {
            setPendingDigitalRouteConfirm(null);
            setDetectedDigitalFixedRoute(null);
            return;
          }
          const nextRouteOffice = Number(pending.remainingRoute[0]);
          setPendingDigitalRouteConfirm(null);
          setDetectedDigitalFixedRoute(null);
          await doRelease(
            pending.doc,
            pending.code,
            pending.remainingRoute,
            null,
            null,
            'digital_release',
            nextRouteOffice,
            digitalPolicy,
          );
        }}
        onCancel={() => {
          setPendingDigitalRouteConfirm(null);
          setDetectedDigitalFixedRoute(null);
          setStatus('idle');
          setFoundDoc(null);
          setFoundCode('');
          setMessage('This document has a fixed route and must be released through that route.');
        }}
      />
    </div>
  );
}

export default ReleaseModal;
