/**
 * useDocumentProcessing Hook
 * 
 * Manages document processing state and polling logic.
 * Handles both task-based and direct document processing.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { apiCall } from '../services/api.js';
import { getStatusFieldId } from '../services/customFields.js';
import { API_ENDPOINTS, POLLING_INTERVALS, PROCESSING_TIMEOUTS, DEFAULT_DOCUMENT_STATUS } from '../constants/index.js';

export function useDocumentProcessing(onProcessingComplete) {
  // Processing state
  const [processingDocId, setProcessingDocId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [error, setError] = useState('');
  const [canRetry, setCanRetry] = useState(false);

  // Polling state - separate refs for different types of polling
  const taskPollingIntervalRef = useRef(null);
  const documentPollingIntervalRef = useRef(null);
  const pollingInProgress = useRef(false);
  const onProcessingCompleteRef = useRef(onProcessingComplete);
  const fileNameRef = useRef(''); // Store filename for context
  const pollingStartTimeRef = useRef(null);
  const pollCountRef = useRef(0);
  const isMountedRef = useRef(true); // Track if component is mounted

  // Update ref when callback changes
  onProcessingCompleteRef.current = onProcessingComplete;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (taskPollingIntervalRef.current) {
        clearInterval(taskPollingIntervalRef.current);
        taskPollingIntervalRef.current = null;
      }
      if (documentPollingIntervalRef.current) {
        clearInterval(documentPollingIntervalRef.current);
        documentPollingIntervalRef.current = null;
      }
    };
  }, []);

  /**
   * Clear processing state
   */
  const clearProcessingState = useCallback(() => {
    if (!isMountedRef.current) return;
    
    setProcessingDocId(null);
    setIsProcessing(false);
    setProcessingStatus('');
    setError('');
    setCanRetry(false);
    fileNameRef.current = '';
    pollingStartTimeRef.current = null;
    pollCountRef.current = 0;
    
    // Clear both polling intervals
    if (taskPollingIntervalRef.current) {
      clearInterval(taskPollingIntervalRef.current);
      taskPollingIntervalRef.current = null;
    }
    if (documentPollingIntervalRef.current) {
      clearInterval(documentPollingIntervalRef.current);
      documentPollingIntervalRef.current = null;
    }
    pollingInProgress.current = false;
  }, []);

  /**
   * Stop all polling
   */
  const stopPolling = useCallback(() => {
    if (taskPollingIntervalRef.current) {
      clearInterval(taskPollingIntervalRef.current);
      taskPollingIntervalRef.current = null;
    }
    if (documentPollingIntervalRef.current) {
      clearInterval(documentPollingIntervalRef.current);
      documentPollingIntervalRef.current = null;
    }
    pollingInProgress.current = false;
  }, []);

  /**
   * Start processing a document (either direct or task-based)
   * 
   * @param {Object} uploadResult - Result from file upload
   */
  const startProcessing = useCallback(async (uploadResult) => {
    const { docId, taskUuid, fileName } = uploadResult;
    fileNameRef.current = fileName || 'Document';
    
    if (taskUuid) {
      // Task-based processing
      if (isMountedRef.current) {
      setProcessingStatus('Processing upload task...');
      setIsProcessing(true);
      }
      startTaskPolling(taskUuid);
    } else if (docId) {
      // Direct document processing
      if (isMountedRef.current) {
      setProcessingDocId(docId);
      setProcessingStatus('Processing...');
      setIsProcessing(true);
      }
      
      const statusFieldId = await getStatusFieldId();
      if (statusFieldId) {
        try {
          await apiCall(API_ENDPOINTS.DOCUMENT_DETAIL(docId), {
            method: 'PATCH',
            body: JSON.stringify({
              custom_fields: [{ field: statusFieldId, value: DEFAULT_DOCUMENT_STATUS }],
            }),
          });
        } catch (err) {
          console.error('Error setting custom fields:', err);
        }
      }

      startDocumentPolling(docId);
    } else {
      console.error('No docId or taskUuid provided in uploadResult:', uploadResult);
      if (isMountedRef.current) {
        setError('Invalid upload result. Please try again.');
        setProcessingStatus('');
        setIsProcessing(false);
        setCanRetry(true);
      }
    }
  }, []);

  /**
   * Start polling for task completion
   * 
   * @param {string} taskUuid - Task UUID to poll
   */
  const startTaskPolling = useCallback((taskUuid) => {
    // Stop any existing polling first
    stopPolling();
    
    pollingStartTimeRef.current = Date.now();
    pollCountRef.current = 0;
    
    taskPollingIntervalRef.current = setInterval(async () => {
      if (pollingInProgress.current) {
        return;
      }
      
      // Check for timeout (multi-page documents take longer)
      const elapsed = Date.now() - pollingStartTimeRef.current;
      if (elapsed > PROCESSING_TIMEOUTS.TASK_POLLING_MS) {
        console.error('Task polling timeout after', PROCESSING_TIMEOUTS.TASK_POLLING_MS / 60000, 'minutes');
        clearInterval(taskPollingIntervalRef.current);
        taskPollingIntervalRef.current = null;
        pollingInProgress.current = false;
        if (isMountedRef.current) {
        setError('Document processing timed out. Large documents take longer—try again or split into smaller files.');
        setProcessingStatus('');
        setIsProcessing(false);
        setCanRetry(true);
        }
        return;
      }
      
      pollCountRef.current++;
      
      // Prevent endless polling with a maximum count
      if (pollCountRef.current > PROCESSING_TIMEOUTS.TASK_POLL_MAX_COUNT) {
        console.error('Maximum poll count reached, stopping task polling');
        clearInterval(taskPollingIntervalRef.current);
        taskPollingIntervalRef.current = null;
        pollingInProgress.current = false;
        if (isMountedRef.current) {
          setError('Document processing timed out. Large documents take longer—try again or split into smaller files.');
          setProcessingStatus('');
          setIsProcessing(false);
          setCanRetry(true);
        }
        return;
      }
      
      pollingInProgress.current = true;
      
      try {
        const tasksResp = await apiCall(API_ENDPOINTS.TASKS);
        const task = Array.isArray(tasksResp) ? tasksResp.find(t => t.task_id === taskUuid) : null;
        
        if (task) {
            if (task.status === 'SUCCESS' && task.related_document) {
              const newDocId = parseInt(task.related_document, 10);
              
              // Stop task polling first
              clearInterval(taskPollingIntervalRef.current);
              taskPollingIntervalRef.current = null;
              pollingInProgress.current = false;
              
              // Set processing state if mounted
              if (isMountedRef.current) {
              setProcessingStatus('Processing document...');
              setProcessingDocId(newDocId);
              setIsProcessing(true);
              }
              
              const statusFieldId = await getStatusFieldId();
              if (statusFieldId) {
                try {
                  await apiCall(API_ENDPOINTS.DOCUMENT_DETAIL(newDocId), {
                    method: 'PATCH',
                    body: JSON.stringify({
                      custom_fields: [{ field: statusFieldId, value: DEFAULT_DOCUMENT_STATUS }],
                    }),
                  });
                } catch (err) {
                  console.error('Error setting custom fields:', err);
                }
              }
              
              // Check if document is already ready
              try {
                const doc = await apiCall(API_ENDPOINTS.DOCUMENT_DETAIL(newDocId));
                
                if (doc.archived_file_name) {
                  // Update state if mounted
                  if (isMountedRef.current) {
                    setProcessingDocId(null);
                    setProcessingStatus('');
                    setIsProcessing(false);
                  }
                  
                  // Call completion callback regardless of mount status
                  if (onProcessingCompleteRef.current) {
                    onProcessingCompleteRef.current({ 
                      id: newDocId, 
                      title: fileNameRef.current || 'Document' 
                    });
                  }
                } else {
              // Start polling for document readiness
              startDocumentPolling(newDocId);
                }
              } catch (err) {
                console.error('Error checking document readiness:', err);
                // Start polling anyway
                startDocumentPolling(newDocId);
              }
            } else if (task.status === 'FAILURE') {
              clearInterval(taskPollingIntervalRef.current);
              taskPollingIntervalRef.current = null;
              pollingInProgress.current = false;
              if (isMountedRef.current) {
              setError('Document processing failed.');
              setProcessingStatus('');
              setIsProcessing(false);
              setCanRetry(true);
              }
            } else {
              pollingInProgress.current = false;
            }
        } else {
          pollingInProgress.current = false;
        }
      } catch (err) {
        console.error('Error polling tasks:', err);
        pollingInProgress.current = false;
        
        // If we get repeated errors, stop polling to prevent endless loops
        if (pollCountRef.current > 10) {
          console.error('Too many polling errors, stopping task polling');
          clearInterval(taskPollingIntervalRef.current);
          taskPollingIntervalRef.current = null;
          if (isMountedRef.current) {
            setError('Document processing failed due to connection issues.');
            setProcessingStatus('');
            setIsProcessing(false);
            setCanRetry(true);
          }
        }
      }
    }, POLLING_INTERVALS.TASK_POLLING);
  }, []);

  /**
   * Start polling for document readiness
   * 
   * @param {number} docId - Document ID to poll
   */
  const startDocumentPolling = useCallback((docId) => {
    // Stop any existing polling first
    stopPolling();
    
    pollingStartTimeRef.current = Date.now();
    pollCountRef.current = 0;
    
    documentPollingIntervalRef.current = setInterval(async () => {
      if (pollingInProgress.current) {
        return;
      }
      
      // Check for timeout (multi-page documents take longer for OCR)
      const elapsed = Date.now() - pollingStartTimeRef.current;
      if (elapsed > PROCESSING_TIMEOUTS.DOCUMENT_POLLING_MS) {
        console.error('Document polling timeout after', PROCESSING_TIMEOUTS.DOCUMENT_POLLING_MS / 60000, 'minutes');
        clearInterval(documentPollingIntervalRef.current);
        documentPollingIntervalRef.current = null;
        pollingInProgress.current = false;
        if (isMountedRef.current) {
        setError('Document processing timed out. Large documents take longer—try again or split into smaller files.');
        setProcessingStatus('');
        setIsProcessing(false);
        }
        return;
      }
      
      pollCountRef.current++;
      
      // Prevent endless polling with a maximum count
      if (pollCountRef.current > PROCESSING_TIMEOUTS.DOCUMENT_POLL_MAX_COUNT) {
        console.error('Maximum document poll count reached, stopping document polling');
        clearInterval(documentPollingIntervalRef.current);
        documentPollingIntervalRef.current = null;
        pollingInProgress.current = false;
        if (isMountedRef.current) {
          setError('Document processing timed out. Large documents take longer—try again or split into smaller files.');
          setProcessingStatus('');
          setIsProcessing(false);
          setCanRetry(true);
        }
        return;
      }
      
      pollingInProgress.current = true;
      
      try {
        const doc = await apiCall(API_ENDPOINTS.DOCUMENT_DETAIL(docId));
        
        if (doc.archived_file_name) {
          clearInterval(documentPollingIntervalRef.current);
          documentPollingIntervalRef.current = null;
          pollingInProgress.current = false;
          
          // Update state if mounted
          if (isMountedRef.current) {
          setProcessingDocId(null);
          setProcessingStatus('');
          setIsProcessing(false);
          }
          
          // Call completion callback regardless of mount status
          if (onProcessingCompleteRef.current) {
            onProcessingCompleteRef.current({ 
              id: docId, 
              title: fileNameRef.current || 'Document' 
            });
          }
        } else {
          pollingInProgress.current = false;
        }
      } catch (err) {
        console.error('Error polling document processing:', err);
        pollingInProgress.current = false;
        
        // If we get repeated errors, stop polling to prevent endless loops
        if (pollCountRef.current > 10) {
          console.error('Too many document polling errors, stopping document polling');
          clearInterval(documentPollingIntervalRef.current);
          documentPollingIntervalRef.current = null;
          if (isMountedRef.current) {
            setError('Document processing failed due to connection issues.');
            setProcessingStatus('');
            setIsProcessing(false);
            setCanRetry(true);
          }
        }
      }
    }, POLLING_INTERVALS.DOCUMENT_POLLING);
  }, []);

  return {
    // State
    processingDocId,
    isProcessing,
    processingStatus,
    error,
    canRetry,
    
    // Actions
    startProcessing,
    clearProcessingState,
    stopPolling,
    
    // Setters
    setError,
    setProcessingStatus,
    setIsProcessing,
  };
} 