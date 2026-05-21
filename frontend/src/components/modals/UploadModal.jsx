import React, { useState, useCallback, useRef } from 'react';

function formatFileSize(bytes) {
  if (bytes == null || bytes === 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0))} ${sizes[i]}`;
}

/** Bootstrap-style cloud-arrow-up (Paperless-ngx / file upload affordance) */
function CloudUploadIcon({ size = 48, color = '#6c757d' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 16 16"
      aria-hidden
      style={{ color, flexShrink: 0 }}
    >
      <path d="M4.406 1.342A5.53 5.53 0 0 1 8 0c2.69 0 4.923 2 5.166 4.579C14.758 4.804 16 6.137 16 7.773 16 9.569 14.502 11 12.687 11H10a.5.5 0 0 1 0-1h2.688C13.979 10 15 8.988 15 7.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 2.825 10.328 1 8 1a4.53 4.53 0 0 0-2.941 1.1c-.757.652-1.153 1.438-1.153 2.055v.448l-.445.049C2.064 4.805 1 5.952 1 7.318 1 8.785 2.23 10 3.781 10H6a.5.5 0 0 1 0 1H3.781C1.708 11 0 9.366 0 7.318c0-1.763 1.266-3.223 2.942-3.593.143-.029.294-.043.447-.043.31 0 .62.06.9.168.09-.14.195-.28.314-.42C4.563.923 5.452 0 6.5 0c.938 0 1.77.39 2.343 1.007.27.268.5.59.68.94.19.36.29.76.29 1.153v.448c0 .42-.155.815-.425 1.11l-.293.3A.5.5 0 0 1 8.5 5h-2a.5.5 0 0 1-.354-.854l.292-.3c.15-.156.262-.35.325-.556C6.636 2.925 7.23 2.5 8 2.5c1.086 0 1.958.896 1.958 2 0 .523-.196.993-.522 1.318-.326.325-.78.522-1.436.522H6a.5.5 0 0 1 0-1h.471c.35 0 .654-.145.854-.354.2-.21.325-.476.325-.768 0-.523-.196-.993-.522-1.318-.326-.325-.78-.522-1.436-.522z" />
      <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z" />
    </svg>
  );
}

/**
 * Upload modal — layout aligned with Paperless-ngx (dashed dropzone, browse hint, footer actions).
 */
function UploadModal({
  showAddModal,
  uploading,
  isProcessing,
  processingStatus,
  uploadFile,
  uploadError,
  canRetry,
  onClose,
  onFileSelect,
  onUpload,
  onRetry,
  onRemoveFile,
}) {
  const inputRef = useRef(null);
  const [dragDepth, setDragDepth] = useState(0);
  const isDragActive = dragDepth > 0;

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((d) => d + 1);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((d) => Math.max(0, d - 1));
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragDepth(0);
      if (uploading || isProcessing) return;
      const file = e.dataTransfer?.files?.[0];
      if (file) onFileSelect(file);
    },
    [uploading, isProcessing, onFileSelect]
  );

  const openFilePicker = useCallback(() => {
    if (!uploading && !isProcessing) inputRef.current?.click();
  }, [uploading, isProcessing]);

  if (!showAddModal) return null;

  const primary = '#2a5196';
  const borderDefault = '#ced4da';
  const borderActive = primary;
  const muted = '#6c757d';

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 3000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
        animation: 'fadeIn 0.2s',
      }}
      onClick={() => {
        if (!uploading && !isProcessing) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-modal-title"
        style={{
          background: '#fff',
          borderRadius: 6,
          width: '100%',
          maxWidth: 520,
          boxShadow: '0 0.5rem 1rem rgba(0, 0, 0, 0.15)',
          border: '1px solid rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'min(90vh, 100%)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — Paperless-style modal header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #dee2e6',
            flexShrink: 0,
          }}
        >
          <h2
            id="upload-modal-title"
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 500,
              color: primary,
              lineHeight: 1.2,
            }}
          >
            Upload Document
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '4px 8px',
              margin: '-4px -8px 0 0',
              fontSize: 22,
              lineHeight: 1,
              color: '#6c757d',
              cursor: uploading || isProcessing ? 'not-allowed' : 'pointer',
              opacity: uploading || isProcessing ? 0.5 : 1,
            }}
            aria-label="Close"
            disabled={uploading || isProcessing}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '20px 20px 0', overflowY: 'auto', flex: '1 1 auto' }}>
          {isProcessing ? (
            <div style={{ textAlign: 'center', padding: '24px 0 32px' }}>
              <div
                className="spinner"
                style={{
                  width: 48,
                  height: 48,
                  border: '4px solid #e9ecef',
                  borderTopColor: primary,
                  borderRadius: '50%',
                  margin: '0 auto',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <div style={{ marginTop: 16, color: primary, fontWeight: 600, fontSize: 15 }}>
                {processingStatus || 'Processing…'}
              </div>
              <div style={{ marginTop: 8, color: muted, fontSize: 13, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
                Your document is being processed. This may take a few seconds.
              </div>
            </div>
          ) : (
            <form onSubmit={onUpload} id="upload-modal-form">
              <input
                ref={inputRef}
                type="file"
                required
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFileSelect(f);
                }}
                style={{ display: 'none' }}
                disabled={uploading}
              />

              {/* Drop zone — Paperless ngx–style dashed region */}
              <div
                onClick={openFilePicker}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openFilePicker();
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="Choose file or drop a file here"
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${isDragActive ? borderActive : borderDefault}`,
                  borderRadius: 6,
                  background: isDragActive ? 'rgba(42, 81, 150, 0.06)' : '#f8f9fa',
                  padding: '36px 20px',
                  textAlign: 'center',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  opacity: uploading ? 0.75 : 1,
                  transition: 'border-color 0.15s, background 0.15s',
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <CloudUploadIcon size={44} color={isDragActive ? primary : '#adb5bd'} />
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#212529', marginBottom: 4 }}>
                      {isDragActive ? 'Drop file to upload' : 'Drop files here'}
                    </div>
                    <div style={{ fontSize: 14, color: muted }}>
                      or <span style={{ color: primary, fontWeight: 600 }}>click to browse</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#adb5bd' }}>PDF only</div>
                </div>
              </div>

              {uploadFile && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    background: '#fff',
                    border: '1px solid #dee2e6',
                    borderRadius: 6,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: '#212529',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={uploadFile.name}
                    >
                      {uploadFile.name}
                    </div>
                    <div style={{ fontSize: 12, color: muted }}>{formatFileSize(uploadFile.size)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFile();
                      if (inputRef.current) inputRef.current.value = '';
                    }}
                    style={{
                      flexShrink: 0,
                      background: 'transparent',
                      border: 'none',
                      color: '#6c757d',
                      fontSize: 20,
                      lineHeight: 1,
                      padding: '4px 8px',
                      cursor: uploading ? 'not-allowed' : 'pointer',
                      borderRadius: 4,
                    }}
                    aria-label="Remove file"
                    disabled={uploading}
                  >
                    ×
                  </button>
                </div>
              )}

              {uploading && (
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      width: '100%',
                      height: 6,
                      background: '#e9ecef',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: '35%',
                        height: '100%',
                        background: `linear-gradient(90deg, ${primary}, #5a7eb8)`,
                        animation: 'upload-indeterminate 1.2s ease-in-out infinite',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 13, color: primary, marginTop: 6, display: 'inline-block' }}>Uploading…</span>
                </div>
              )}

              {uploadError && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '10px 12px',
                    background: '#f8d7da',
                    border: '1px solid #f5c2c7',
                    borderRadius: 6,
                    color: '#842029',
                    fontSize: 14,
                  }}
                >
                  {uploadError}
                  {canRetry && (
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={onRetry}
                        style={{
                          padding: '6px 12px',
                          background: '#198754',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          fontWeight: 500,
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        Retry upload
                      </button>
                    </div>
                  )}
                </div>
              )}
            </form>
          )}
        </div>

        {!isProcessing && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              padding: '16px 20px',
              borderTop: '1px solid #dee2e6',
              background: '#fff',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                fontWeight: 500,
                color: '#212529',
                background: '#fff',
                border: '1px solid #ced4da',
                borderRadius: 4,
                cursor: uploading ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="upload-modal-form"
              disabled={!uploadFile || uploading}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                fontWeight: 500,
                color: '#fff',
                background: !uploadFile || uploading ? '#6c757d' : primary,
                border: '1px solid transparent',
                borderRadius: 4,
                cursor: !uploadFile || uploading ? 'not-allowed' : 'pointer',
              }}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        )}
      </div>
      <style>{`
        @keyframes upload-indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(280%); }
        }
      `}</style>
    </div>
  );
}

export default UploadModal;
