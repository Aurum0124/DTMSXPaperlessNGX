import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { apiCall } from '../../services/api.js';
import { API_ENDPOINTS } from '../../constants/apiEndpoints.js';
import { VIEW_TYPES, COLORS, BORDER_RADIUS, TRANSITIONS, DOCUMENT_STATUSES } from '../../constants/index.js';
import { SEARCH_TYPES } from '../../hooks/useSearchState.js';

const SEARCH_TYPE_LABELS = {
  [SEARCH_TYPES.TRACKING_CODE]: 'Tracking Code',
  [SEARCH_TYPES.CONTENTS]: 'Content',
  [SEARCH_TYPES.TITLE]: 'Title',
  [SEARCH_TYPES.CORRESPONDENT]: 'Correspondent',
};

const STATUS_FILTER_OPTIONS = [
  DOCUMENT_STATUSES.UNDER_REVIEW,
  DOCUMENT_STATUSES.NEEDS_ACTION,
  DOCUMENT_STATUSES.APPROVED,
  DOCUMENT_STATUSES.REJECTED,
  DOCUMENT_STATUSES.FOR_ARCHIVING,
  DOCUMENT_STATUSES.ARCHIVED,
];

/**
 * SearchAndFilterBar Component
 * 
 * Handles document search and filtering with:
 * - Search type dropdown (Tracking Code / Title)
 * - Search input
 * - Status filter
 * - View type switcher (grid/list)
 */

function SearchAndFilterBar({
  searchTerm,
  searchType,
  statusFilter,
  documentTypeFilter,
  dateFrom,
  dateTo,
  viewType,
  onSearchChange,
  onSearchTypeChange,
  onSearchSubmit,
  onStatusFilterChange,
  onDocumentTypeFilterChange,
  onDateFromChange,
  onDateToChange,
  onViewTypeChange,
  onRefresh,
  files = [],
  statusFilterOptions = STATUS_FILTER_OPTIONS,
}) {
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [documentTypes, setDocumentTypes] = useState([]);

  const correspondentOptions = useMemo(() => {
    const names = new Set();
    for (const f of files) {
      const name = String(f.submittedBy ?? '').trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [files]);
  const [suggestionsPosition, setSuggestionsPosition] = useState({ top: 0, left: 0, width: 0 });
  const [contentSuggestions, setContentSuggestions] = useState([]);
  const [contentSuggestionsOpen, setContentSuggestionsOpen] = useState(false);
  const [contentHighlightedIndex, setContentHighlightedIndex] = useState(-1);
  const suggestionsRef = useRef(null);
  const inputRef = useRef(null);
  const contentAutocompleteTimerRef = useRef(null);
  const contentAutocompleteAbortRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    apiCall(API_ENDPOINTS.DOCUMENT_TYPES)
      .then((data) => {
        if (cancelled) return;
        const results = data?.results ?? (Array.isArray(data) ? data : []);
        setDocumentTypes(results.map((t) => ({ id: t.id ?? t.pk, name: t.name ?? t.slug ?? '' })).filter((t) => t.name));
      })
      .catch(() => { if (!cancelled) setDocumentTypes([]); });
    return () => { cancelled = true; };
  }, []);

  // Paperless content search autocomplete (debounced)
  useEffect(() => {
    if (searchType !== SEARCH_TYPES.CONTENTS) {
      setContentSuggestions([]);
      setContentSuggestionsOpen(false);
      setContentHighlightedIndex(-1);
      if (contentAutocompleteTimerRef.current) {
        clearTimeout(contentAutocompleteTimerRef.current);
        contentAutocompleteTimerRef.current = null;
      }
      if (contentAutocompleteAbortRef.current) {
        contentAutocompleteAbortRef.current.abort();
        contentAutocompleteAbortRef.current = null;
      }
      return;
    }
    const raw = (searchTerm ?? '').trim();
    if (raw.length === 0) {
      setContentSuggestions([]);
      setContentSuggestionsOpen(false);
      setContentHighlightedIndex(-1);
      return;
    }
    if (contentAutocompleteTimerRef.current) clearTimeout(contentAutocompleteTimerRef.current);
    contentAutocompleteTimerRef.current = setTimeout(() => {
      contentAutocompleteTimerRef.current = null;
      if (contentAutocompleteAbortRef.current) {
        contentAutocompleteAbortRef.current.abort();
      }
      contentAutocompleteAbortRef.current = new AbortController();
      const signal = contentAutocompleteAbortRef.current.signal;
      setContentSuggestions([]);
      setContentSuggestionsOpen(false);
      const url = `${API_ENDPOINTS.SEARCH_AUTOCOMPLETE}?term=${encodeURIComponent(raw)}&limit=10`;
      apiCall(url, { signal })
        .then((data) => {
          if (Array.isArray(data)) {
            setContentSuggestions(data.filter(Boolean).map(String).slice(0, 10));
          } else {
            setContentSuggestions([]);
          }
          setContentSuggestionsOpen(true);
          setContentHighlightedIndex(-1);
        })
        .catch(() => {
          setContentSuggestions([]);
          setContentSuggestionsOpen(false);
        })
        .finally(() => {
          contentAutocompleteAbortRef.current = null;
        });
    }, 300);
    return () => {
      if (contentAutocompleteTimerRef.current) {
        clearTimeout(contentAutocompleteTimerRef.current);
        contentAutocompleteTimerRef.current = null;
      }
      if (contentAutocompleteAbortRef.current) {
        contentAutocompleteAbortRef.current.abort();
        contentAutocompleteAbortRef.current = null;
      }
    };
  }, [searchType, searchTerm]);

  // Tracking code suggestions (unique, non-empty) from files
  const trackingCodes = [...new Set(
    files
      .map((f) => f.trackingCode)
      .filter((tc) => tc && String(tc).trim() !== '' && tc !== 'No tracking code')
  )].sort();

  const currentYear = new Date().getFullYear();
  const term = (searchTerm ?? '').trim().toLowerCase();

  // Phase 1: typing prefix -> suggest "PREFIX-" (e.g. "R" -> "RCV-")
  // Phase 2: have "PREFIX-" -> suggest "PREFIX-YEAR-" (e.g. "RCV-" -> "RCV-2026-")
  // Phase 3: have "PREFIX-YEAR-" -> suggest full tracking codes
  const hasPrefixDash = /^[A-Za-z0-9]+-$/.test(searchTerm?.trim() ?? '');
  const hasPrefixYearDash = /^[A-Za-z0-9]+-\d{4}-/.test(searchTerm?.trim() ?? '');
  const prefixes = [...new Set(
    trackingCodes.map((tc) => String(tc).split('-')[0]).filter(Boolean)
  )];

  // Build prefix-year- combos from actual codes (e.g. RCV-2025-, RCV-2026-)
  const prefixYearCombos = [...new Set(
    trackingCodes.flatMap((tc) => {
      const m = String(tc).match(/^([A-Za-z0-9]+)-(\d{4})-/);
      return m ? [`${m[1]}-${m[2]}-`] : [];
    })
  )];

  let suggestions = [];
  if (searchType === SEARCH_TYPES.TRACKING_CODE && term) {
    if (!hasPrefixYearDash) {
      if (!hasPrefixDash) {
        // Phase 1: typing prefix chars -> first suggest "PREFIX-" (e.g. "R" -> "RCV-")
        const prefixDashMatches = prefixes
          .filter((p) => p.toLowerCase().startsWith(term) || term === p.toLowerCase())
          .map((p) => `${p}-`)
          .slice(0, 5);
        if (prefixDashMatches.length > 0) {
          suggestions = prefixDashMatches;
        } else {
          // Fallback: suggest PREFIX-YEAR- if no prefix match
          const comboMatches = prefixYearCombos.filter((combo) => {
            const prefix = combo.split('-')[0];
            return prefix.toLowerCase().startsWith(term) || term === prefix.toLowerCase();
          }).slice(0, 5);
          if (comboMatches.length > 0) {
            suggestions = comboMatches;
          } else {
            for (const prefix of prefixes) {
              if (prefix.toLowerCase().startsWith(term) || term === prefix.toLowerCase()) {
                suggestions = [`${prefix}-${currentYear}-`];
                break;
              }
            }
          }
        }
      } else {
        // Phase 2: have "PREFIX-" -> suggest "PREFIX-YEAR-" (e.g. "RCV-" -> "RCV-2026-")
        const prefixPart = term.replace(/-$/, '');
        const yearMatches = prefixYearCombos
          .filter((combo) => combo.toLowerCase().startsWith(prefixPart + '-'))
          .slice(0, 5);
        if (yearMatches.length > 0) {
          suggestions = yearMatches;
        } else {
          const match = prefixes.find((p) => p.toLowerCase() === prefixPart);
          if (match) suggestions = [`${match}-${currentYear}-`];
        }
      }
    }
    if (hasPrefixYearDash || suggestions.length === 0) {
      // Phase 3: full tracking codes
      const fullMatches = trackingCodes.filter((tc) =>
        String(tc).toLowerCase().includes(term)
      ).slice(0, 8);
      suggestions = hasPrefixYearDash ? fullMatches : (suggestions.length ? suggestions : fullMatches);
    }
  } else if (searchType === SEARCH_TYPES.CORRESPONDENT && term) {
    suggestions = correspondentOptions
      .filter((name) => name.toLowerCase().includes(term))
      .slice(0, 8);
  }

  const updateSuggestionsPosition = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setSuggestionsPosition({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }
  };

  useLayoutEffect(() => {
    const showTracking =
      (searchType === SEARCH_TYPES.TRACKING_CODE || searchType === SEARCH_TYPES.CORRESPONDENT) &&
      suggestionsOpen &&
      suggestions.length > 0;
    const showContent = searchType === SEARCH_TYPES.CONTENTS && contentSuggestionsOpen && contentSuggestions.length > 0;
    if (showTracking || showContent) {
      updateSuggestionsPosition();
      const onScrollOrResize = () => updateSuggestionsPosition();
      window.addEventListener('scroll', onScrollOrResize, true);
      window.addEventListener('resize', onScrollOrResize);
      return () => {
        window.removeEventListener('scroll', onScrollOrResize, true);
        window.removeEventListener('resize', onScrollOrResize);
      };
    }
  }, [searchType, suggestionsOpen, suggestions.length, contentSuggestionsOpen, contentSuggestions.length]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      const inInput = suggestionsRef.current && suggestionsRef.current.contains(e.target);
      const inTrackingList = e.target.closest('[data-tracking-suggestions-list]');
      const inContentList = e.target.closest('[data-content-suggestions-list]');
      if (!inInput && !inTrackingList) setSuggestionsOpen(false);
      if (!inInput && !inContentList) setContentSuggestionsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keep dropdown open when searchTerm becomes "PREFIX-" or "PREFIX-YEAR-" (e.g. after selecting "RCV-" or "RCV-2026-")
  const prevSearchTermRef = useRef(searchTerm);
  useEffect(() => {
    if (
      searchType === SEARCH_TYPES.TRACKING_CODE &&
      (/^[A-Za-z0-9]+-$/.test(searchTerm?.trim() ?? '') || /^[A-Za-z0-9]+-\d{4}-/.test(searchTerm?.trim() ?? '')) &&
      searchTerm !== prevSearchTermRef.current
    ) {
      prevSearchTermRef.current = searchTerm;
      setSuggestionsOpen(true);
    } else {
      prevSearchTermRef.current = searchTerm;
    }
  }, [searchTerm, searchType]);

  const selectSuggestion = (code) => {
    onSearchChange(code);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
    // Keep open for "PREFIX-" or "PREFIX-YEAR-" so next suggestions appear; close for full codes
    const isIntermediate = /^[A-Za-z0-9]+-$/.test(code) || /^[A-Za-z0-9]+-\d{4}-$/.test(code);
    if (isIntermediate) {
      setTimeout(() => setSuggestionsOpen(true), 0);
    } else {
      setSuggestionsOpen(false);
    }
  };

  const selectContentSuggestion = (contentTerm) => {
    const current = (searchTerm ?? '').trim();
    let newValue = contentTerm;
    if (current.length > 0) {
      const lastSpace = current.lastIndexOf(' ');
      if (lastSpace >= 0) {
        newValue = current.slice(0, lastSpace + 1) + contentTerm;
      }
    }
    onSearchChange(newValue);
    setContentSuggestionsOpen(false);
    setContentHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const filterControlStyle = {
    padding: '8px 12px',
    fontSize: 14,
    fontWeight: 600,
    color: '#2a5196',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: BORDER_RADIUS.MD,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    transition: `border-color ${TRANSITIONS.FAST}, box-shadow ${TRANSITIONS.FAST}`,
    fontFamily: 'inherit',
  };

  const dropdownOptionStyle = (selected) => ({
    display: 'block',
    width: '100%',
    padding: '10px 14px',
    fontSize: 14,
    fontWeight: selected ? 600 : 500,
    color: selected ? '#2a5196' : '#374151',
    background: selected ? '#f1f5f9' : 'transparent',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    transition: `background ${TRANSITIONS.FAST}`,
    fontFamily: 'inherit',
  });

  return (
    <div className="search-filter-bar" style={{
      flexShrink: 0,
      background: '#f8fafc',
      borderRadius: BORDER_RADIUS.LG,
      padding: '16px',
      marginBottom: 20,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      border: '1px solid rgba(0,0,0,0.04)',
      display: 'flex',
      flexWrap: 'nowrap',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      minWidth: 0,
      overflowX: 'hidden',
      overflowY: 'visible',
      boxSizing: 'border-box',
    }}>
      {/* Search type dropdown - fixed width to prevent layout shift */}
      <select
        value={searchType}
        onChange={e => {
          const v = e.target.value;
          onSearchTypeChange(v);
          onSearchChange('');
        }}
        aria-label="Search by tracking code, title, content, or correspondent"
        style={{
          ...filterControlStyle,
          padding: '9px 14px',
          outline: 'none',
          cursor: 'pointer',
          width: 148,
          minWidth: 148,
          flexShrink: 0,
        }}
      >
        <option value={SEARCH_TYPES.TRACKING_CODE}>{SEARCH_TYPE_LABELS[SEARCH_TYPES.TRACKING_CODE]}</option>
        <option value={SEARCH_TYPES.TITLE}>{SEARCH_TYPE_LABELS[SEARCH_TYPES.TITLE]}</option>
        <option value={SEARCH_TYPES.CONTENTS}>{SEARCH_TYPE_LABELS[SEARCH_TYPES.CONTENTS]}</option>
        <option value={SEARCH_TYPES.CORRESPONDENT}>{SEARCH_TYPE_LABELS[SEARCH_TYPES.CORRESPONDENT]}</option>
      </select>
      
      <div ref={suggestionsRef} style={{ position: 'relative', flex: '1 1 0%', minWidth: 100, display: 'flex', overflow: 'hidden' }}>
        <input
          ref={inputRef}
          id="tracking-search"
          type="text"
          autoComplete="off"
          placeholder={
            searchType === SEARCH_TYPES.TRACKING_CODE
              ? 'Search by tracking code...'
              : searchType === SEARCH_TYPES.TITLE
                ? 'Search by title...'
                : searchType === SEARCH_TYPES.CORRESPONDENT
                  ? 'Search by correspondent...'
                  : 'Search by content...'
          }
          value={searchTerm}
          onChange={e => {
            onSearchChange(e.target.value);
            if (searchType === SEARCH_TYPES.TRACKING_CODE || searchType === SEARCH_TYPES.CORRESPONDENT) {
              setSuggestionsOpen(e.target.value.trim().length > 0);
              setHighlightedIndex(-1);
            } else if (searchType === SEARCH_TYPES.CONTENTS) {
              setContentHighlightedIndex(-1);
            }
          }}
          onFocus={() => {
            if (
              (searchType === SEARCH_TYPES.TRACKING_CODE || searchType === SEARCH_TYPES.CORRESPONDENT) &&
              searchTerm.trim() &&
              suggestions.length > 0
            ) {
              setSuggestionsOpen(true);
            }
            if (searchType === SEARCH_TYPES.CONTENTS && searchTerm.trim() && contentSuggestions.length > 0) {
              setContentSuggestionsOpen(true);
            }
          }}
          onKeyDown={e => {
            if (searchType === SEARCH_TYPES.CONTENTS && contentSuggestionsOpen && contentSuggestions.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setContentHighlightedIndex((i) => (i < contentSuggestions.length - 1 ? i + 1 : i));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setContentHighlightedIndex((i) => (i > 0 ? i - 1 : -1));
              } else if (e.key === 'Enter' && contentHighlightedIndex >= 0 && contentSuggestions[contentHighlightedIndex]) {
                e.preventDefault();
                selectContentSuggestion(contentSuggestions[contentHighlightedIndex]);
              } else if (e.key === 'Escape') {
                setContentSuggestionsOpen(false);
                setContentHighlightedIndex(-1);
              }
              return;
            }
            if (
              (searchType === SEARCH_TYPES.TRACKING_CODE || searchType === SEARCH_TYPES.CORRESPONDENT) &&
              suggestionsOpen &&
              suggestions.length > 0
            ) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightedIndex((i) => (i < suggestions.length - 1 ? i + 1 : i));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightedIndex((i) => (i > 0 ? i - 1 : -1));
              } else if (e.key === 'Enter' && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
                e.preventDefault();
                selectSuggestion(suggestions[highlightedIndex]);
              } else if (e.key === 'Escape') {
                setSuggestionsOpen(false);
                setHighlightedIndex(-1);
              }
              return;
            }
            if (
              e.key === 'Enter' &&
              (searchType === SEARCH_TYPES.CONTENTS || searchType === SEARCH_TYPES.TITLE) &&
              onSearchSubmit
            ) {
              e.preventDefault();
              onSearchSubmit();
            }
          }}
          style={{
            ...filterControlStyle,
            padding: '9px 14px',
            outline: 'none',
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            color: '#2a5196',
          }}
        />
        {(searchType === SEARCH_TYPES.TRACKING_CODE || searchType === SEARCH_TYPES.CORRESPONDENT) &&
          suggestionsOpen &&
          suggestions.length > 0 &&
          suggestionsPosition.width > 0 &&
          createPortal(
            <ul
              data-tracking-suggestions-list
              role="listbox"
              aria-label={searchType === SEARCH_TYPES.CORRESPONDENT ? 'Correspondent suggestions' : 'Tracking code suggestions'}
              style={{
                position: 'fixed',
                top: suggestionsPosition.top,
                left: suggestionsPosition.left,
                width: suggestionsPosition.width,
                margin: 0,
                padding: 0,
                listStyle: 'none',
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: BORDER_RADIUS.MD,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                zIndex: 10000,
                maxHeight: 220,
                overflowY: 'auto',
                overflowX: 'hidden',
              }}
            >
              {suggestions.map((code, i) => (
                <li
                  key={code}
                  role="option"
                  aria-selected={i === highlightedIndex}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectSuggestion(code);
                  }}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  style={dropdownOptionStyle(i === highlightedIndex)}
                >
                  {code}
                </li>
              ))}
            </ul>,
            document.body
          )}
        {searchType === SEARCH_TYPES.CONTENTS &&
          contentSuggestionsOpen &&
          contentSuggestions.length > 0 &&
          suggestionsPosition.width > 0 &&
          createPortal(
            <ul
              data-content-suggestions-list
              role="listbox"
              aria-label="Content search suggestions"
              style={{
                position: 'fixed',
                top: suggestionsPosition.top,
                left: suggestionsPosition.left,
                width: suggestionsPosition.width,
                margin: 0,
                padding: 0,
                listStyle: 'none',
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: BORDER_RADIUS.MD,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                zIndex: 10000,
                maxHeight: 220,
                overflowY: 'auto',
                overflowX: 'hidden',
              }}
            >
              {contentSuggestions.map((item, i) => (
                <li
                  key={`${item}-${i}`}
                  role="option"
                  aria-selected={i === contentHighlightedIndex}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectContentSuggestion(item);
                  }}
                  onMouseEnter={() => setContentHighlightedIndex(i)}
                  style={dropdownOptionStyle(i === contentHighlightedIndex)}
                >
                  {item}
                </li>
              ))}
            </ul>,
            document.body
          )}
      </div>
      
      {/* Status Filter - fixed width to prevent layout shift when switching views */}
      <select
        value={statusFilter}
        onChange={e => onStatusFilterChange(e.target.value)}
        aria-label="Filter by status"
        style={{
          ...filterControlStyle,
          padding: '9px 14px',
          outline: 'none',
          cursor: 'pointer',
          width: 140,
          minWidth: 140,
          flexShrink: 0,
        }}
      >
        <option value="">All Status</option>
        {statusFilterOptions.map((st) => (
          <option key={st} value={st}>{st}</option>
        ))}
      </select>

      {/* Document type filter - fixed width so it doesn't move when types load */}
      <select
        value={documentTypeFilter ?? ''}
        onChange={e => onDocumentTypeFilterChange?.(e.target.value)}
        aria-label="Filter by document type"
        style={{
          ...filterControlStyle,
          padding: '9px 14px',
          outline: 'none',
          cursor: 'pointer',
          width: 160,
          minWidth: 160,
          flexShrink: 0,
        }}
      >
        <option value="">All types</option>
        {documentTypes.map((t) => (
          <option key={t.id} value={String(t.id)}>{t.name}</option>
        ))}
      </select>

      {/* Date filter */}
      <span style={{ fontSize: 14, fontWeight: 600, color: '#2a5196', whiteSpace: 'nowrap', flexShrink: 0 }}>From</span>
      <input
        type="date"
        value={dateFrom}
        onChange={e => onDateFromChange?.(e.target.value)}
        aria-label="Filter from date"
        style={{
          ...filterControlStyle,
          padding: '9px 12px',
          outline: 'none',
          width: 130,
          minWidth: 130,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 14, fontWeight: 600, color: '#2a5196', whiteSpace: 'nowrap', flexShrink: 0 }}>To</span>
      <input
        type="date"
        value={dateTo}
        onChange={e => onDateToChange?.(e.target.value)}
        min={dateFrom || undefined}
        aria-label="Filter to date"
        style={{
          ...filterControlStyle,
          padding: '9px 12px',
          outline: 'none',
          width: 130,
          minWidth: 130,
          flexShrink: 0,
        }}
      />
      
      {/* Refresh Button */}
      <button
        type="button"
        aria-label="Refresh documents"
        onClick={() => onRefresh?.()}
        style={{
          background: 'transparent',
          border: '1px solid #e2e8f0',
          borderRadius: BORDER_RADIUS.MD,
          padding: 8,
          marginLeft: 'auto',
          flexShrink: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: `background ${TRANSITIONS.FAST}, border-color ${TRANSITIONS.FAST}`,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#f1f5f9';
          e.currentTarget.style.borderColor = COLORS.PRIMARY;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = '#e2e8f0';
        }}
      >
        {/* Refresh icon */}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path 
            d="M10 3C6.13 3 3 6.13 3 10s3.13 7 7 7c2.76 0 5.13-1.88 5.84-4.43" 
            stroke="#2a5196" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
          <path 
            d="M15 7l-2-2 2-2" 
            stroke="#2a5196" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* View Switcher Icons - stay on same line as header */}
      <div style={{ display: 'flex', gap: 6, marginLeft: 10, flexShrink: 0 }}>
        <button
          type="button"
          aria-label="Grid view"
          onClick={() => onViewTypeChange(VIEW_TYPES.GRID)}
          style={{
            background: viewType === VIEW_TYPES.GRID ? COLORS.PRIMARY : 'transparent',
            border: '1px solid #e2e8f0',
            borderRadius: BORDER_RADIUS.MD,
            padding: 6,
            marginRight: 2,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: `background ${TRANSITIONS.FAST}, border-color ${TRANSITIONS.FAST}`,
          }}
        >
          {/* Grid icon (4 squares) */}
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect x="3" y="3" width="6" height="6" rx="1.5" fill={viewType === 'grid' ? '#fff' : '#2a5196'} />
            <rect x="13" y="3" width="6" height="6" rx="1.5" fill={viewType === 'grid' ? '#fff' : '#2a5196'} />
            <rect x="3" y="13" width="6" height="6" rx="1.5" fill={viewType === 'grid' ? '#fff' : '#2a5196'} />
            <rect x="13" y="13" width="6" height="6" rx="1.5" fill={viewType === 'grid' ? '#fff' : '#2a5196'} />
          </svg>
        </button>
        <button
          type="button"
          aria-label="List view"
          onClick={() => onViewTypeChange(VIEW_TYPES.LIST)}
          style={{
            background: viewType === VIEW_TYPES.LIST ? COLORS.PRIMARY : 'transparent',
            border: '1px solid #e2e8f0',
            borderRadius: BORDER_RADIUS.MD,
            padding: 6,
            marginRight: 2,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: `background ${TRANSITIONS.FAST}, border-color ${TRANSITIONS.FAST}`,
          }}
        >
          {/* List icon (3 lines) */}
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect x="4" y="6" width="14" height="2.5" rx="1.2" fill={viewType === 'list' ? '#fff' : '#2a5196'} />
            <rect x="4" y="10" width="14" height="2.5" rx="1.2" fill={viewType === 'list' ? '#fff' : '#2a5196'} />
            <rect x="4" y="14" width="14" height="2.5" rx="1.2" fill={viewType === 'list' ? '#fff' : '#2a5196'} />
          </svg>
        </button>
        <button
          type="button"
          aria-label="One-line view"
          onClick={() => onViewTypeChange(VIEW_TYPES.ONELINE)}
          style={{
            background: viewType === VIEW_TYPES.ONELINE ? COLORS.PRIMARY : 'transparent',
            border: '1px solid #e2e8f0',
            borderRadius: BORDER_RADIUS.MD,
            padding: 6,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: `background ${TRANSITIONS.FAST}, border-color ${TRANSITIONS.FAST}`,
          }}
        >
          {/* One-line icon (single line with thumbnail) */}
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect x="3" y="8" width="16" height="6" rx="1" fill={viewType === 'oneline' ? '#fff' : '#2a5196'} />
            <rect x="3" y="9" width="3" height="4" rx="0.5" fill={viewType === 'oneline' ? '#2a5196' : '#fff'} />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default SearchAndFilterBar; 