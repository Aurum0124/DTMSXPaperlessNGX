import React from 'react';
import SidebarSlimToggler from './SidebarSlimToggler.jsx';

/**
 * Sidebar Component
 *
 * Displays the left sidebar navigation with:
 * - Dashboard, Documents, optional Route templates, Archive, Cabinets, Lookup (last)
 * - Smooth animations and hover effects
 */

export const SIDEBAR_EXPANDED = 200;
export const SIDEBAR_COLLAPSED = 56;

function Sidebar({
  sidebarVisible,
  currentView,
  setView,
  toggleSidebar,
  fixedRoutingEnabled = false,
  copyStateFilter = '',
  setCopyStateFilterValue,
  onSelectArchiveDrawer,
  onOpenLookup,
  lookupModalOpen = false,
}) {
  const expanded = sidebarVisible;
  const width = expanded ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED;

  const navItemStyle = (isActive) => ({
    padding: '10px 12px',
    backgroundColor: isActive ? '#f0f7ff' : 'transparent',
    cursor: 'pointer',
    color: isActive ? '#2a5196' : '#495057',
    fontWeight: isActive ? '600' : '500',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '12px',
    transition: 'background-color 0.2s ease, color 0.2s ease',
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
    borderRadius: 8,
  });

  return (
    <>
      <SidebarSlimToggler expanded={expanded} onClick={toggleSidebar} sidebarWidth={width} />
    <div style={{ 
      width,
      backgroundColor: '#fff', 
      borderRight: '1px solid rgba(0,0,0,0.06)',
      padding: 0,
      transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'fixed',
      left: 0,
      top: '80px',
      bottom: '56px',
      zIndex: 100,
      overflow: 'hidden',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <nav className="sidebar-nav" style={{ padding: 0, flex: 1, overflowY: 'auto' }}>
        <div 
          onClick={() => setView('dashboard')}
          style={navItemStyle(currentView === 'dashboard')}
          onMouseEnter={(e) => {
            if (currentView !== 'dashboard') e.currentTarget.style.backgroundColor = '#f8f9fa';
          }}
          onMouseLeave={(e) => {
            if (currentView !== 'dashboard') e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <span style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            opacity: expanded ? 1 : 0,
            maxWidth: expanded ? 140 : 0,
            minWidth: 0,
            transition: 'opacity 0.25s ease, max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}>Dashboard</span>
        </div>
        <div 
          onClick={() => setView('documents')}
          style={navItemStyle(currentView === 'documents')}
          onMouseEnter={(e) => {
            if (currentView !== 'documents') e.currentTarget.style.backgroundColor = '#f8f9fa';
          }}
          onMouseLeave={(e) => {
            if (currentView !== 'documents') e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <path d="M14 2v6h6"/>
            <path d="M16 13H8"/>
            <path d="M16 17H8"/>
            <path d="M10 9H8"/>
          </svg>
          <span style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            opacity: expanded ? 1 : 0,
            maxWidth: expanded ? 140 : 0,
            minWidth: 0,
            transition: 'opacity 0.25s ease, max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}>Documents</span>
        </div>
        {expanded && currentView === 'documents' && (
          <div
            style={{
              padding: '6px 12px 12px 44px',
              borderBottom: '1px solid rgba(0,0,0,0.04)',
              marginBottom: 2,
              background: '#fcfdff',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>
              Document Copy
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, lineHeight: 1.35 }}>
              Quickly filter digital vs physical documents.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {[
                { value: '', label: 'All' },
                { value: 'Digital only', label: 'Digital only' },
                { value: 'Digital (physical pending)', label: 'Pending physical' },
                { value: 'Physical', label: 'Physical' },
              ].map((opt) => {
                const active = (copyStateFilter || '') === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setCopyStateFilterValue?.(opt.value)}
                    style={{
                      border: active ? '1px solid #2a5196' : '1px solid #d1d5db',
                      background: active ? '#eaf2ff' : '#fff',
                      color: active ? '#1f4b93' : '#475569',
                      padding: '4px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      lineHeight: 1.2,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {fixedRoutingEnabled && (
          <div 
            onClick={() => setView('templates')}
            style={navItemStyle(currentView === 'templates')}
            onMouseEnter={(e) => {
              if (currentView !== 'templates') e.currentTarget.style.backgroundColor = '#f8f9fa';
            }}
            onMouseLeave={(e) => {
              if (currentView !== 'templates') e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polyline points="4,18 8,12 13,15 18,8 22,11"/>
              <circle cx="4" cy="18" r="2"/>
              <circle cx="8" cy="12" r="2"/>
              <circle cx="13" cy="15" r="2"/>
              <circle cx="18" cy="8" r="2"/>
              <circle cx="22" cy="11" r="2"/>
            </svg>
            <span style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              opacity: expanded ? 1 : 0,
              maxWidth: expanded ? 140 : 0,
              minWidth: 0,
              transition: 'opacity 0.25s ease, max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>Route templates</span>
          </div>
        )}
        <div
          onClick={() => {
            onSelectArchiveDrawer?.(null);
            setView('archive');
          }}
          title={expanded ? undefined : 'Archived documents'}
          style={navItemStyle(currentView === 'archive')}
          onMouseEnter={(e) => {
            if (currentView !== 'archive') e.currentTarget.style.backgroundColor = '#f8f9fa';
          }}
          onMouseLeave={(e) => {
            if (currentView !== 'archive') e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M21 8v13H3V8" />
            <path d="M1 3h22v5H1z" />
            <path d="M10 12h4" />
          </svg>
          <span style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            opacity: expanded ? 1 : 0,
            maxWidth: expanded ? 140 : 0,
            minWidth: 0,
            transition: 'opacity 0.25s ease, max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}>Archive</span>
        </div>
        <div
          onClick={() => setView('cabinets')}
          title={expanded ? undefined : 'Cabinets and drawers'}
          style={navItemStyle(currentView === 'cabinets')}
          onMouseEnter={(e) => {
            if (currentView !== 'cabinets') e.currentTarget.style.backgroundColor = '#f8f9fa';
          }}
          onMouseLeave={(e) => {
            if (currentView !== 'cabinets') e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <rect x="3" y="3" width="7" height="18" rx="1" />
            <rect x="14" y="3" width="7" height="18" rx="1" />
            <line x1="6" y1="8" x2="6" y2="8.01" />
            <line x1="17" y1="8" x2="17" y2="8.01" />
          </svg>
          <span style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            opacity: expanded ? 1 : 0,
            maxWidth: expanded ? 140 : 0,
            minWidth: 0,
            transition: 'opacity 0.25s ease, max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}>Cabinets</span>
        </div>
        <div
          onClick={() => (onOpenLookup ? onOpenLookup() : setView('tracker'))}
          style={navItemStyle(lookupModalOpen || (!onOpenLookup && currentView === 'tracker'))}
          onMouseEnter={(e) => {
            if (!lookupModalOpen && currentView !== 'tracker') e.currentTarget.style.backgroundColor = '#f8f9fa';
          }}
          onMouseLeave={(e) => {
            if (!lookupModalOpen && currentView !== 'tracker') e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <span style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            opacity: expanded ? 1 : 0,
            maxWidth: expanded ? 140 : 0,
            minWidth: 0,
            transition: 'opacity 0.25s ease, max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}>Lookup</span>
        </div>
      </nav>
    </div>
    </>
  );
}

export default Sidebar; 