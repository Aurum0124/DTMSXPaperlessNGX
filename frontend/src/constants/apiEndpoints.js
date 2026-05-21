/**
 * API Endpoint Constants
 * 
 * This file contains all API endpoint URLs used throughout the application.
 */

// Base API endpoints
export const API_ENDPOINTS = {
  // Document endpoints
  DOCUMENTS: '/api/documents/',
  DOCUMENT_DETAIL: (id) => `/api/documents/${id}/`,
  DOCUMENTS_BULK_EDIT: '/api/documents/bulk_edit/',
  DOCUMENTS_TRASH: '/api/trash/',
  DOCUMENT_THUMBNAIL: (id) => `/api/documents/${id}/thumb/`,
  DOCUMENT_STATUS: (id) => `/api/document-status/${id}`,
  DOCUMENT_ARCHIVE: (id) => `/api/document-archive/${id}`,
  DOCUMENT_ARCHIVE_HANDOFF: (id) => `/api/document-archive/${id}/handoff`,
  /** GET ?document_ids=1,2,3 — Laravel rows; POST marks untracked + syncs Paperless field when configured */
  DOCUMENT_PUBLIC_ROUTE_HIDDEN: '/api/document-public-route-hidden',
  ARCHIVE_CABINETS: '/api/archive-cabinets',
  ARCHIVE_CABINET_DETAIL: (id) => `/api/archive-cabinets/${id}`,
  ARCHIVE_DRAWERS: '/api/archive-drawers',
  ARCHIVE_DRAWER_DETAIL: (id) => `/api/archive-drawers/${id}`,
  ARCHIVE_DRAWER_FOLDERS: (drawerId) => `/api/archive-drawers/${drawerId}/folders`,
  ARCHIVE_FOLDER_DETAIL: (id) => `/api/archive-folders/${id}`,
  ARCHIVE_DRAWER_PLACEMENTS: '/api/archive-drawers/placements',
  ARCHIVE_DRAWER_PLACED_DOCUMENT_IDS: '/api/archive-drawers/placed-document-ids',
  ARCHIVE_DRAWER_FOR_DOCUMENT: (documentId) => `/api/archive-drawers/document/${documentId}`,
  DOCUMENT_SUMMARY: (id) => `/api/document-summary/${id}`,
  POST_DOCUMENT: '/api/documents/post_document/',
  UPLOAD_DOCUMENT: '/api/documents/', // Alternative upload endpoint
  
  // Tag endpoints (Paperless-ngx)
  TAGS: '/api/tags/',

  // Document types (Paperless-ngx native) - GET list, POST create
  DOCUMENT_TYPES: '/api/document_types/',
  DOCUMENT_TYPE_DETAIL: (id) => `/api/document_types/${id}/`,

  // Custom fields (Paperless-ngx)
  CUSTOM_FIELDS: '/api/custom_fields/',

  // Search autocomplete (Paperless-ngx) - GET ?term=...&limit=10
  SEARCH_AUTOCOMPLETE: '/api/search/autocomplete/',

  TRANSFERS_REVERT_RELEASE: '/api/transfers/revert-release',
  TRANSFERS: '/api/transfers',
  /** Laravel: document IDs at this office per transfer history (digital release / receive) */
  TRANSFERS_AT_OFFICE_DOCUMENT_IDS: '/api/transfers/at-office-document-ids',

  // Task endpoints
  TASKS: '/api/tasks/',
  
  // Authentication endpoints (if needed in the future)
  LOGIN: '/api/auth/login/',
  LOGOUT: '/api/auth/logout/',
  USER_PROFILE: '/api/auth/user/',
};

// API request methods
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
};

// API response status codes
export const HTTP_STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};

// Polling intervals (in milliseconds)
export const POLLING_INTERVALS = {
  TASK_POLLING: 2000,      // 2 seconds for task status
  DOCUMENT_POLLING: 2000,  // 2 seconds for document processing
  CONNECTION_CHECK: 5000,  // 5 seconds for connection status
};

// Processing timeouts for documents (multi-page PDFs take longer for OCR)
export const PROCESSING_TIMEOUTS = {
  TASK_POLLING_MS: 15 * 60 * 1000,    // 15 minutes for task completion
  DOCUMENT_POLLING_MS: 15 * 60 * 1000, // 15 minutes for document ready
  TASK_POLL_MAX_COUNT: 450,            // 15 min at 2s intervals
  DOCUMENT_POLL_MAX_COUNT: 450,        // 15 min at 2s intervals
};

// API timeout settings (in milliseconds)
export const API_TIMEOUTS = {
  DEFAULT: 30000,          // 30 seconds
  UPLOAD: 60000,           // 60 seconds for file uploads
  POLLING: 10000,          // 10 seconds for polling requests
}; 