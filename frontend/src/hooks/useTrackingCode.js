/**
 * useTrackingCode Hook
 * 
 * Manages tracking code state and saving functionality.
 * Handles the final step of document upload process.
 * Generates suggested tracking code: PREFIX-YEAR-NNNN (incremental per office).
 */

import { useState, useCallback } from 'react';
import { apiCall } from '../services/api.js';
import { sessionManager } from '../services/session.js';
import { API_ENDPOINTS } from '../constants/index.js';
import {
  getTrackingCodeFieldIdAsync,
  getSubmittedByFieldIdAsync,
  mergeCustomFieldUpdates,
} from '../services/customFields.js';

export function useTrackingCode(tagInfo, onTrackingCodeComplete) {
  const [pendingTrackingCodeDoc, setPendingTrackingCodeDoc] = useState(null);
  const [savedForPrint, setSavedForPrint] = useState(null);
  const [processingStatus, setProcessingStatus] = useState('');
  const [error, setError] = useState('');

  /**
   * Fetch suggested tracking code: PREFIX-YEAR-NNNN
   * PREFIX from office settings, YEAR fixed, NNNN = incremental per office (not global).
   * excludeDocId: exclude this document from the count (the doc we're assigning a code to).
   */
  const fetchSuggestedTrackingCode = useCallback(async (excludeDocId = null) => {
    if (!tagInfo?.id) return 'TRK-' + new Date().getFullYear() + '-00001';
    const user = sessionManager.getUser?.() ?? null;
    const prefix = (user?.tracking_code_prefix || 'TRK').trim() || 'TRK';
    const year = new Date().getFullYear();
    try {
      let url = `/api/admin/stats?tag_id=${tagInfo.id}`;
      if (excludeDocId) url += `&exclude_document_id=${excludeDocId}`;
      const data = await apiCall(url);
      const count = data?.originated_documents_count ?? data?.documents_count ?? 0;
      const nextNum = count + 1;
      return `${prefix}-${year}-${String(nextNum).padStart(5, '0')}`;
    } catch {
      return `${prefix}-${year}-00001`;
    }
  }, [tagInfo?.id]);

  /**
   * Set pending tracking code document and optionally fetch suggested code
   */
  const setPendingDocument = useCallback(async (doc, onSuggested) => {
    setPendingTrackingCodeDoc(doc);
    if (onSuggested && doc) {
      const suggested = await fetchSuggestedTrackingCode(doc.id);
      onSuggested(suggested);
    }
  }, [fetchSuggestedTrackingCode]);

  /**
   * Clear tracking code state
   */
  const clearTrackingCodeState = useCallback(() => {
    setPendingTrackingCodeDoc(null);
    setSavedForPrint(null);
    setProcessingStatus('');
    setError('');
  }, []);

  /**
   * Finish the tracking code flow (after print modal).
   * Clears savedForPrint and calls onTrackingCodeComplete.
   */
  const finishTrackingCodeFlow = useCallback(() => {
    const docId = savedForPrint?.docId ?? null;
    setSavedForPrint(null);
    if (docId && onTrackingCodeComplete) {
      onTrackingCodeComplete(docId);
    }
  }, [savedForPrint?.docId, onTrackingCodeComplete]);

  /**
   * Save tracking code, title, and optionally Paperless document type (native) for pending document
   *
   * @param {string} trackingCode - Tracking code to save
   * @param {string} [title] - Optional document title to save
   * @param {number|null} [documentTypeId] - Optional Paperless document type ID (native document_type)
   * @param {string} [submittedBy] - Optional "Submitted By" custom field value
   * @param {{ hidePublicRoute?: boolean }} [options] - When hidePublicRoute, document is omitted from public tracker only (staff lookup still works)
   */
  const saveTrackingCode = useCallback(async (trackingCode, title, documentTypeId, submittedBy, options = {}) => {
    if (!pendingTrackingCodeDoc || !trackingCode) return;

    const tcFieldId = await getTrackingCodeFieldIdAsync();
    if (!tcFieldId) {
      setError('Tracking Code custom field not configured. Create it in Admin.');
      return;
    }

    setProcessingStatus('Saving tracking code...');
    setError('');

    try {
      const customFieldUpdates = [{ field: tcFieldId, value: trackingCode }];
      const submittedByTrimmed = submittedBy != null ? String(submittedBy).trim() : '';
      if (submittedByTrimmed) {
        const submittedByFieldId = await getSubmittedByFieldIdAsync();
        if (!submittedByFieldId) {
          setProcessingStatus('');
          setError('Submitted By custom field not configured. Create it in Admin → Settings.');
          return;
        }
        customFieldUpdates.push({ field: submittedByFieldId, value: submittedByTrimmed });
      }

      const payload = {
        custom_fields: mergeCustomFieldUpdates(
          pendingTrackingCodeDoc.custom_fields,
          customFieldUpdates
        ),
      };
      if (title != null && String(title).trim()) {
        payload.title = String(title).trim();
      }
      if (documentTypeId != null && documentTypeId !== '') {
        payload.document_type = documentTypeId;
      }

      await apiCall(API_ENDPOINTS.DOCUMENT_DETAIL(pendingTrackingCodeDoc.id), {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (options.hidePublicRoute) {
        await apiCall('/api/document-public-route-hidden', {
          method: 'POST',
          body: JSON.stringify({ document_id: pendingTrackingCodeDoc.id }),
        });
      }

      const docId = pendingTrackingCodeDoc.id;
      const documentTitle = title != null && String(title).trim() ? String(title).trim() : (pendingTrackingCodeDoc.title || 'Document');
      setPendingTrackingCodeDoc(null);
      setProcessingStatus('');
      setSavedForPrint({ docId, trackingCode, documentTitle });
    } catch (err) {
      setProcessingStatus('Failed to save tracking code.');
      setError('Failed to save tracking code: ' + err.message);
      console.error('Error saving tracking code:', err);
    }
  }, [pendingTrackingCodeDoc, onTrackingCodeComplete]);

  return {
    // State
    pendingTrackingCodeDoc,
    savedForPrint,
    processingStatus,
    error,

    // Actions
    setPendingDocument,
    saveTrackingCode,
    finishTrackingCodeFlow,
    clearTrackingCodeState,

    // Setters
    setError,
    setProcessingStatus,
  };
} 