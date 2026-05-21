import React, { useState } from 'react';

const BRAND = '#2a5196';

const MD = {
  padding: '12px 24px',
  fontSize: 16,
  fontWeight: 600,
  borderRadius: 6,
};

const SM = {
  padding: '10px 16px',
  fontSize: 15,
  fontWeight: 600,
  borderRadius: 6,
};

/** Document viewer toolbar: white background, blue label/icons (outline style). */
function ViewerToolbarButton({
  size = 'md',
  children,
  icon,
  trailing,
  disabled = false,
  style: styleProp,
  className = '',
  ...rest
}) {
  const [hover, setHover] = useState(false);

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
    ...(size === 'sm' ? SM : MD),
    ...(disabled
      ? {
          color: '#94a3b8',
          background: '#f8fafc',
          border: '1px solid #e5e7eb',
        }
      : {
          color: BRAND,
          background: hover ? '#f0f5fc' : '#fff',
          border: `1px solid ${BRAND}`,
        }),
  };

  return (
    <button
      type="button"
      disabled={disabled}
      className={`viewer-toolbar-btn ${className}`.trim()}
      style={{ ...base, ...styleProp }}
      onMouseEnter={() => !disabled && setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...rest}
    >
      {icon ? <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span> : null}
      {children}
      {trailing ? <span style={{ display: 'inline-flex', flexShrink: 0 }}>{trailing}</span> : null}
    </button>
  );
}

export default ViewerToolbarButton;
