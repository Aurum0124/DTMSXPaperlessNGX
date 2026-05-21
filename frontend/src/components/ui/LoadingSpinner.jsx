import React from 'react';

/**
 * LoadingSpinner Component
 * 
 * A reusable loading spinner with customizable:
 * - Size
 * - Color
 * - Text
 * - Overlay background
 */

function LoadingSpinner({ 
  size = 48, 
  color = '#2a5196', 
  text = 'Loading...', 
  showOverlay = true,
  overlayOpacity = 0.18,
  compact = false,
}) {
  const spinnerStyle = {
    width: size,
    height: size,
    border: `${Math.max(4, size / 12)}px solid #e3e7ef`,
    borderTop: `${Math.max(4, size / 12)}px solid ${color}`,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  };

  if (showOverlay) {
    return (
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        background: `rgba(0,0,0,${overlayOpacity})`, 
        zIndex: 9999, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div style={{ 
          background: '#fff', 
          borderRadius: 10, 
          padding: '32px 40px', 
          boxShadow: '0 4px 24px rgba(42,81,150,0.18)', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center' 
        }}>
          <div className="spinner" style={spinnerStyle} />
          {text && (
            <div style={{ 
              color: color, 
              fontWeight: 600, 
              fontSize: Math.max(14, size / 3.5),
              marginTop: 18 
            }}>
              {text}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      minHeight: compact ? 0 : 'calc(100vh - 200px)',
      width: '100%'
    }}>
      <div className="spinner" style={spinnerStyle} />
      {text && (
        <div style={{ 
          color: color, 
          fontWeight: 600, 
          fontSize: Math.max(14, size / 3.5),
          marginTop: 18 
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

export default LoadingSpinner; 