/**
 * useUIState Hook
 * 
 * Manages UI-related state including modals, views, sidebar, and other UI interactions.
 */

import { useState, useRef, useEffect } from 'react';
import { DEFAULT_VIEW_SETTINGS, VIEW_TYPES } from '../constants/index.js';

export function useUIState() {
  // UI State
  const [viewingDocument, setViewingDocument] = useState(null);
  const [currentView, setCurrentView] = useState(DEFAULT_VIEW_SETTINGS.CURRENT_VIEW);
  const [sidebarVisible, setSidebarVisible] = useState(DEFAULT_VIEW_SETTINGS.SIDEBAR_VISIBLE);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Image and Media State
  const [imgErrors, setImgErrors] = useState({});
  const [imgLoading, setImgLoading] = useState({});

  // DOM References
  const profileMenuRef = useRef(null);
  const isListenerAddedRef = useRef(false);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    }
    
    if (profileMenuOpen && !isListenerAddedRef.current) {
      document.addEventListener('mousedown', handleClickOutside);
      isListenerAddedRef.current = true;
    } else if (!profileMenuOpen && isListenerAddedRef.current) {
      document.removeEventListener('mousedown', handleClickOutside);
      isListenerAddedRef.current = false;
    }
    
    return () => {
      if (isListenerAddedRef.current) {
        document.removeEventListener('mousedown', handleClickOutside);
        isListenerAddedRef.current = false;
      }
    };
  }, [profileMenuOpen]);

  // Add/remove body class for background
  useEffect(() => {
    document.body.classList.add('no-bg');
    return () => document.body.classList.remove('no-bg');
  }, []);

  /**
   * Toggle sidebar visibility
   */
  const toggleSidebar = () => {
    setSidebarVisible(prev => !prev);
  };

  /**
   * Toggle profile menu
   */
  const toggleProfileMenu = () => {
    setProfileMenuOpen(prev => !prev);
  };

  /**
   * Close profile menu
   */
  const closeProfileMenu = () => {
    setProfileMenuOpen(false);
  };

  /**
   * Set current view
   * 
   * @param {string} view - View to set ('dashboard' or 'documents')
   */
  const setView = (view) => {
    setCurrentView(view);
  };

  /**
   * Set view type (grid or list)
   * 
   * @param {string} viewType - View type to set
   */
  const setViewType = (viewType) => {
    if (viewType === VIEW_TYPES.GRID || viewType === VIEW_TYPES.LIST) {
      // This would be used in the main component
      // For now, we'll just return the function
      return viewType;
    }
  };

  /**
   * Open document viewer
   * 
   * @param {Object} document - Document to view
   */
  const openDocumentViewer = (document) => {
    setViewingDocument(document);
  };

  /**
   * Close document viewer
   */
  const closeDocumentViewer = () => {
    setViewingDocument(null);
  };

  /**
   * Open upload modal
   */
  const openUploadModal = () => {
    setShowAddModal(true);
  };

  /**
   * Close upload modal
   */
  const closeUploadModal = () => {
    setShowAddModal(false);
  };

  /**
   * Handle image loading state
   * 
   * @param {number} docId - Document ID
   * @param {boolean} loading - Loading state
   */
  const setImageLoading = (docId, loading) => {
    setImgLoading(prev => ({ ...prev, [docId]: loading }));
  };

  /**
   * Handle image error state
   * 
   * @param {number} docId - Document ID
   * @param {boolean} hasError - Error state
   */
  const setImageError = (docId, hasError) => {
    setImgErrors(prev => ({ ...prev, [docId]: hasError }));
  };

  /**
   * Reset all UI state to defaults
   */
  const resetUIState = () => {
    setViewingDocument(null);
    setCurrentView(DEFAULT_VIEW_SETTINGS.CURRENT_VIEW);
    setSidebarVisible(DEFAULT_VIEW_SETTINGS.SIDEBAR_VISIBLE);
    setProfileMenuOpen(false);
    setHoveredCard(null);
    setShowAddModal(false);
    setImgErrors({});
    setImgLoading({});
  };

  return {
    // State
    viewingDocument,
    currentView,
    sidebarVisible,
    profileMenuOpen,
    hoveredCard,
    showAddModal,
    imgErrors,
    imgLoading,
    
    // Refs
    profileMenuRef,
    
    // Actions
    toggleSidebar,
    toggleProfileMenu,
    closeProfileMenu,
    setView,
    setViewType,
    openDocumentViewer,
    closeDocumentViewer,
    openUploadModal,
    closeUploadModal,
    setImageLoading,
    setImageError,
    resetUIState,
    
    // Setters
    setHoveredCard,
    setShowAddModal,
  };
} 