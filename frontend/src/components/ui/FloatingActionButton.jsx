import React, { useState, useRef, useEffect } from 'react';

const COLORS = {
  primary: '#2a5196',
  primaryHover: '#1e3a8a',
  receive: '#059669',
  receiveHover: '#047857',
  release: '#d97706',
  releaseHover: '#b45309',
};

/**
 * FloatingActionButton Component
 *
 * Speed-dial FAB: primary Add button expands to show Receive and Release.
 * Larger touch targets, color-coded actions, smooth animation.
 * Only shows on documents view.
 */
function FloatingActionButton({
  currentView,
  onClick,
  onReceiveClick,
  onReleaseClick,
  canUpload = true,
}) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setExpanded(false);
      }
    };
    if (expanded) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expanded]);

  if (currentView !== 'documents') return null;

  const handleReceive = () => {
    (onReceiveClick || (() => {}))();
    setExpanded(false);
  };
  const handleRelease = () => {
    (onReleaseClick || (() => {}))();
    setExpanded(false);
  };
  const handleAdd = () => {
    onClick();
    setExpanded(false);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        right: 20,
        bottom: 64,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 12,
        zIndex: 1201,
      }}
    >
      {/* Add Document - expands from top */}
      {canUpload && (
        <button
          onClick={handleAdd}
          aria-label="Add Document"
          title="Add Document"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            height: 48,
            padding: '0 18px',
            borderRadius: 24,
            border: 'none',
            fontSize: 14,
            fontWeight: 600,
            color: '#fff',
            background: COLORS.primary,
            boxShadow: '0 4px 12px rgba(42,81,150,0.35)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            opacity: expanded ? 1 : 0,
            transform: expanded ? 'scale(1)' : 'scale(0.8)',
            pointerEvents: expanded ? 'auto' : 'none',
            transition: 'opacity 0.2s, transform 0.2s, background 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = COLORS.primaryHover;
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(42,81,150,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = COLORS.primary;
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(42,81,150,0.35)';
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Document
        </button>
      )}
      {/* Receive - expands from top */}
      <button
        onClick={handleReceive}
        aria-label="Receive Document"
        title="Receive Document"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 48,
          padding: '0 18px',
          borderRadius: 24,
          border: 'none',
          fontSize: 14,
          fontWeight: 600,
          color: '#fff',
          background: COLORS.receive,
          boxShadow: '0 4px 12px rgba(5,150,105,0.35)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          opacity: expanded ? 1 : 0,
          transform: expanded ? 'scale(1)' : 'scale(0.8)',
          pointerEvents: expanded ? 'auto' : 'none',
          transition: 'opacity 0.2s, transform 0.2s, background 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = COLORS.receiveHover;
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(5,150,105,0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = COLORS.receive;
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(5,150,105,0.35)';
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Receive
      </button>
      {/* Release - expands from top */}
      <button
        onClick={handleRelease}
        aria-label="Release Document"
        title="Release Document"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 48,
          padding: '0 18px',
          borderRadius: 24,
          border: 'none',
          fontSize: 14,
          fontWeight: 600,
          color: '#fff',
          background: COLORS.release,
          boxShadow: '0 4px 12px rgba(217,119,6,0.35)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          opacity: expanded ? 1 : 0,
          transform: expanded ? 'scale(1)' : 'scale(0.8)',
          pointerEvents: expanded ? 'auto' : 'none',
          transition: 'opacity 0.2s, transform 0.2s, background 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = COLORS.releaseHover;
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(217,119,6,0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = COLORS.release;
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(217,119,6,0.35)';
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        Release
      </button>
      {/* Primary FAB - Toggle menu */}
      <button
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = COLORS.primaryHover;
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(42,81,150,0.4)';
          e.currentTarget.style.transform = expanded ? 'rotate(45deg) scale(1.02)' : 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = COLORS.primary;
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(42,81,150,0.35)';
          e.currentTarget.style.transform = expanded ? 'rotate(45deg)' : 'scale(1)';
        }}
        aria-label={expanded ? 'Close menu' : 'Open actions'}
        aria-expanded={expanded}
        title={expanded ? 'Close' : 'Actions'}
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          background: COLORS.primary,
          color: '#fff',
          boxShadow: '0 4px 16px rgba(42,81,150,0.35)',
          transform: expanded ? 'rotate(45deg)' : 'scale(1)',
          transition: 'transform 0.25s ease, background 0.2s, box-shadow 0.2s',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}

export default FloatingActionButton; 