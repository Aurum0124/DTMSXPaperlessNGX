import { useState, useEffect, useRef } from 'react';
import 'barcode-detector/polyfill';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { apiCall } from '../services/api.js';
import { Footer, TrackerDetailsModal, TrackerNotFoundModal } from '../components/index.js';

const COLORS = {
  primary: '#2a5196',
  primaryLight: '#3d6ab5',
  text: '#1f2937',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  bg: '#f9fafb',
  white: '#fff',
  success: '#059669',
  warning: '#d97706',
  error: '#dc2626',
};

/** Trim and uppercase the first letter when it is a–z (barcode / keyboard often sends lowercase). */
function normalizeTrackingCodeStart(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  const c = t[0];
  if (c >= 'a' && c <= 'z') return c.toUpperCase() + t.slice(1);
  return t;
}

function PublicTracker() {
  const [trackingCode, setTrackingCode] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modalRefreshing, setModalRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [scanError, setScanError] = useState(null);
  const logoRef = useRef(null);
  const fileInputRef = useRef(null);
  const html5QrFileRef = useRef(null);
  const html5QrCameraRef = useRef(null);
  const cameraHandledRef = useRef(false);
  const trackingInputRef = useRef(null);

  const HTML5_QR_FORMATS = [
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.CODABAR,
  ];

  const applyDecodedTrackingCode = async (raw) => {
    const normalized = normalizeTrackingCodeStart(raw);
    if (!normalized) return false;
    setTrackingCode(normalized);
    setError(null);
    setResult(null);
    setScanError(null);
    const data = await apiCall(`/api/tracker/document?tracking_code=${encodeURIComponent(normalized)}`);
    setResult(data);
    return true;
  };

  const stopCameraScan = async () => {
    const scanner = html5QrCameraRef.current;
    html5QrCameraRef.current = null;
    cameraHandledRef.current = false;
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
      } catch {
        /* already stopped */
      }
      try {
        scanner.clear();
      } catch {
        /* ignore */
      }
    }
    setCameraActive(false);
    setCameraStarting(false);
    setCameraModalOpen(false);
  };

  const openCameraModal = () => {
    if (cameraModalOpen || cameraActive || cameraStarting) return;
    setScanError(null);
    setCameraModalOpen(true);
  };

  useEffect(() => {
    if (!cameraModalOpen) return undefined;

    let cancelled = false;

    const bootCamera = async () => {
      setCameraStarting(true);
      cameraHandledRef.current = false;
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
      if (cancelled || !document.getElementById('tracker-camera-view')) {
        if (!cancelled) {
          setScanError('Could not open camera view.');
          setCameraModalOpen(false);
        }
        setCameraStarting(false);
        return;
      }

      try {
        const scanner = new Html5Qrcode('tracker-camera-view', {
          verbose: false,
          formatsToSupport: HTML5_QR_FORMATS,
          useBarCodeDetectorIfSupported: true,
        });
        html5QrCameraRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            aspectRatio: 1.5,
            qrbox: (viewfinderWidth, viewfinderHeight) => ({
              width: Math.floor(viewfinderWidth * 0.92),
              height: Math.min(Math.floor(viewfinderHeight * 0.35), 140),
            }),
          },
          async (decodedText) => {
            if (cameraHandledRef.current || cancelled) return;
            const text = String(decodedText ?? '').trim();
            if (!text) return;
            cameraHandledRef.current = true;
            setScanning(true);
            try {
              await applyDecodedTrackingCode(text);
              await stopCameraScan();
            } catch (err) {
              cameraHandledRef.current = false;
              setScanError(err?.message || 'Could not look up that tracking code.');
            } finally {
              setScanning(false);
            }
          },
          () => {}
        );
        if (!cancelled) setCameraActive(true);
      } catch (err) {
        html5QrCameraRef.current = null;
        if (!cancelled) {
          const msg = String(err?.message ?? err ?? '');
          if (/not supported|secure context|permission/i.test(msg)) {
            setScanError('Camera unavailable. Allow camera access or use From photo / type the code.');
          } else {
            setScanError(msg || 'Could not start camera.');
          }
          setCameraModalOpen(false);
        }
      } finally {
        if (!cancelled) setCameraStarting(false);
      }
    };

    bootCamera();

    return () => {
      cancelled = true;
      const scanner = html5QrCameraRef.current;
      html5QrCameraRef.current = null;
      cameraHandledRef.current = false;
      if (scanner) {
        if (scanner.isScanning) scanner.stop().catch(() => {});
        try {
          scanner.clear();
        } catch {
          /* ignore */
        }
      }
    };
  }, [cameraModalOpen]);

  useEffect(() => {
    if (!justRefreshed) return;
    const t = setTimeout(() => setJustRefreshed(false), 1500);
    return () => clearTimeout(t);
  }, [justRefreshed]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const keepInputVisible = () => {
      const active = document.activeElement;
      if (active !== trackingInputRef.current) return;
      requestAnimationFrame(() => {
        trackingInputRef.current?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      });
    };
    vv.addEventListener('resize', keepInputVisible);
    vv.addEventListener('scroll', keepInputVisible);
    return () => {
      vv.removeEventListener('resize', keepInputVisible);
      vv.removeEventListener('scroll', keepInputVisible);
    };
  }, []);

  const scaleImage = (file, scale) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(new File([blob], file.name, { type: file.type }));
            else reject(new Error('Canvas to blob failed'));
          },
          file.type || 'image/png',
          0.95
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };
      img.src = url;
    });

  const tryDetect = async (imageSource, detector) => {
    const barcodes = await detector.detect(imageSource);
    if (barcodes?.length > 0 && barcodes[0]?.rawValue) return barcodes[0].rawValue.trim();
    return null;
  };

  const decodeBarcode = async (file) => {
    if (typeof BarcodeDetector === 'undefined') return null;
    const detector = new BarcodeDetector({
      formats: ['code_128', 'code_39', 'codabar', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e', 'itf', 'code_93'],
    });
    let result = await tryDetect(file, detector);
    if (result) return result;
    const scales = [2, 3, 4];
    for (const scale of scales) {
      try {
        const scaled = await scaleImage(file, scale);
        result = await tryDetect(scaled, detector);
        if (result) return result;
      } catch {
        /* try next scale */
      }
    }
    const el = document.getElementById('tracker-barcode-scanner');
    if (!el) return null;
    if (!html5QrFileRef.current) {
      html5QrFileRef.current = new Html5Qrcode('tracker-barcode-scanner', {
        verbose: false,
        formatsToSupport: HTML5_QR_FORMATS,
        useBarCodeDetectorIfSupported: false,
      });
    }
    try {
      result = await html5QrFileRef.current.scanFile(file, true);
      if (result) return result;
    } catch {
      /* fall through to scaled scan */
    }
    for (const scale of scales) {
      try {
        const scaled = await scaleImage(file, scale);
        result = await html5QrFileRef.current.scanFile(scaled, true);
        if (result) return result;
      } catch {
        /* try next scale */
      }
    }
    return null;
  };

  const handleScanImage = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      setScanError('Please select an image file (JPG, PNG, etc.)');
      return;
    }
    setScanError(null);
    setScanning(true);
    try {
      const decoded = await decodeBarcode(file);
      if (decoded && decoded.trim()) {
        await applyDecodedTrackingCode(decoded);
        requestAnimationFrame(() => {
          trackingInputRef.current?.focus();
        });
      } else {
        setScanError('No barcode found. Use a clear photo of the barcode, or type the code manually.');
      }
    } catch (err) {
      setScanError(err?.message || 'Could not read barcode. Use a clear, well-lit photo of the barcode.');
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setScanError(null);
    setResult(null);
    try {
      const data = await apiCall(`/api/tracker/document?tracking_code=${encodeURIComponent(trackingCode.trim())}`);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoClick = () => {
    if (logoRef.current) {
      logoRef.current.style.transform = 'scale(1.08)';
      setTimeout(() => {
        if (logoRef.current) logoRef.current.style.transform = 'scale(1)';
      }, 150);
    }
    setTrackingCode('');
    setResult(null);
    setError(null);
    setScanError(null);
    stopCameraScan();
  };

  return (
    <div className="tracker-page" style={{
      width: '100%',
      maxWidth: '100vw',
      overflowX: 'hidden',
      touchAction: 'pan-y',
      display: 'flex',
      flexDirection: 'column',
      background: COLORS.bg,
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Header - matches LoginForm */}
      <div className="bg-bar top login-header" style={{ fontFamily: 'Roboto Condensed, Arial, sans-serif' }}>
        <div className="app-header-inner" style={{ display: 'flex', alignItems: 'center', height: '100%', flex: 1 }}>
          <img src="/assets/Bagong%20Pilipinas.png" alt="Bagong Pilipinas" style={{ height: '60px', width: 'auto' }} />
        </div>
      </div>

      {/* Main content - scrollable, no horizontal pan on mobile */}
      <main className="tracker-main" style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        width: '100%',
        maxWidth: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '112px 20px 120px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        boxSizing: 'border-box',
        touchAction: 'pan-y',
        scrollPaddingTop: 140,
        scrollPaddingBottom: 180,
      }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 32, maxWidth: 480 }}>
          <img
            ref={logoRef}
            src="/assets/logo.png"
            alt="Logo"
            className="tracker-hero-pgin-logo"
            onClick={handleLogoClick}
            style={{
              display: 'block',
              margin: '0 auto 20px',
              maxWidth: 176,
              height: 'auto',
              cursor: 'pointer',
              transition: 'transform 0.2s ease',
            }}
          />
          <p style={{
            margin: '0 0 4px',
            fontSize: 15,
            fontWeight: 600,
            color: COLORS.textMuted,
            letterSpacing: '0.02em',
          }}>
            Provincial Government of Ilocos Norte
          </p>
          <h1 style={{
            margin: '0 0 8px',
            fontSize: 28,
            fontWeight: 700,
            color: COLORS.text,
            letterSpacing: '-0.02em',
          }}>
            Document Tracker
          </h1>
          <p style={{
            margin: 0,
            fontSize: 15,
            color: COLORS.textMuted,
            lineHeight: 1.5,
          }}>
            Enter your tracking code to see document status and location
          </p>
        </div>

        {/* Search form */}
        <form
          className="tracker-form"
          onSubmit={handleSubmit}
          style={{
            width: '100%',
            maxWidth: 420,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div className="tracker-form-row" style={{
            width: '100%',
            position: 'relative',
            display: 'flex',
            alignItems: 'stretch',
            background: COLORS.white,
            borderRadius: 12,
            border: `2px solid ${COLORS.border}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            overflow: 'hidden',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}>
            <input
              ref={trackingInputRef}
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="e.g. TRK-2026-00001"
              value={trackingCode}
              onChange={(e) => {
                const v = e.target.value;
                const cursor = e.target.selectionStart ?? v.length;
                const next = normalizeTrackingCodeStart(v);
                if (next === v) {
                  setTrackingCode(v);
                  return;
                }
                setTrackingCode(next);
                requestAnimationFrame(() => {
                  const el = trackingInputRef.current;
                  if (!el) return;
                  const pos = cursor + (next.length - v.length);
                  el.setSelectionRange(Math.max(0, pos), Math.max(0, pos));
                });
              }}
              onFocus={() => {
                setTimeout(() => {
                  trackingInputRef.current?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
                }, 60);
              }}
              required
              aria-label="Tracking code"
              style={{
                flex: 1,
                padding: '14px 18px',
                fontSize: 16,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: COLORS.text,
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '14px 24px',
                background: COLORS.primary,
                color: COLORS.white,
                border: 'none',
                fontSize: 15,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'background 0.2s, opacity 0.2s',
              }}
            >
              {loading ? 'Searching...' : 'Track'}
            </button>
          </div>
          <div className="tracker-scan-row" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, width: '100%', maxWidth: 420 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleScanImage}
              style={{ display: 'none' }}
              aria-hidden="true"
            />
            <button
              type="button"
              disabled={scanning || loading || cameraStarting}
              onClick={openCameraModal}
              style={{
                padding: '10px 18px',
                background: COLORS.primary,
                color: COLORS.white,
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: scanning || loading || cameraStarting ? 'not-allowed' : 'pointer',
                opacity: scanning || loading || cameraStarting ? 0.7 : 1,
              }}
            >
              {cameraStarting ? 'Starting camera…' : 'Scan with camera'}
            </button>
            <button
              type="button"
              disabled={scanning || loading || cameraModalOpen}
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '10px 18px',
                background: COLORS.white,
                color: COLORS.primary,
                border: `2px solid ${COLORS.border}`,
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: scanning || loading || cameraModalOpen ? 'not-allowed' : 'pointer',
                opacity: scanning || loading || cameraModalOpen ? 0.7 : 1,
              }}
            >
              {scanning ? 'Scanning…' : 'From photo'}
            </button>
            <span style={{ fontSize: 13, color: COLORS.textMuted, width: '100%' }}>
              Live scan reads the barcode only — nothing is saved. Or type the code above.
            </span>
          </div>
        </form>

        {cameraModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Scan tracking code"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 5000,
              background: 'rgba(0,0,0,0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              boxSizing: 'border-box',
            }}
            onClick={() => stopCameraScan()}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: COLORS.white,
                borderRadius: 12,
                padding: 16,
                width: '100%',
                maxWidth: 420,
                boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
              }}
            >
              <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: COLORS.text }}>
                Point at the barcode
              </p>
              <div
                id="tracker-camera-view"
                style={{
                  width: '100%',
                  minHeight: 220,
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: '#111',
                }}
              />
              <p style={{ margin: '12px 0 0', fontSize: 13, color: COLORS.textMuted }}>
                {scanning ? 'Looking up document…' : 'Align the barcode in the frame. Scan stops automatically.'}
              </p>
              <button
                type="button"
                onClick={() => stopCameraScan()}
                style={{
                  marginTop: 14,
                  width: '100%',
                  padding: '12px 16px',
                  background: COLORS.white,
                  color: COLORS.text,
                  border: `2px solid ${COLORS.border}`,
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div
          id="tracker-barcode-scanner"
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            width: 400,
            height: 400,
            overflow: 'hidden',
            pointerEvents: 'none',
            opacity: 0,
            zIndex: -1,
          }}
        />

        {scanError && (
          <div style={{
            marginTop: 12,
            padding: '12px 20px',
            background: '#fef2f2',
            color: COLORS.error,
            borderRadius: 10,
            fontSize: 14,
            maxWidth: 420,
            width: '100%',
          }}>
            {scanError}
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 20,
            padding: '14px 20px',
            background: '#fef2f2',
            color: COLORS.error,
            borderRadius: 10,
            fontSize: 14,
            maxWidth: 420,
            width: '100%',
          }}>
            {error}
          </div>
        )}

        <TrackerDetailsModal
          open={!!(result?.document)}
          result={result}
          trackingCode={trackingCode}
          onClose={() => setResult(null)}
          showFooterClose={false}
          isRefreshing={modalRefreshing}
          justRefreshed={justRefreshed}
          onRefresh={async () => {
            if (!trackingCode?.trim()) return;
            setModalRefreshing(true);
            setError(null);
            try {
              const data = await apiCall(`/api/tracker/document?tracking_code=${encodeURIComponent(trackingCode.trim())}`);
              setResult(data);
              setJustRefreshed(true);
            } catch (err) {
              setError(err.message);
            } finally {
              setModalRefreshing(false);
            }
          }}
        />

        <TrackerNotFoundModal
          open={!!(result && !result.document)}
          trackingCode={trackingCode}
          onClose={() => setResult(null)}
          showFooterClose={false}
        />
      </main>

      <Footer centered />
    </div>
  );
}

export default PublicTracker;
