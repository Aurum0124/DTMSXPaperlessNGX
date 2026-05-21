/**
 * Hooks Index
 * 
 * This file exports all custom hooks from a single location for easier imports.
 * Import hooks like: import { useDocumentState, useUIState } from '../hooks';
 */

// State management hooks
export { useDocumentState } from './useDocumentState.js';
export { useUploadState } from './useUploadState.js';
export { useUIState } from './useUIState.js';
export { useSearchState } from './useSearchState.js';
export { useConnectionState } from './useConnectionState.js';

// Document history hook
export { useDocumentHistory } from './useDocumentHistory.js';

// Upload process hooks (for advanced usage)
export { useFileUpload } from './useFileUpload.js';
export { useDocumentProcessing } from './useDocumentProcessing.js';
export { useTrackingCode } from './useTrackingCode.js'; 