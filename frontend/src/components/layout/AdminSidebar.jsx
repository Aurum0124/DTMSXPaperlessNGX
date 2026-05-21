import React from 'react';
import SidebarSlimToggler from './SidebarSlimToggler.jsx';

/**
 * AdminSidebar Component
 *
 * Sidebar for Admin page - matches Department Sidebar design:
 * - Collapse to icon-only (56px) instead of slide out
 * - Same toggle button style (narrow, « » chevrons)
 * - Offices (dedicated view), Employees, Lookup, Settings
 */

const SIDEBAR_EXPANDED = 200;
const SIDEBAR_COLLAPSED = 56;

function AdminSidebar({ sidebarVisible, currentView, setView, toggleSidebar, onOpenLookup, lookupModalOpen = false }) {
  const expanded = sidebarVisible;
  const width = expanded ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED;

  const navItemStyle = (isActive) => ({
    padding: '10px 12px',
    backgroundColor: isActive ? '#e3f2fd' : 'transparent',
    cursor: 'pointer',
    color: isActive ? '#1976d2' : '#495057',
    fontWeight: isActive ? '600' : '400',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '12px',
    transition: 'background-color 0.2s, color 0.2s',
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
  });

  const labelSpanStyle = {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    opacity: expanded ? 1 : 0,
    maxWidth: expanded ? 140 : 0,
    minWidth: 0,
    transition: 'opacity 0.25s ease, max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
  };

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
        transform: 'translateZ(0)',
      }}>
        <nav className="sidebar-nav" style={{ padding: 0, flex: 1, overflowY: 'auto' }}>
          <div
            onClick={() => setView('overview')}
            style={navItemStyle(currentView === 'overview')}
            onMouseEnter={(e) => {
              if (currentView !== 'overview') e.currentTarget.style.backgroundColor = '#f8f9fa';
            }}
            onMouseLeave={(e) => {
              if (currentView !== 'overview') e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            <span style={labelSpanStyle}>Overview</span>
          </div>

          <div
            onClick={() => setView('offices')}
            style={{
              ...navItemStyle(currentView === 'offices'),
              borderTop: '1px solid #e9ecef',
              marginTop: '4px',
            }}
            onMouseEnter={(e) => {
              if (currentView !== 'offices') e.currentTarget.style.backgroundColor = '#f8f9fa';
            }}
            onMouseLeave={(e) => {
              if (currentView !== 'offices') e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M3 21h18" />
              <path d="M5 21V7l8-4v18" />
              <path d="M19 21V11l-6-4" />
              <path d="M9 9v0" />
              <path d="M9 12v0" />
              <path d="M9 15v0" />
              <path d="M9 18v0" />
            </svg>
            <span style={labelSpanStyle}>Offices</span>
          </div>

          <div
            onClick={() => setView('employees')}
            style={{
              ...navItemStyle(currentView === 'employees'),
              borderTop: '1px solid #e9ecef',
              marginTop: '8px',
            }}
            onMouseEnter={(e) => {
              if (currentView !== 'employees') e.currentTarget.style.backgroundColor = '#f8f9fa';
            }}
            onMouseLeave={(e) => {
              if (currentView !== 'employees') e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span style={labelSpanStyle}>Employees</span>
          </div>

          <div
            onClick={() => (onOpenLookup ? onOpenLookup() : setView('tracker'))}
            style={{
              ...navItemStyle(lookupModalOpen || (!onOpenLookup && currentView === 'tracker')),
              borderTop: '1px solid #e9ecef',
              marginTop: '8px',
              padding: '14px 12px 10px 12px',
            }}
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
            <span style={labelSpanStyle}>Lookup</span>
          </div>

          <div
            onClick={() => setView('settings')}
            style={{
              ...navItemStyle(currentView === 'settings'),
              borderTop: '1px solid #e9ecef',
              marginTop: '8px',
              padding: '14px 12px 10px 12px',
            }}
            onMouseEnter={(e) => {
              if (currentView !== 'settings') e.currentTarget.style.backgroundColor = '#f8f9fa';
            }}
            onMouseLeave={(e) => {
              if (currentView !== 'settings') e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <span style={labelSpanStyle}>Settings</span>
          </div>
        </nav>
      </div>
    </>
  );
}

export default AdminSidebar;
