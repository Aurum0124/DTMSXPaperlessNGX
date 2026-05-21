import React, { useRef, useEffect } from 'react';
import JsBarcode from 'jsbarcode';

/* Niimbot B1: 50x30mm label - landscape (50 wide x 30 tall) */
const LABEL_WIDTH_MM = 50;
const LABEL_HEIGHT_MM = 30;
/* Shift content left to compensate for printer offset - tuned slightly less to move print right */
const PRINT_OFFSET_LEFT_MM = 2;
/* Push content down - header sits too high on physical label */
const PRINT_OFFSET_TOP_MM = 2;

/**
 * Print barcode in isolated iframe - single page, barcode only, centered.
 * Page is 50x30mm landscape. In print dialog: choose Niimbot B1, set orientation to Landscape.
 */
function buildPrintDocument(svgHtml) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Barcode</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @media print {
      @page {
        size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm landscape;
        margin: 0;
      }
      body, .header, .header-line1, .header-line2, .label {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    html { width: ${LABEL_WIDTH_MM}mm; height: ${LABEL_HEIGHT_MM}mm; }
    body {
      width: ${LABEL_WIDTH_MM}mm;
      height: ${LABEL_HEIGHT_MM}mm;
      margin: 0;
      padding: ${1 + PRINT_OFFSET_TOP_MM}mm 2mm 0.5mm;
      overflow: hidden;
      background: #fff;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      margin-left: -${PRINT_OFFSET_LEFT_MM}mm;
    }
    .header {
      text-align: center;
      line-height: 1.2;
      margin-bottom: 0.4mm;
      margin-top: 1mm;
      padding: 0 1mm 0 2mm;
      margin-left: -1mm;
      font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
      text-rendering: optimizeLegibility;
    }
    .header-line1 { font-size: 6.5pt; font-weight: 700; color: #000; white-space: nowrap; }
    .header-line2 { font-size: 6.5pt; font-weight: 600; color: #000; white-space: nowrap; }
    .label {
      width: 100%;
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
    }
    .label svg {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-line1">Provincial Government of Ilocos Norte</div>
    <div class="header-line2">Document Tracking System</div>
  </div>
  <div class="label">${svgHtml}</div>
</body>
</html>`;
}

/**
 * PrintBarcodeModal Component
 *
 * Shows barcode for printing after tracking code is saved.
 * Optimized for Niimbot B1 label printer (50x30mm label).
 * Prints from current page via window.print() - no new tab.
 */
function PrintBarcodeModal({ trackingCode, documentTitle, onClose, onPrint }) {
  const barcodeRef = useRef(null);

  useEffect(() => {
    if (barcodeRef.current && trackingCode) {
      try {
        JsBarcode(barcodeRef.current, trackingCode, {
          format: 'CODE128',
          width: 4,
          height: 150,
          displayValue: true,
          fontSize: 34,
          margin: 15,
          background: '#fff',
          lineColor: '#000',
        });
      } catch (err) {
        console.error('Barcode generation failed:', err);
      }
    }
  }, [trackingCode]);

  const handlePrint = () => {
    if (!trackingCode || !barcodeRef.current) return;
    const svgHtml = barcodeRef.current.outerHTML;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:absolute;width:189px;height:113px;border:none;left:-9999px;top:0;';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(buildPrintDocument(svgHtml));
    doc.close();

    let executed = false;
    const doPrint = () => {
      if (executed) return;
      executed = true;
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe);
        if (onPrint) onPrint();
      }, 500);
    };

    iframe.onload = doPrint;
    setTimeout(doPrint, 350);
  };

  if (!trackingCode) return null;

  const primary = '#2a5196';
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
        zIndex: 4001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
        animation: 'fadeIn 0.2s',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-barcode-modal-title"
        style={{
          background: '#fff',
          borderRadius: 6,
          width: '100%',
          maxWidth: 440,
          boxShadow: '0 0.5rem 1rem rgba(0, 0, 0, 0.15)',
          border: '1px solid rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'min(90vh, 100%)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
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
            id="print-barcode-modal-title"
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 500,
              color: primary,
              lineHeight: 1.2,
            }}
          >
            Print barcode
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
              cursor: 'pointer',
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ padding: '20px 20px 0', overflowY: 'auto', flex: '1 1 auto' }}>
          <p style={{ margin: '0 0 16px', color: muted, fontSize: 14, lineHeight: 1.5, textAlign: 'left' }}>
            Print this barcode label for <strong style={{ color: primary }}>{documentTitle || 'document'}</strong>.
          </p>

          <div
            style={{
              padding: 16,
              background: '#f8f9fa',
              borderRadius: 4,
              marginBottom: 12,
              border: '1px solid #ced4da',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              overflow: 'hidden',
              maxWidth: '100%',
              maxHeight: 200,
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 8, lineHeight: 1.2 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#212529' }}>Provincial Government of Ilocos Norte</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: muted }}>Document Tracking System</div>
            </div>
            <svg ref={barcodeRef} style={{ maxWidth: '100%', maxHeight: 120, display: 'block' }} />
          </div>

          <p style={{ fontSize: 12, color: muted, margin: '0 0 4px', lineHeight: 1.45 }}>
            Select Niimbot B1 and set <strong>Landscape</strong> orientation in the print dialog.
          </p>
        </div>

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
            style={{
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              color: '#212529',
              background: '#fff',
              border: '1px solid #ced4da',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handlePrint}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              color: '#fff',
              background: primary,
              border: '1px solid transparent',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}

export default PrintBarcodeModal;
