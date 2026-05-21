import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DOCUMENT_STATUSES,
  getFileTypeIcon,
  VIEW_TYPES,
  COLORS,
  VALIDATION_MESSAGES,
  API_ENDPOINTS
} from '../constants/index.js';
import {
  useDocumentState,
  useUploadState,
  useUIState,
  useSearchState,
  useConnectionState
} from '../hooks/index.js';
import { SEARCH_TYPES } from '../hooks/useSearchState.js';
import {
  Header,
  Footer,
  Sidebar,
  SIDEBAR_EXPANDED,
  SIDEBAR_COLLAPSED,
  DashboardView,
  RouteTemplatesView,
  StaffDocumentLookupModal,
  LoadingSpinner,
  StatusBadge,
  DocumentList,
  UploadModal,
  DocumentViewerModal,
  TrackingCodeModal,
  PrintBarcodeModal,
  ReceiveModal,
  ReleaseModal,
  FloatingActionButton,
  SearchAndFilterBar,
  DOCUMENT_VIEW_STATUS_FILTER_OPTIONS,
  CabinetsView
} from '../components/index.js';
import { sessionManager } from '../services/session.js';
import { apiCall } from '../services/api.js';
import { fetchCustomFields } from '../services/customFields.js';
import { getArchiveCabinetDrawerSections } from '../utils/archiveCabinetDrawers.js';
import { archiveFolderFullPath, drawerOptionLabel, folderOptionLabel } from '../utils/drawerCategoryLabel.js';
import ConfirmationModal from '../components/modals/ConfirmationModal.jsx';

function DepartmentDashboard() {
  const { username } = useParams();
  const navigate = useNavigate();
  const user = sessionManager.getUser?.() ?? null;
  const tagInfo = user?.tag_id != null && user?.name
    ? {
        id: user.paperless_tag_id ?? user.tag_id,
        name: user.name,
        canApproveReject: !!user?.can_approve_reject,
        fixedRoutingEnabled: !!user?.fixed_routing_enabled,
        allowEndorse: user?.allow_endorse !== false,
        canUploadDocuments: user?.can_upload_documents !== false,
      }
    : null;
  const [allTags, setAllTags] = useState([]);
  const [trackingCode, setTrackingCode] = useState('');
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [avgProcessingTimeLabel, setAvgProcessingTimeLabel] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null); // { documents_count, at_office_count, in_transit_released_count }
  const [sidebarArchiveCabinets, setSidebarArchiveCabinets] = useState([]);
  const [selectedSidebarCabinetId, setSelectedSidebarCabinetId] = useState(null);
  const [selectedSidebarDrawerId, setSelectedSidebarDrawerId] = useState(null);
  /** Archive folder filter: '' = all folders, else selected folder id string */
  const [selectedSidebarFolderKey, setSelectedSidebarFolderKey] = useState('');
  const [lookupModalOpen, setLookupModalOpen] = useState(false);
  const [notifOutOfOfficeOpen, setNotifOutOfOfficeOpen] = useState(false);
  const [notifOutOfOfficeCode, setNotifOutOfOfficeCode] = useState('');

  // Document state management
  const {
    files,
    archiveFiles,
    loading,
    archiveLoading,
    error: documentError,
    fetchDocs,
    fetchArchiveDocs,
    updateDocumentStatus,
    setError: setDocumentError
  } = useDocumentState(tagInfo);

  const refetchSidebarArchiveCabinets = useCallback(() => {
    if (!tagInfo?.id) {
      setSidebarArchiveCabinets([]);
      return;
    }
    apiCall(API_ENDPOINTS.ARCHIVE_CABINETS)
      .then((data) => {
        setSidebarArchiveCabinets(Array.isArray(data?.cabinets) ? data.cabinets : []);
      })
      .catch(() => setSidebarArchiveCabinets([]));
  }, [tagInfo?.id]);

  // Search and filter state (before useUploadState so we can pass refreshWithSearch)
  const {
    searchTerm,
    searchType,
    viewType,
    statusFilter,
    copyStateFilter,
    documentTypeFilter,
    dateFrom,
    dateTo,
    filterDocuments,
    setSearchTerm,
    setSearchType,
    setStatusFilterValue,
    setCopyStateFilterValue,
    setDocumentTypeFilterValue,
    setDateFrom,
    setDateTo,
    setViewTypeValue,
  } = useSearchState();

  // Refresh with Paperless advanced search (server-side): query param sent to /api/documents/
  const refreshWithSearch = useCallback((opts = {}) => {
    const term = searchTerm?.trim();
    let searchQuery = null;
    if (term) {
      if (searchType === SEARCH_TYPES.TITLE) {
        // Field search: quote multi-word phrases so the query parser does not treat spaces as AND
        const safe = term.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        searchQuery = /\s/.test(term) ? `title:"${safe}"` : `title:${safe}`;
      } else if (searchType === SEARCH_TYPES.CONTENTS) {
        searchQuery = term;
      }
    }
    fetchDocs({ searchQuery, ...opts });
  }, [fetchDocs, searchType, searchTerm]);

  const refreshArchiveWithSearch = useCallback((opts = {}) => {
    const term = searchTerm?.trim();
    let searchQuery = null;
    if (term) {
      if (searchType === SEARCH_TYPES.TITLE) {
        const safe = term.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        searchQuery = /\s/.test(term) ? `title:"${safe}"` : `title:${safe}`;
      } else if (searchType === SEARCH_TYPES.CONTENTS) {
        searchQuery = term;
      }
    }
    fetchArchiveDocs({ searchQuery, ...opts });
  }, [fetchArchiveDocs, searchType, searchTerm]);

  const fetchStats = useCallback(() => {
    if (!tagInfo?.id) return;
    apiCall(`/api/admin/stats?tag_id=${tagInfo.id}&include_avg_processing_time=1`)
      .then((data) => {
        setAvgProcessingTimeLabel(data?.avg_processing_time_receive_to_release_label ?? null);
        setDashboardStats({
          documents_count: data?.documents_count ?? 0,
          at_office_count: data?.at_office_count ?? 0,
          in_transit_released_count: data?.in_transit_released_count ?? 0,
          activity_today: data?.activity_today ?? 0,
          activity_this_week: data?.activity_this_week ?? 0,
          activity_this_month: data?.activity_this_month ?? 0,
          cumulative_received_count: data?.cumulative_received_count ?? 0,
          cumulative_originated_count: data?.cumulative_originated_count ?? 0,
          received_still_with_us_count: data?.received_still_with_us_count ?? 0,
        });
      })
      .catch((err) => {
        setAvgProcessingTimeLabel((prev) => prev ?? null);
        setDashboardStats((prev) => prev);
        if (err?.message && (err.message.includes('Authentication') || err.message.includes('401'))) {
          console.error('[Stats] Login/session error:', err.message);
        }
      });
  }, [tagInfo?.id]);

  const onUploadComplete = useCallback(() => {
    refreshWithSearch();
    refreshArchiveWithSearch({ silent: true });
    fetchStats();
  }, [refreshWithSearch, refreshArchiveWithSearch, fetchStats]);

  const refreshAll = useCallback(() => {
    refreshWithSearch();
    refreshArchiveWithSearch({ silent: true });
    fetchStats();
    refetchSidebarArchiveCabinets();
  }, [refreshWithSearch, refreshArchiveWithSearch, fetchStats, refetchSidebarArchiveCabinets]);

  /** Archive toolbar refresh: reload archive visibly; keep documents refetch silent so it does not compete with archive loading state. */
  const refreshArchivePage = useCallback(() => {
    refreshArchiveWithSearch({ silent: false });
    refreshWithSearch({ silent: true });
    fetchStats();
    refetchSidebarArchiveCabinets();
  }, [refreshArchiveWithSearch, refreshWithSearch, fetchStats, refetchSidebarArchiveCabinets]);

  // Upload and processing state
  const {
    uploadFile,
    uploading,
    isProcessing,
    processingStatus,
    pendingTrackingCodeDoc,
    savedForPrint,
    error: uploadError,
    canRetry,
    setUploadFile,
    selectUploadFile,
    handleUpload,
    saveTrackingCode,
    finishTrackingCodeFlow,
    completeUpload,
    retryUpload,
  } = useUploadState(tagInfo, onUploadComplete, setTrackingCode);
  
  // UI state management
  const {
    viewingDocument,
    currentView,
    sidebarVisible,
    profileMenuOpen,
    hoveredCard,
    showAddModal,
    imgErrors,
    imgLoading,
    profileMenuRef,
    toggleSidebar,
    toggleProfileMenu,
    closeProfileMenu,
    setView,
    openDocumentViewer,
    closeDocumentViewer,
    openUploadModal,
    closeUploadModal,
    setImageLoading,
    setImageError,
    setHoveredCard,
  } = useUIState();
  const canUploadDocuments = tagInfo?.canUploadDocuments !== false;
  const handleOpenUploadModal = useCallback(() => {
    if (!canUploadDocuments) return;
    openUploadModal();
  }, [canUploadDocuments, openUploadModal]);
  
  // Connection and session state
  const {
    connectionError,
    checkConnection,
    validateSession,
    logout
  } = useConnectionState();

  const setDashboardView = useCallback((view) => {
    if (view !== 'archive') setSelectedSidebarDrawerId(null);
    setView(view);
  }, [setView]);

  const handleNotificationClick = useCallback((notification) => {
    const docId = Number(notification?.documentId);
    if (!Number.isFinite(docId)) return;
    const target =
      files.find((f) => Number(f.id) === docId) ??
      archiveFiles.find((f) => Number(f.id) === docId) ??
      null;
    if (!target) {
      setDashboardView('documents');
      refreshWithSearch({ silent: true });
      setNotifOutOfOfficeCode(String(notification?.trackingCode ?? '').trim());
      setNotifOutOfOfficeOpen(true);
      return;
    }
    setDashboardView('documents');
    openDocumentViewer(target);
  }, [files, archiveFiles, openDocumentViewer, refreshWithSearch, setDashboardView]);

  useEffect(() => {
    if (currentView !== 'tracker') return;
    setLookupModalOpen(true);
    setDashboardView('documents');
  }, [currentView, setDashboardView]);

  useEffect(() => {
    if (currentView === 'documents' && statusFilter === DOCUMENT_STATUSES.ARCHIVED) {
      setStatusFilterValue('');
    }
  }, [currentView, statusFilter, setStatusFilterValue]);

  const [timelineRefreshTrigger, setTimelineRefreshTrigger] = useState(0);

  // ============================================================================
  // EFFECTS & LIFECYCLE
  // ============================================================================
  
  // Validate session and redirect; fetch all tags; refresh user for latest office settings
  useEffect(() => {
    if (!validateSession()) return;
    if (!user) return;
    if (user.role === 'admin') {
      navigate('/admin', { replace: true });
      return;
    }
    if (user.username !== username) {
      navigate(`/${user.username}`, { replace: true });
      return;
    }
    if (!tagInfo) return;
    const fetchTagsAndFields = async () => {
      try {
        const token = sessionManager.getAuthToken?.();
        const [tagsData, , userData] = await Promise.all([
          apiCall(API_ENDPOINTS.TAGS),
          fetchCustomFields(),
          token ? apiCall('/api/auth/user', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null) : Promise.resolve(null),
        ]);
        setAllTags(Array.isArray(tagsData?.results) ? tagsData.results : (tagsData ? [tagsData] : []));
        if (userData) sessionManager.setUserSession(userData.username, token, userData);
      } catch (err) {
        console.error('Failed to fetch tags:', err);
      }
    };
    fetchTagsAndFields();
  }, [username, user?.username, user?.role, tagInfo?.id, navigate, validateSession]);

  useEffect(() => {
    refetchSidebarArchiveCabinets();
  }, [refetchSidebarArchiveCabinets]);

  useEffect(() => {
    if (currentView === 'cabinets' && tagInfo?.id) refetchSidebarArchiveCabinets();
  }, [currentView, tagInfo?.id, refetchSidebarArchiveCabinets]);

  useEffect(() => {
    if (selectedSidebarDrawerId == null) return;
    if (selectedSidebarCabinetId == null) {
      const exists = sidebarArchiveCabinets.some((c) =>
        (c.drawers ?? []).some((d) => Number(d.id) === Number(selectedSidebarDrawerId))
      );
      if (!exists) setSelectedSidebarDrawerId(null);
      return;
    }
    const cab = sidebarArchiveCabinets.find((c) => Number(c.id) === Number(selectedSidebarCabinetId));
    const inCabinet = (cab?.drawers ?? []).some((d) => Number(d.id) === Number(selectedSidebarDrawerId));
    if (!inCabinet) setSelectedSidebarDrawerId(null);
  }, [sidebarArchiveCabinets, selectedSidebarDrawerId, selectedSidebarCabinetId]);

  useEffect(() => {
    if (selectedSidebarCabinetId == null) return;
    const exists = sidebarArchiveCabinets.some((c) => Number(c.id) === Number(selectedSidebarCabinetId));
    if (!exists) setSelectedSidebarCabinetId(null);
  }, [sidebarArchiveCabinets, selectedSidebarCabinetId]);

  const drawerForArchiveFolderFilter = useMemo(() => {
    if (selectedSidebarDrawerId == null) return null;
    for (const c of sidebarArchiveCabinets) {
      const d = (c.drawers ?? []).find((x) => Number(x.id) === Number(selectedSidebarDrawerId));
      if (d) return d;
    }
    return null;
  }, [sidebarArchiveCabinets, selectedSidebarDrawerId]);

  const folderOptionsForArchiveFilter = useMemo(() => {
    const raw = drawerForArchiveFolderFilter?.folders;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    return [...raw].sort((a, b) => Number(a.folder_number) - Number(b.folder_number));
  }, [drawerForArchiveFolderFilter]);

  const cabinetForSelectedDrawer = useMemo(() => {
    if (selectedSidebarDrawerId == null) return null;
    for (const c of sidebarArchiveCabinets) {
      if ((c.drawers ?? []).some((d) => Number(d.id) === Number(selectedSidebarDrawerId))) return c;
    }
    return null;
  }, [sidebarArchiveCabinets, selectedSidebarDrawerId]);

  useEffect(() => {
    if (selectedSidebarFolderKey === 'none') {
      setSelectedSidebarFolderKey('');
      return;
    }
    if (selectedSidebarDrawerId == null || folderOptionsForArchiveFilter.length === 0) {
      setSelectedSidebarFolderKey('');
      return;
    }
    if (selectedSidebarFolderKey === '') return;
    const fid = parseInt(selectedSidebarFolderKey, 10);
    if (!Number.isFinite(fid)) {
      setSelectedSidebarFolderKey('');
      return;
    }
    const ok = folderOptionsForArchiveFilter.some((f) => Number(f.id) === fid);
    if (!ok) setSelectedSidebarFolderKey('');
  }, [selectedSidebarDrawerId, folderOptionsForArchiveFilter, selectedSidebarFolderKey]);

  // Initial document load after session + office tag are ready.
  // Do not use a ref guard here: React Strict Mode remounts before the first async completes,
  // which left fetchInitRef stuck true and skipped the real mount — documents never loaded.
  useEffect(() => {
    if (!validateSession() || !tagInfo) return;
    let cancelled = false;
    const checkConnectionAndFetch = async () => {
      try {
        const connected = await checkConnection();
        if (cancelled) return;
        if (connected) await fetchDocs();
      } catch (err) {
        if (!cancelled) console.error('Error during initialization:', err);
      }
    };
    checkConnectionAndFetch();
    return () => {
      cancelled = true;
    };
  }, [tagInfo?.id, fetchDocs, checkConnection, validateSession]);

  // Refetch when switching to Tracking Code (need full list for client-side filter) - silent to avoid loading flash
  const prevSearchTypeRef = useRef(searchType);
  useEffect(() => {
    const wasServerSearch =
      prevSearchTypeRef.current === SEARCH_TYPES.CONTENTS ||
      prevSearchTypeRef.current === SEARCH_TYPES.TITLE;
    if (wasServerSearch && searchType === SEARCH_TYPES.TRACKING_CODE && tagInfo?.id) {
      if (currentView === 'archive') fetchArchiveDocs({ silent: true });
      else fetchDocs({ silent: true });
    }
    prevSearchTypeRef.current = searchType;
  }, [searchType, currentView, tagInfo?.id, fetchDocs, fetchArchiveDocs]);

  // Live search for Content and Title (same UX as tracking code: filter/refetch as you type, debounced)
  const searchDebounceRef = useRef(null);
  useEffect(() => {
    if (searchType !== SEARCH_TYPES.CONTENTS && searchType !== SEARCH_TYPES.TITLE || !tagInfo?.id) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null;
      if (currentView === 'archive') refreshArchiveWithSearch({ silent: false });
      else refreshWithSearch({ silent: false });
    }, 400);
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [searchType, searchTerm, tagInfo?.id, currentView, refreshWithSearch, refreshArchiveWithSearch]);

  useEffect(() => {
    if (currentView !== 'archive' || !tagInfo?.id) return;
    fetchArchiveDocs();
  }, [currentView, tagInfo?.id, fetchArchiveDocs]);

  useEffect(() => {
    if (!tagInfo?.id) {
      setAvgProcessingTimeLabel(null);
      setDashboardStats(null);
      return;
    }
    fetchStats();
  }, [tagInfo?.id, fetchStats]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleStatusChange = async (docId, newStatus, remarks) => {
    try {
      await updateDocumentStatus(docId, newStatus, remarks);
      setTimelineRefreshTrigger((t) => t + 1);
    } catch {
      setDocumentError('Failed to update document status');
    }
  };

  const handleSaveTrackingCode = async (tc, title, documentTypeId, submittedBy, options = {}) => {
    const codeToSave = tc ?? trackingCode;
    if (!pendingTrackingCodeDoc || !codeToSave) return;

    try {
      await saveTrackingCode(codeToSave, title, documentTypeId, submittedBy, options);
      setTrackingCode('');
      // PrintBarcodeModal will open; close upload flow when user dismisses it
    } catch (err) {
      console.error('Error saving tracking code:', err);
    }
  };

  const handlePrintBarcodeClose = () => {
    finishTrackingCodeFlow();
    completeUpload();
    closeUploadModal();
  };

  // StatusBadge is imported from components

  const tagName = tagInfo?.name || '';
  const filteredArchiveFiles = useMemo(() => {
    let list = archiveFiles;
    if (selectedSidebarDrawerId != null) {
      const id = Number(selectedSidebarDrawerId);
      list = list.filter((f) => f.archiveDrawerId != null && Number(f.archiveDrawerId) === id);
    } else if (selectedSidebarCabinetId != null) {
      const cab = sidebarArchiveCabinets.find((c) => Number(c.id) === Number(selectedSidebarCabinetId));
      const drawerIds = new Set((cab?.drawers ?? []).map((d) => Number(d.id)));
      if (drawerIds.size === 0) list = [];
      else {
        list = list.filter((f) => f.archiveDrawerId != null && drawerIds.has(Number(f.archiveDrawerId)));
      }
    }
    if (
      selectedSidebarDrawerId != null &&
      selectedSidebarFolderKey !== '' &&
      folderOptionsForArchiveFilter.length > 0
    ) {
      const fid = parseInt(selectedSidebarFolderKey, 10);
      if (Number.isFinite(fid)) {
        list = list.filter((f) => f.archiveFolderId != null && Number(f.archiveFolderId) === fid);
      }
    }
    return list;
  }, [
    archiveFiles,
    selectedSidebarDrawerId,
    selectedSidebarCabinetId,
    sidebarArchiveCabinets,
    selectedSidebarFolderKey,
    folderOptionsForArchiveFilter,
  ]);
  const archiveDrawerPicker = useMemo(
    () => getArchiveCabinetDrawerSections(sidebarArchiveCabinets),
    [sidebarArchiveCabinets]
  );
  const archiveDrawerFilterSections = useMemo(() => {
    if (selectedSidebarCabinetId == null) {
      return archiveDrawerPicker.cabinetDrawerSections;
    }
    const cab = sidebarArchiveCabinets.find((c) => Number(c.id) === Number(selectedSidebarCabinetId));
    if (!cab) return [];
    const drawers = [...(cab.drawers ?? [])]
      .filter((d) => d?.id != null)
      .sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.id ?? 0) - (b.id ?? 0)
      );
    return [{ cab, drawers }];
  }, [selectedSidebarCabinetId, sidebarArchiveCabinets, archiveDrawerPicker]);
  const viewerFiles = currentView === 'archive' ? filteredArchiveFiles : files;
  const officeNotConfigured = user && user.role !== 'admin' && !tagInfo?.id;
  if (officeNotConfigured || documentError || uploadError || connectionError) {
    const errorMessage = officeNotConfigured ? 'Office not configured. Please contact admin.' : (documentError || uploadError || connectionError);
    return <div style={{ padding: 32, textAlign: 'center', color: '#000' }}>{errorMessage}</div>;
  }

  /* Main pane stays padding 0 for Documents/Archive/Cabinets; spacing lives on inner max-width columns only. */
  const mainColFixedPadding = '16px 16px 0';
  const mainColScrollPadding = '0 16px 24px';
  const mainColFullScrollPadding = '16px 16px 24px';

  return (
    <>
      <div style={{ 
        position: 'relative',
        display: 'flex', 
        minHeight: '100vh',
        height: '100vh',
        backgroundColor: '#f8f9fa',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <Header
          tagName={tagName}
          tagId={tagInfo?.id ?? null}
          onNotificationClick={handleNotificationClick}
          profileMenuOpen={profileMenuOpen}
          profileMenuRef={profileMenuRef}
          toggleSidebar={toggleSidebar}
          toggleProfileMenu={toggleProfileMenu}
          closeProfileMenu={closeProfileMenu}
          logout={logout}
        />
        {/* Sidebar */}
        <Sidebar
          sidebarVisible={sidebarVisible}
          currentView={currentView}
          setView={setDashboardView}
          toggleSidebar={toggleSidebar}
          fixedRoutingEnabled={!!tagInfo?.fixedRoutingEnabled}
          copyStateFilter={copyStateFilter}
          setCopyStateFilterValue={setCopyStateFilterValue}
          onOpenLookup={() => setLookupModalOpen(true)}
          lookupModalOpen={lookupModalOpen}
          onSelectArchiveDrawer={(drawerId) => {
            setSelectedSidebarDrawerId(drawerId);
            if (drawerId == null) setSelectedSidebarCabinetId(null);
          }}
        />

        {/* Main Content: Documents/Archive/Cabinets — no padding on this shell (scrollbar flush); inner columns use mainCol* padding. */}
        <div style={{ 
          position: 'absolute',
          top: 80,
          bottom: 56,
          left: sidebarVisible ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED,
          right: 0,
          transition: 'left 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          overflowY: currentView === 'documents' || currentView === 'archive' || currentView === 'cabinets' ? 'hidden' : 'auto',
          overflowX: 'hidden',
          /* Avoid stable gutter on non-scrolling main: inner panes scroll; gutter here misplaces the visible scrollbar */
          scrollbarGutter:
            currentView === 'documents' || currentView === 'archive' || currentView === 'cabinets'
              ? undefined
              : 'stable',
          WebkitOverflowScrolling: 'touch',
          padding:
            currentView === 'dashboard'
              ? '10px 12px 24px'
              : currentView === 'documents' || currentView === 'archive' || currentView === 'cabinets'
                ? 0
                : '24px 12px',
          backgroundColor: '#fff',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
          {currentView === 'dashboard' ? (
            <DashboardView
              files={files}
              archiveFiles={archiveFiles}
              avgProcessingTimeLabel={avgProcessingTimeLabel}
              dashboardStats={dashboardStats}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
            />
          ) : currentView === 'templates' ? (
            <RouteTemplatesView tagInfo={tagInfo} allTags={allTags} />
          ) : currentView === 'cabinets' ? (
            /* Same flex chain as Documents/Archive: basis 0 + minHeight 0 so the scroll pane fills the main area (full-height scrollbar track). */
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
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    WebkitOverflowScrolling: 'touch',
                    boxSizing: 'border-box',
                  }}
                >
                <div
                  style={{
                    maxWidth: 1440,
                    width: '100%',
                    margin: '0 auto',
                    padding: mainColFullScrollPadding,
                    boxSizing: 'border-box',
                  }}
                >
                  <CabinetsView
                    tagConfigured={!!tagInfo?.id}
                    archiveCabinets={sidebarArchiveCabinets}
                    onCabinetsUpdated={refetchSidebarArchiveCabinets}
                    onOpenArchiveForDrawer={(drawerId) => {
                      setSelectedSidebarDrawerId(drawerId);
                      setSelectedSidebarFolderKey('');
                      const cab = sidebarArchiveCabinets.find((c) =>
                        (c.drawers ?? []).some((d) => Number(d.id) === Number(drawerId))
                      );
                      setSelectedSidebarCabinetId(cab?.id != null ? Number(cab.id) : null);
                      setDashboardView('archive');
                    }}
                  />
                </div>
                </div>
              </div>
            </div>
          ) : currentView === 'archive' ? (
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
                  maxWidth: 1440,
                  width: '100%',
                  margin: '0 auto',
                  padding: mainColFixedPadding,
                  boxSizing: 'border-box',
                  flexShrink: 0,
                }}
              >
              {archiveDrawerPicker.totalDrawerOptionCount > 0 && (
                <div
                  style={{
                    marginBottom: 12,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <label
                    htmlFor="archive-main-cabinet-filter"
                    style={{ fontSize: 13, fontWeight: 600, color: '#374151', flexShrink: 0 }}
                  >
                    Cabinet
                  </label>
                  <select
                    id="archive-main-cabinet-filter"
                    aria-label="Filter archive by cabinet"
                    value={selectedSidebarCabinetId == null ? '' : String(selectedSidebarCabinetId)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedSidebarCabinetId(v ? parseInt(v, 10) : null);
                      setSelectedSidebarDrawerId(null);
                      setSelectedSidebarFolderKey('');
                    }}
                    style={{
                      flex: 1,
                      minWidth: 160,
                      maxWidth: 280,
                      fontSize: 13,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #e5e7eb',
                      background: '#fff',
                      color: '#374151',
                    }}
                  >
                    <option value="">All cabinets</option>
                    {sidebarArchiveCabinets.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        C{c.code}
                      </option>
                    ))}
                  </select>
                  <label
                    htmlFor="archive-main-drawer-filter"
                    style={{ fontSize: 13, fontWeight: 600, color: '#374151', flexShrink: 0 }}
                  >
                    Drawer
                  </label>
                  <select
                    id="archive-main-drawer-filter"
                    aria-label="Filter archive by drawer"
                    value={selectedSidebarDrawerId == null ? '' : String(selectedSidebarDrawerId)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedSidebarDrawerId(v ? parseInt(v, 10) : null);
                      setSelectedSidebarFolderKey('');
                    }}
                    style={{
                      flex: 1,
                      minWidth: 200,
                      maxWidth: 420,
                      fontSize: 13,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #e5e7eb',
                      background: '#fff',
                      color: '#374151',
                    }}
                  >
                    <option value="">
                      {selectedSidebarCabinetId == null ? 'All drawers' : 'Any drawer in this cabinet'}
                    </option>
                    {archiveDrawerFilterSections.map(({ cab, drawers }) =>
                      drawers.length === 0 ? null : (
                        <optgroup key={cab.id} label={`C${cab.code}`}>
                          {drawers.map((d) => (
                            <option key={d.id} value={String(d.id)}>
                              {drawerOptionLabel(d)}
                            </option>
                          ))}
                        </optgroup>
                      )
                    )}
                  </select>
                  {selectedSidebarDrawerId != null && folderOptionsForArchiveFilter.length > 0 && (
                    <>
                      <label
                        htmlFor="archive-main-folder-filter"
                        style={{ fontSize: 13, fontWeight: 600, color: '#374151', flexShrink: 0 }}
                      >
                        Folder
                      </label>
                      <select
                        id="archive-main-folder-filter"
                        aria-label="Filter archive by folder"
                        value={selectedSidebarFolderKey}
                        onChange={(e) => setSelectedSidebarFolderKey(e.target.value)}
                        style={{
                          flex: 1,
                          minWidth: 140,
                          maxWidth: 220,
                          fontSize: 13,
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: '1px solid #e5e7eb',
                          background: '#fff',
                          color: '#374151',
                        }}
                      >
                        <option value="">All folders</option>
                        {folderOptionsForArchiveFilter.map((f) => (
                          <option key={f.id} value={String(f.id)}>
                            {cabinetForSelectedDrawer && drawerForArchiveFolderFilter
                              ? archiveFolderFullPath(cabinetForSelectedDrawer, drawerForArchiveFolderFilter, f)
                              : folderOptionLabel(f)}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  {(selectedSidebarCabinetId != null ||
                    selectedSidebarDrawerId != null ||
                    selectedSidebarFolderKey !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSidebarCabinetId(null);
                        setSelectedSidebarDrawerId(null);
                        setSelectedSidebarFolderKey('');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '4px 0',
                        color: '#2a5196',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        fontSize: 13,
                      }}
                    >
                      Clear filter
                    </button>
                  )}
                </div>
              )}
              <SearchAndFilterBar
                searchTerm={searchTerm}
                searchType={searchType}
                statusFilter={statusFilter}
                documentTypeFilter={documentTypeFilter}
                dateFrom={dateFrom}
                dateTo={dateTo}
                viewType={viewType}
                files={filteredArchiveFiles}
                onSearchChange={setSearchTerm}
                onSearchTypeChange={setSearchType}
                onSearchSubmit={(searchType === SEARCH_TYPES.CONTENTS || searchType === SEARCH_TYPES.TITLE) ? refreshArchiveWithSearch : undefined}
                onStatusFilterChange={setStatusFilterValue}
                onDocumentTypeFilterChange={setDocumentTypeFilterValue}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
                onViewTypeChange={setViewTypeValue}
                onRefresh={refreshArchivePage}
              />
              </div>
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
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    WebkitOverflowScrolling: 'touch',
                    boxSizing: 'border-box',
                  }}
                >
                <div
                  style={{
                    maxWidth: 1440,
                    width: '100%',
                    margin: '0 auto',
                    padding: mainColScrollPadding,
                    boxSizing: 'border-box',
                    minHeight: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: archiveLoading ? 'center' : 'stretch',
                    justifyContent: archiveLoading ? 'center' : 'flex-start',
                  }}
                >
                {archiveLoading ? (
                  <LoadingSpinner text="Loading archive…" showOverlay={false} compact />
                ) : (
                  <DocumentList
                    files={filteredArchiveFiles}
                    searchTerm={searchTerm}
                    searchType={searchType}
                    statusFilter={statusFilter}
                    copyStateFilter={copyStateFilter}
                    documentTypeFilter={documentTypeFilter}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    viewType={viewType}
                    hoveredCard={hoveredCard}
                    imgLoading={imgLoading}
                    imgErrors={imgErrors}
                    onHoverCard={setHoveredCard}
                    onViewDocument={openDocumentViewer}
                    onImageLoad={setImageLoading}
                    onImageError={setImageError}
                    onImageLoadStart={setImageLoading}
                    getFileTypeIcon={getFileTypeIcon}
                  />
                )}
                </div>
                </div>
              </div>
            </div>
          ) : (
            /* Documents View - filter bar fixed; list scrolls in full-width pane (scrollbar aligned with cabinets) */
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
                  maxWidth: 1440,
                  width: '100%',
                  margin: '0 auto',
                  padding: mainColFixedPadding,
                  boxSizing: 'border-box',
                  flexShrink: 0,
                }}
              >
                <SearchAndFilterBar
                  searchTerm={searchTerm}
                  searchType={searchType}
                  statusFilter={statusFilter}
                  statusFilterOptions={DOCUMENT_VIEW_STATUS_FILTER_OPTIONS}
                  documentTypeFilter={documentTypeFilter}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  viewType={viewType}
                  files={files}
                  onSearchChange={setSearchTerm}
                  onSearchTypeChange={setSearchType}
                  onSearchSubmit={(searchType === SEARCH_TYPES.CONTENTS || searchType === SEARCH_TYPES.TITLE) ? refreshWithSearch : undefined}
                  onStatusFilterChange={setStatusFilterValue}
                  onDocumentTypeFilterChange={setDocumentTypeFilterValue}
                  onDateFromChange={setDateFrom}
                  onDateToChange={setDateTo}
                  onViewTypeChange={setViewTypeValue}
                  onRefresh={refreshAll}
                />
              </div>
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
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    WebkitOverflowScrolling: 'touch',
                    boxSizing: 'border-box',
                  }}
                >
                <div
                  style={{
                    maxWidth: 1440,
                    width: '100%',
                    margin: '0 auto',
                    padding: mainColScrollPadding,
                    boxSizing: 'border-box',
                    minHeight: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: loading ? 'center' : 'stretch',
                    justifyContent: loading ? 'center' : 'flex-start',
                  }}
                >
                {loading ? (
                  <LoadingSpinner text="Loading documents…" showOverlay={false} compact />
                ) : (
                <DocumentList
                  files={files}
                  searchTerm={searchTerm}
                  searchType={searchType}
                  statusFilter={statusFilter}
                  copyStateFilter={copyStateFilter}
                  documentTypeFilter={documentTypeFilter}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  viewType={viewType}
                  hoveredCard={hoveredCard}
                  imgLoading={imgLoading}
                  imgErrors={imgErrors}
                  onHoverCard={setHoveredCard}
                  onViewDocument={openDocumentViewer}
                  onImageLoad={setImageLoading}
                  onImageError={setImageError}
                  onImageLoadStart={setImageLoading}
                  getFileTypeIcon={getFileTypeIcon}
                />
                )}
                </div>
                </div>
              </div>
                {/* Upload Modal */}
                <UploadModal
                  showAddModal={showAddModal && canUploadDocuments}
                  uploading={uploading}
                  isProcessing={isProcessing}
                  processingStatus={processingStatus}
                  uploadFile={uploadFile}
                  uploadError={uploadError}
                  canRetry={canRetry}
                  onClose={() => {
                    if (!uploading && !isProcessing) {
                      closeUploadModal();
                      completeUpload();
                    }
                  }}
                  onFileSelect={selectUploadFile}
                  onUpload={handleUpload}
                  onRetry={retryUpload}
                  onRemoveFile={() => setUploadFile(null)}
                />

                {/* Pending Tracking Code Modal */}
                <TrackingCodeModal
                  pendingTrackingCodeDoc={pendingTrackingCodeDoc}
                  trackingCode={trackingCode}
                  processingStatus={processingStatus}
                  onClose={() => {
                    completeUpload();
                    setTrackingCode('');
                    closeUploadModal();
                  }}
                  onSave={handleSaveTrackingCode}
                />

                {/* Print Barcode Modal (after tracking code saved) */}
                <PrintBarcodeModal
                  trackingCode={savedForPrint?.trackingCode}
                  documentTitle={savedForPrint?.documentTitle}
                  onClose={handlePrintBarcodeClose}
                  onPrint={handlePrintBarcodeClose}
                />

                {/* Receive Modal */}
                <ReceiveModal
                  open={showReceiveModal}
                  tagInfo={tagInfo}
                  allTags={allTags}
                  onClose={() => setShowReceiveModal(false)}
                  onSuccess={() => {
                    refreshWithSearch();
                    refreshArchiveWithSearch({ silent: true });
                    fetchStats();
                  }}
                />

                {/* Release Modal */}
                <ReleaseModal
                  open={showReleaseModal}
                  tagInfo={tagInfo}
                  allTags={allTags}
                  files={files}
                  onClose={() => setShowReleaseModal(false)}
                  onSuccess={() => {
                    refreshWithSearch();
                    refreshArchiveWithSearch({ silent: true });
                    setTimelineRefreshTrigger((t) => t + 1);
                    setTimeout(() => fetchStats(), 300);
                  }}
                />

                {/* Floating Upload FAB */}
                <FloatingActionButton
                  currentView={currentView}
                  canUpload={canUploadDocuments}
                  onClick={handleOpenUploadModal}
                  onReceiveClick={() => setShowReceiveModal(true)}
                  onReleaseClick={() => setShowReleaseModal(true)}
                />
            </div>
          )}
        </div>

        {(currentView === 'documents' || currentView === 'archive') && (
          <DocumentViewerModal
            viewingDocument={viewingDocument ? (viewerFiles.find((f) => f.id === viewingDocument.id) ?? viewingDocument) : null}
            documents={filterDocuments(viewerFiles)}
            onClose={closeDocumentViewer}
            onNavigate={openDocumentViewer}
            allTags={allTags}
            tagInfo={tagInfo}
            canApproveReject={!!tagInfo?.canApproveReject}
            onStatusChange={handleStatusChange}
            onEndorsementSuccess={() => {
              refreshWithSearch({ silent: true });
              refreshArchiveWithSearch({ silent: true });
            }}
            onArchiveSuccess={() => {
              refreshWithSearch({ silent: true });
              refreshArchiveWithSearch({ silent: true });
              refetchSidebarArchiveCabinets();
              setTimelineRefreshTrigger((t) => t + 1);
            }}
            timelineRefreshTrigger={timelineRefreshTrigger}
          />
        )}

        <StaffDocumentLookupModal open={lookupModalOpen} onClose={() => setLookupModalOpen(false)} />

        <ConfirmationModal
          open={notifOutOfOfficeOpen}
          title="Document not in your office"
          message={
            notifOutOfOfficeCode
              ? `This document (${notifOutOfOfficeCode}) is currently not in your office.`
              : 'This document is currently not in your office.'
          }
          confirmLabel="OK"
          cancelLabel="Close"
          onConfirm={() => setNotifOutOfOfficeOpen(false)}
          onCancel={() => setNotifOutOfOfficeOpen(false)}
        />

        <Footer centered />

        {/* Floating Upload Button, Upload Modal, Footer, Document Viewer Modal, Pending Tracking Code Modal */}
        {/* ...rest of the UI from App.jsx... */}
      </div>
    </>
  );
}

export default DepartmentDashboard;   