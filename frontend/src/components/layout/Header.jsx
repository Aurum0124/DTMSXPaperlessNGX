import React, { useEffect, useRef, useState } from 'react';
import { SHADOWS, BORDER_RADIUS, COLORS } from '../../constants/uiConstants.js';
import { apiCall } from '../../services/api.js';
import { API_ENDPOINTS } from '../../constants/apiEndpoints.js';

/**
 * Header Component
 * 
 * Displays the top navigation bar with:
 * - Logo
 * - Department name
 * - Connection status
 * - Profile menu with logout
 */

const MenuItem = ({ icon, label, onClick, danger }) => (
  <button
    type="button"
    style={{
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: 'none',
      border: 'none',
      color: danger ? '#dc2626' : '#64748b',
      fontSize: 14,
      padding: '12px 14px',
      textAlign: 'left',
      cursor: 'pointer',
      fontFamily: 'inherit',
      transition: 'background 0.15s, color 0.15s',
    }}
    onClick={onClick}
    onMouseEnter={e => {
      e.currentTarget.style.background = danger ? '#fef2f2' : '#f3f4f6';
      e.currentTarget.style.color = danger ? '#dc2626' : '#374151';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = danger ? '#dc2626' : '#64748b';
    }}
  >
    {icon}
    {label}
  </button>
);

function Header({
  tagName, 
  tagId,
  onNotificationClick,
  profileMenuOpen, 
  profileMenuRef,
  toggleProfileMenu, 
  closeProfileMenu, 
  logout 
}) {
  const officeLabel = (tagName || 'Admin').replace(/^PGIN - /i, '');
  const initials = officeLabel.slice(0, 2).toUpperCase();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationItems, setNotificationItems] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationsRef = useRef(null);
  const seenKey = tagId ? `dtms_notif_seen_${tagId}` : null;

  useEffect(() => {
    const handleOutside = (e) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target)) {
        setNotificationsOpen(false);
      }
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') setNotificationsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  useEffect(() => {
    if (!tagId) {
      setNotificationItems([]);
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    const loadNotifications = async ({ silent = false } = {}) => {
      if (!silent) {
        setNotificationsLoading(true);
        setNotificationsError(null);
      }
      try {
        const data = await apiCall(`${API_ENDPOINTS.TRANSFERS}?limit=8`);
        if (cancelled) return;
        const transfers = Array.isArray(data?.transfers) ? data.transfers : [];
        setNotificationItems(
          transfers.map((t) => ({
            id: String(t.id ?? `${t.document_id}-${t.created_at}`),
            documentId: t.document_id,
            trackingCode: t.tracking_code || 'Unknown code',
            type: String(t.type || ''),
            digitalMode: t.digital_mode ? String(t.digital_mode) : null,
            wrongOffice: !!t.received_at_wrong_office,
            at: t.created_at,
          }))
        );
        const seenAtRaw = seenKey ? localStorage.getItem(seenKey) : null;
        const seenAt = seenAtRaw ? new Date(seenAtRaw).getTime() : 0;
        const unread = transfers.filter((t) => {
          const ts = new Date(t.created_at ?? '').getTime();
          return Number.isFinite(ts) && ts > seenAt;
        }).length;
        setUnreadCount(unread);
      } catch (err) {
        if (!cancelled) {
          // Silent polling should not interrupt the current dropdown content.
          if (!silent) {
            setNotificationsError(err?.message || 'Could not load notifications');
            setNotificationItems([]);
            setUnreadCount(0);
          }
        }
      } finally {
        if (!cancelled && !silent) setNotificationsLoading(false);
      }
    };

    loadNotifications({ silent: false });
    const pollId = window.setInterval(() => {
      loadNotifications({ silent: true });
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [tagId, seenKey]);

  useEffect(() => {
    if (!notificationsOpen || !tagId || !seenKey) return;
    const latest = notificationItems[0]?.at;
    if (latest) localStorage.setItem(seenKey, latest);
    setUnreadCount(0);
  }, [notificationsOpen, tagId, seenKey, notificationItems]);

  const formatNotifTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="bg-bar top app-header-bar" style={{ fontFamily: 'Roboto Condensed, Arial, sans-serif' }}>
      <div className="app-header-inner app-header-inner-flush" style={{
        display: 'flex',
        alignItems: 'center',
        height: '100%'
      }}>
        {/* Logos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img 
            src="/assets/logo.png" 
            alt="PGIN Logo" 
            style={{ height: '60px', width: 'auto' }}
          />
          <img 
            src="/assets/Bagong%20Pilipinas.png" 
            alt="Bagong Pilipinas" 
            style={{ height: '60px', width: 'auto' }}
          />
        </div>
        
        {/* Department Name - compressed, high-intensity Bebas Neue style */}
        <div style={{
          color: '#fff',
          fontSize: 'clamp(1.6rem, 5.5vw, 2.9rem)',
          letterSpacing: '-0.02em',
          fontFamily: '"Bebas Neue", "Roboto Condensed", Arial, sans-serif',
          textTransform: 'uppercase',
          textShadow: '0 1px 2px rgba(0,0,0,0.4), 0 3px 8px rgba(0,0,0,0.35)',
          fontWeight: 700,
          WebkitFontSmoothing: 'antialiased',
          lineHeight: 0.95,
        }}>
          {officeLabel}
        </div>
      </div>
      {/* Icons pinned to viewport right edge - outside app-header-inner */}
      <div style={{ 
        position: 'fixed',
        right: 0,
        top: 0,
        height: 80,
        display: 'flex', 
        alignItems: 'center',
        gap: 12,
        paddingRight: 16,
        zIndex: 1001,
      }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <div ref={notificationsRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setNotificationsOpen((o) => !o)}
              style={{
                background: notificationsOpen ? 'rgba(255,255,255,0.2)' : 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.9)',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '4px',
                outline: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s, color 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = notificationsOpen ? 'rgba(255,255,255,0.2)' : 'none';
                e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
              }}
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              aria-haspopup="menu"
            >
              <svg width="26" height="26" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zM8 1.918l-.797.161A4.002 4.002 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4.002 4.002 0 0 0-3.203-3.92L8 1.917zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 6.88 3 6c0-2.42 1.72-4.44 4.005-4.901a1 1 0 1 1 1.99 0A5.002 5.002 0 0 1 13 6c0 .88.32 4.2 1.22 6z"/>
              </svg>
              {tagId && unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    borderRadius: 999,
                    background: '#dc2626',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: '16px',
                    textAlign: 'center',
                    border: '1px solid rgba(255,255,255,0.7)',
                    pointerEvents: 'none',
                  }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <div
                role="menu"
                aria-label="Notifications"
                style={{
                  position: 'absolute',
                  top: 48,
                  right: 0,
                  background: '#fff',
                  color: '#374151',
                  borderRadius: BORDER_RADIUS.LG,
                  boxShadow: SHADOWS.XL,
                  width: 320,
                  maxWidth: 'min(92vw, 320px)',
                  zIndex: 2000,
                  fontFamily: 'Roboto Condensed, Arial, sans-serif',
                  overflow: 'hidden',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div
                  style={{
                    padding: '12px 14px',
                    background: '#f8fafc',
                    borderBottom: '1px solid #e5e7eb',
                    fontSize: 13,
                    fontWeight: 700,
                    color: COLORS.PRIMARY,
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                  }}
                >
                  Notifications
                </div>
                {!tagId ? (
                  <div style={{ padding: '14px', fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                    Notifications are available for office users.
                  </div>
                ) : notificationsLoading ? (
                  <div style={{ padding: '14px', fontSize: 13, color: '#6b7280' }}>Loading…</div>
                ) : notificationsError ? (
                  <div style={{ padding: '14px', fontSize: 13, color: '#b91c1c' }}>{notificationsError}</div>
                ) : notificationItems.length === 0 ? (
                  <div style={{ padding: '14px', fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                    No notifications yet.
                  </div>
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', maxHeight: 320, overflowY: 'auto' }}>
                    {notificationItems.map((n, idx) => (
                      <li key={n.id} style={{ borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9' }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (typeof onNotificationClick === 'function') {
                              onNotificationClick(n);
                            }
                            setNotificationsOpen(false);
                          }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            border: 'none',
                            background: '#fff',
                            padding: '10px 14px',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
                        >
                          <div style={{ fontSize: 13, color: '#1f2937', lineHeight: 1.45 }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 6px',
                                borderRadius: 999,
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: '0.03em',
                                marginRight: 6,
                                verticalAlign: 'middle',
                                color: n.type === 'digital_release' ? '#1e3a8a' : '#166534',
                                background: n.type === 'digital_release' ? '#dbeafe' : '#dcfce7',
                              }}
                            >
                              {n.type === 'digital_release' ? 'DIGITAL' : 'PHYSICAL'}
                            </span>
                            {n.type === 'digital_release' ? (
                              <>
                                A digital document was sent to your office: <strong>{n.trackingCode}</strong>.
                                {n.digitalMode === 'digital_first' ? ' Physical copy will follow.' : ''}
                              </>
                            ) : (
                              <>Your office received document <strong>{n.trackingCode}</strong>.{n.wrongOffice ? ' (Received at wrong office)' : ''}</>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                            {formatNotifTime(n.at)}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div ref={profileMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={toggleProfileMenu}
            style={{
              background: profileMenuOpen ? 'rgba(255,255,255,0.2)' : 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.9)',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: BORDER_RADIUS.MD,
              outline: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s, color 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
            }}
            aria-label="User menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="currentColor" viewBox="0 0 16 16">
              <path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/>
              <path fillRule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1z"/>
            </svg>
          </button>
          {profileMenuOpen && (
            <div style={{
              position: 'absolute',
              top: 48,
              right: 8,
              background: '#fff',
              color: '#374151',
              borderRadius: BORDER_RADIUS.LG,
              boxShadow: SHADOWS.XL,
              minWidth: 200,
              zIndex: 2000,
              fontFamily: 'Roboto Condensed, Arial, sans-serif',
              overflow: 'hidden',
              border: '1px solid #e5e7eb',
            }}>
              {/* Header with avatar + office */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                background: '#f8fafc',
                borderBottom: '1px solid #e5e7eb',
              }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: COLORS.PRIMARY,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                }}>
                  {initials}
                </div>
                <span style={{
                  fontSize: 12,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  fontFamily: '"Bebas Neue", Roboto Condensed, Arial, sans-serif',
                }}>
                  {officeLabel}
                </span>
              </div>

              <MenuItem
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
                label="Profile settings"
                onClick={() => closeProfileMenu()}
              />
              <MenuItem
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>}
                label="Preferences"
                onClick={() => closeProfileMenu()}
              />
              <MenuItem
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>}
                label="Account"
                onClick={() => closeProfileMenu()}
              />
              <div style={{ borderTop: '1px solid #e5e7eb' }}>
                <MenuItem
                  icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>}
                  label="Log out"
                  onClick={() => { closeProfileMenu(); logout(); }}
                  danger
                />
              </div>
            </div>
          )}
          </div>
          </div>
        </div>
    </div>
  );
}

export default Header; 