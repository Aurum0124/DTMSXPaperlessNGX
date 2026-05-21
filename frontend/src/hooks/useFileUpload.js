/**
 * useFileUpload Hook
 * 
 * Manages file selection, validation, and upload state.
 * Handles the initial file upload process.
 */

import { useState, useCallback } from 'react';
import { apiCall } from '../services/api.js';
import { API_CONFIG, API_ENDPOINTS, validateFile } from '../constants/index.js';

export function useFileUpload(tagInfo) {
  // File upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [canRetry, setCanRetry] = useState(false);

  /**
   * Clear upload state
   */
  const clearUploadState = useCallback(() => {
    setUploadFile(null);
    setUploading(false);
    setUploadProgress(0);
    setError('');
    setCanRetry(false);
  }, []);

  const selectUploadFile = useCallback((file) => {
    if (!file) {
      setUploadFile(null);
      return;
    }
    const validation = validateFile(file);
    if (!validation.isValid) {
      setError(validation.error);
      setUploadFile(null);
      setCanRetry(false);
      return;
    }
    setError('');
    setCanRetry(false);
    setUploadFile(file);
  }, []);

  /**
   * Handle file upload
   * 
   * @param {Event} e - Form submit event
   * @returns {Promise<Object>} Upload result with docId or taskUuid
   */
  const handleUpload = useCallback(async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      console.log('No upload file selected');
      return { docId: null, taskUuid: null, fileName: null };
    }
    
    // Validate file before upload
    const validation = validateFile(uploadFile);
    if (!validation.isValid) {
      console.log('File validation failed:', validation.error);
      setError(validation.error);
      return { docId: null, taskUuid: null, fileName: uploadFile.name };
    }
    
    setUploading(true);
    setError('');
    setUploadProgress(0);
    setCanRetry(false);
    
    try {
      const formData = new FormData();
      formData.append('document', uploadFile);
      
      if (!tagInfo?.id) {
        throw new Error('Office not configured');
      }
      if (tagInfo?.canUploadDocuments === false) {
        throw new Error('Your office does not have permission to upload documents.');
      }
      
      formData.append('tags', tagInfo.id);
      
      console.log('Uploading file:', uploadFile.name, 'with tag ID:', tagInfo.id);
      
      // Try the post_document endpoint first
      let response;
      try {
        response = await apiCall(API_ENDPOINTS.POST_DOCUMENT, {
          method: 'POST',
          body: formData,
          headers: {
            'Authorization': API_CONFIG.HEADERS['Authorization'],
            'Accept': 'application/json',
          },
        });
      } catch (uploadError) {
        console.error('Upload failed:', uploadError);
        // Don't try fallback since /api/documents/ doesn't support POST
        throw new Error(`Upload failed: ${uploadError.message}. Please check your connection and try again.`);
      }

      console.log('Upload response:', response);
      console.log('Upload response type:', typeof response);
      console.log('Upload response is array:', Array.isArray(response));
      
      let docId = null;
      let taskUuid = null;
      
      if (Array.isArray(response) && response.length > 0) {
        docId = response[0].id;
        console.log('Document ID from array response:', docId);
      } else if (response && typeof response === 'object' && response.id) {
        docId = response.id;
        console.log('Document ID from object response:', docId);
      } else if (typeof response === 'string') {
        // Task-based processing
        taskUuid = response;
        console.log('Task UUID received:', taskUuid);
      } else {
        console.warn('Unexpected response format:', response);
        console.log('Response keys:', response ? Object.keys(response) : 'null/undefined');
      }
      
      setUploading(false);
      
      const result = { docId, taskUuid, fileName: uploadFile.name };
      console.log('Upload completed successfully with result:', result);
      return result;
      
    } catch (err) {
      console.error('Upload failed:', err);
      setError('Upload failed: ' + err.message);
      setUploading(false);
      setCanRetry(true);
      // Don't throw the error after setting state to prevent inconsistent state
      return { docId: null, taskUuid: null, fileName: uploadFile.name };
    }
  }, [uploadFile, tagInfo?.id, tagInfo?.canUploadDocuments]);

  return {
    // State
    uploadFile,
    uploading,
    uploadProgress,
    error,
    canRetry,
    
    // Actions
    setUploadFile,
    selectUploadFile,
    handleUpload,
    clearUploadState,

    // Setters
    setError,
  };
}