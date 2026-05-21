import { useMemo, useState } from 'react';
import AddOutlineButton from './ui/AddOutlineButton.jsx';

/**
 * Admin main-panel list of all offices (Paperless tags). Sidebar links here; pick an office to open its settings.
 */
function AdminOfficesView({ tags = [], tagsLoading = false, onSelectOffice, onAddOffice, onRefresh }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return tags;
    const q = search.trim().toLowerCase();
    return tags.filter((t) => (t.name || '').toLowerCase().includes(q));
  }, [tags, search]);

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
    gap: 16,
    margin: 0,
    padding: 0,
    listStyle: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '100%',
        margin: 0,
        boxSizing: 'border-box',
      }}
    >
      <header
        style={{
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
        }}
      >
        <div style={{ minWidth: 'min(100%, 240px)', flex: '1 1 280px' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Offices</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
            Each office maps to a Paperless tag. Select one to edit routing, permissions, and tracking settings.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {typeof onRefresh === 'function' && (
            <button
              type="button"
              onClick={() => onRefresh()}
              disabled={tagsLoading}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: '#374151',
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                cursor: tagsLoading ? 'not-allowed' : 'pointer',
                opacity: tagsLoading ? 0.7 : 1,
              }}
            >
              Refresh
            </button>
          )}
          <AddOutlineButton type="button" onClick={() => onAddOffice?.()}>
            Add office
          </AddOutlineButton>
        </div>
      </header>

      <div style={{ marginBottom: 16 }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search offices…"
          autoComplete="off"
          disabled={tagsLoading && tags.length === 0}
          aria-label="Search offices"
          style={{
            width: '100%',
            maxWidth: 400,
            padding: '10px 12px',
            fontSize: 14,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {tagsLoading && tags.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>Loading offices…</p>
      ) : tags.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', lineHeight: 1.5 }}>
          No offices yet. Use <strong style={{ color: '#64748b' }}>Add office</strong> above to create one.
        </p>
      ) : filtered.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>No offices match your search.</p>
      ) : (
        <ul style={gridStyle}>
          {filtered.map((tag) => (
            <li key={tag.id}>
              <button
                type="button"
                onClick={() => onSelectOffice?.(tag.id)}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  textAlign: 'left',
                  padding: 16,
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  background: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#bfdbfe';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(15, 23, 42, 0.04)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, minWidth: 0, width: '100%' }}>
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      flexShrink: 0,
                      backgroundColor: tag.color || '#9ca3af',
                    }}
                  />
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: '#1e293b',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tag.name}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: '#94a3b8', marginTop: 'auto' }}>Open settings →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AdminOfficesView;
