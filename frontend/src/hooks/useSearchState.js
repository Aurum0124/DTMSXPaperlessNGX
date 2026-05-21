/**
 * useSearchState Hook
 * 
 * Manages search and filter state including tracking code search, status filters, 
 * and view type selection.
 */

import { useState, useCallback } from 'react';
import { VIEW_TYPES, DEFAULT_VIEW_SETTINGS, DOCUMENT_STATUSES } from '../constants/index.js';
import { documentMatchesDateRange } from '../utils/dateRangeFilter.js';

export const SEARCH_TYPES = {
  TRACKING_CODE: 'tracking_code',
  CONTENTS: 'contents',
  TITLE: 'title',
  CORRESPONDENT: 'correspondent',
};

export function useSearchState() {
  // Search and Filter State
  const [searchTerm, setSearchTermState] = useState('');
  const [searchType, setSearchType] = useState(SEARCH_TYPES.TRACKING_CODE);
  const [viewType, setViewType] = useState(DEFAULT_VIEW_SETTINGS.VIEW_TYPE);
  const [statusFilter, setStatusFilter] = useState('');
  const [copyStateFilter, setCopyStateFilter] = useState('');
  const [documentTypeFilter, setDocumentTypeFilterState] = useState('');
  const [dateFrom, setDateFromState] = useState('');
  const [dateTo, setDateToState] = useState('');

  /**
   * Filter documents based on search criteria
   * 
   * @param {Array} documents - Array of documents to filter
   * @returns {Array} Filtered documents
   */
  const filterDocuments = useCallback((documents) => {
      if (!Array.isArray(documents)) return [];
      
      return documents.filter(doc => {
        // Content & Title: filtered server-side via Paperless query. Tracking code & correspondent: client-side.
        const term = (searchTerm || '').toLowerCase();
        let matchesSearch = true;
        if (term) {
          if (searchType === SEARCH_TYPES.CONTENTS || searchType === SEARCH_TYPES.TITLE) {
            matchesSearch = true;
          } else if (searchType === SEARCH_TYPES.CORRESPONDENT) {
            const submittedBy = String(doc.submittedBy ?? '').trim().toLowerCase();
            matchesSearch = submittedBy.includes(term);
          } else {
            matchesSearch = Boolean(doc.trackingCode && doc.trackingCode.toLowerCase().includes(term));
          }
        }
        
        // Filter by status
        const matchesStatus = !statusFilter || doc.status === statusFilter;
        const matchesCopyState =
          !copyStateFilter ||
          String(doc.copyState ?? '').trim() === String(copyStateFilter).trim();

        // Filter by document type
        const docTypeId = doc.documentTypeId != null ? String(doc.documentTypeId) : '';
        const matchesDocumentType = !documentTypeFilter || docTypeId === documentTypeFilter;

        const docDate = doc.added || doc.created;
        const matchesDate = documentMatchesDateRange(docDate, dateFrom, dateTo);
        
        return matchesSearch && matchesStatus && matchesCopyState && matchesDocumentType && matchesDate;
      });
  }, [searchTerm, searchType, statusFilter, copyStateFilter, documentTypeFilter, dateFrom, dateTo]);

  /**
   * Clear all search and filter state
   */
  const clearSearchState = () => {
    setSearchTermState('');
    setStatusFilter('');
    setCopyStateFilter('');
    setDocumentTypeFilterState('');
    setDateFromState('');
    setDateToState('');
    setViewType(DEFAULT_VIEW_SETTINGS.VIEW_TYPE);
  };

  /**
   * Set search term
   * 
   * @param {string} term - Search term
   */
  const setSearchTerm = (term) => {
    setSearchTermState(term);
  };

  /**
   * Set status filter
   * 
   * @param {string} status - Status to filter by
   */
  const setStatusFilterValue = (status) => {
    setStatusFilter(status);
  };

  const setCopyStateFilterValue = (copyState) => {
    setCopyStateFilter(copyState);
  };

  const setDateFrom = (value) => {
    setDateFromState(value || '');
  };

  const setDateTo = (value) => {
    setDateToState(value || '');
  };

  /**
   * Set view type
   * 
   * @param {string} type - View type ('grid', 'list', or 'oneline')
   */
  const setViewTypeValue = (type) => {
    if (type === VIEW_TYPES.GRID || type === VIEW_TYPES.LIST || type === VIEW_TYPES.ONELINE) {
      setViewType(type);
    }
  };

  /**
   * Get available status options for filtering
   * 
   * @returns {Array} Array of status options
   */
  const getStatusOptions = () => {
    return [
      { value: '', label: 'All Status' },
      { value: DOCUMENT_STATUSES.UNDER_REVIEW, label: DOCUMENT_STATUSES.UNDER_REVIEW },
      { value: DOCUMENT_STATUSES.NEEDS_ACTION, label: DOCUMENT_STATUSES.NEEDS_ACTION },
      { value: DOCUMENT_STATUSES.APPROVED, label: DOCUMENT_STATUSES.APPROVED },
      { value: DOCUMENT_STATUSES.REJECTED, label: DOCUMENT_STATUSES.REJECTED },
      { value: DOCUMENT_STATUSES.FOR_ARCHIVING, label: DOCUMENT_STATUSES.FOR_ARCHIVING },
      { value: DOCUMENT_STATUSES.ARCHIVED, label: DOCUMENT_STATUSES.ARCHIVED },
    ];
  };

  /**
   * Get search statistics
   * 
   * @param {Array} documents - Array of documents
   * @returns {Object} Search statistics
   */
  const getSearchStats = (documents) => {
    const total = documents?.length || 0;
    const filtered = filterDocuments(documents).length;
    
    return {
      total,
      filtered,
      hasFilters: searchTerm || statusFilter || copyStateFilter || documentTypeFilter || dateFrom || dateTo,
      searchTerm,
      statusFilter,
      copyStateFilter,
      documentTypeFilter,
    };
  };

  const setDocumentTypeFilterValue = (value) => {
    setDocumentTypeFilterState(value === null || value === undefined ? '' : String(value));
  };

  return {
    // State
    searchTerm,
    searchType,
    viewType,
    statusFilter,
    copyStateFilter,
    documentTypeFilter,
    dateFrom,
    dateTo,
    trackingCodeSearch: searchTerm, // backward compat
    
    // Computed values
    filterDocuments,
    
    // Actions
    setSearchTerm,
    setSearchType,
    setStatusFilterValue,
    setCopyStateFilterValue,
    setDocumentTypeFilterValue,
    setDateFrom,
    setDateTo,
    setViewTypeValue,
    clearSearchState,
    
    // Utilities
    getStatusOptions,
    getSearchStats,
    
    // Setters (for backward compatibility)
    setViewType,
    setStatusFilter,
    setCopyStateFilter,
  };
} 