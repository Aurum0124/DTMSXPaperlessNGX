import React, { useState, useRef, useEffect } from 'react';

/**
 * Build phased tracking code suggestions:
 * Phase 1: prefix -> PREFIX- (e.g. "R" -> "RCV-")
 * Phase 2: PREFIX- -> PREFIX-YEAR- (e.g. "RCV-" -> "RCV-2026-")
 * Phase 3: full tracking codes
 */
function buildSuggestions(trackingCodes, term) {
  if (!term || !Array.isArray(trackingCodes)) return [];
  const currentYear = new Date().getFullYear();
  const hasPrefixDash = /^[A-Za-z0-9]+-$/.test(term);
  const hasPrefixYearDash = /^[A-Za-z0-9]+-\d{4}-/.test(term);
  const prefixes = [...new Set(
    trackingCodes.map((tc) => String(tc).split('-')[0]).filter(Boolean)
  )];
  const prefixYearCombos = [...new Set(
    trackingCodes.flatMap((tc) => {
      const m = String(tc).match(/^([A-Za-z0-9]+)-(\d{4})-/);
      return m ? [`${m[1]}-${m[2]}-`] : [];
    })
  )];

  let suggestions = [];
  if (!hasPrefixYearDash) {
    if (!hasPrefixDash) {
      const prefixDashMatches = prefixes
        .filter((p) => p.toLowerCase().startsWith(term) || term === p.toLowerCase())
        .map((p) => `${p}-`)
        .slice(0, 5);
      if (prefixDashMatches.length > 0) {
        suggestions = prefixDashMatches;
      } else {
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
    const fullMatches = trackingCodes.filter((tc) =>
      String(tc).toLowerCase().includes(term)
    ).slice(0, 8);
    suggestions = hasPrefixYearDash ? fullMatches : (suggestions.length ? suggestions : fullMatches);
  }
  return suggestions;
}

/**
 * TrackingCodeInput – input with tracking code suggestions dropdown.
 * @param {string} value
 * @param {(v: string) => void} onChange
 * @param {string[]} trackingCodes – codes to suggest from
 * @param {object} [inputProps] – passed to input (placeholder, disabled, etc.)
 * @param {React.Ref} [inputRef] – ref for the input element
 * @param {boolean} [showSuggestions=true] – if false, no dropdown suggestions
 */
function TrackingCodeInput({ value, onChange, trackingCodes = [], inputProps = {}, inputRef: externalRef = null, showSuggestions = true }) {
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const ref = externalRef || inputRef;

  const term = (value ?? '').trim().toLowerCase();
  const codes = [...new Set(
    trackingCodes
      .map((tc) => (tc && typeof tc === 'object' && tc.tracking_code ? tc.tracking_code : tc))
      .filter((tc) => tc && String(tc).trim() !== '' && tc !== 'No tracking code')
  )].sort();
  const suggestions = term ? buildSuggestions(codes, term) : [];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setSuggestionsOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const prevValueRef = useRef(value);
  useEffect(() => {
    if ((/^[A-Za-z0-9]+-$/.test(value?.trim() ?? '') || /^[A-Za-z0-9]+-\d{4}-/.test(value?.trim() ?? '')) && value !== prevValueRef.current) {
      prevValueRef.current = value;
      setSuggestionsOpen(true);
    } else {
      prevValueRef.current = value;
    }
  }, [value]);

  const selectSuggestion = (code) => {
    onChange(code);
    setHighlightedIndex(-1);
    ref?.current?.focus();
    const isIntermediate = /^[A-Za-z0-9]+-$/.test(code) || /^[A-Za-z0-9]+-\d{4}-$/.test(code);
    setSuggestionsOpen(!!isIntermediate);
  };

  const handleKeyDown = (e) => {
    if (suggestionsOpen && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) => (i < suggestions.length - 1 ? i + 1 : i));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => (i > 0 ? i - 1 : -1));
      } else if (e.key === 'Enter') {
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          e.preventDefault();
          selectSuggestion(suggestions[highlightedIndex]);
        }
        // else let form submit
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSuggestionsOpen(false);
        setHighlightedIndex(-1);
      }
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setSuggestionsOpen(e.target.value.trim().length > 0);
          setHighlightedIndex(-1);
        }}
        onFocus={() => {
          if (value?.trim() && suggestions.length > 0) setSuggestionsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        {...inputProps}
        style={{
          width: '100%',
          padding: '14px 16px',
          fontSize: 16,
          border: '1.5px solid #e2e8f0',
          borderRadius: 10,
          boxSizing: 'border-box',
          outline: 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s',
          ...inputProps.style,
        }}
      />
      {showSuggestions && suggestionsOpen && suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label="Tracking code suggestions"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 6,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            boxShadow: '0 10px 40px rgba(15,23,42,0.12)',
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '8px 14px',
            fontSize: 11,
            fontWeight: 600,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
          }}>
            Suggestions
          </div>
          <ul style={{ margin: 0, padding: 6, listStyle: 'none', maxHeight: 200, overflowY: 'auto' }}>
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
                style={{
                  padding: '10px 14px',
                  fontSize: 15,
                  fontWeight: 500,
                  color: '#0f172a',
                  background: i === highlightedIndex ? '#f1f5f9' : 'transparent',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  fontFamily: 'ui-monospace, "SF Mono", Monaco, Consolas, monospace',
                }}
              >
                {code}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default TrackingCodeInput;
