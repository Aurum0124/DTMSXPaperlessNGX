import React from 'react';

const BG = 'rgba(255,255,255,0.45)';
const BG_HOVER = 'rgba(248,249,250,0.72)';
const BORDER = '1px solid rgba(233,236,239,0.55)';
const SHADOW = '0 2px 8px rgba(0,0,0,0.05)';
const SHADOW_HOVER = '0 3px 12px rgba(0,0,0,0.09)';

/**
 * Slim sidebar edge control — frosted white style with bi-chevron-double-left
 * (mirrored when collapsed to read as expand).
 */
function SidebarSlimToggler({ expanded, onClick, sidebarWidth, top = 90 }) {
  return (
    <button
      type="button"
      className="sidebar-slim-toggler"
      onClick={onClick}
      aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
      style={{
        position: 'fixed',
        left: sidebarWidth - 15,
        top,
        width: 30,
        height: 28,
        padding: 0,
        margin: 0,
        backgroundColor: BG,
        border: BORDER,
        borderLeft: 'none',
        borderRadius: 4,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        color: '#1f2937',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: SHADOW,
        zIndex: 2000,
        fontSize: 16,
        lineHeight: 1,
        transition: 'left 0.35s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = BG_HOVER;
        e.currentTarget.style.boxShadow = SHADOW_HOVER;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = BG;
        e.currentTarget.style.boxShadow = SHADOW;
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="0.9em"
        height="0.9em"
        fill="currentColor"
        className="bi bi-chevron-double-left"
        viewBox="0 0 16 16"
        aria-hidden
        style={{
          display: 'block',
          transform: expanded ? 'none' : 'scaleX(-1)',
          transition: 'transform 0.2s ease',
        }}
      >
        <path
          fillRule="evenodd"
          d="M8.354 1.646a.5.5 0 0 1 0 .708L2.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"
        />
        <path
          fillRule="evenodd"
          d="M12.354 1.646a.5.5 0 0 1 0 .708L6.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"
        />
      </svg>
    </button>
  );
}

export default SidebarSlimToggler;
