/**
 * Department Constants
 * 
 * This file contains all department-related constants used throughout the application.
 * These should eventually be fetched from the backend API instead of being hardcoded.
 */

// List of all department codes
export const HARDCODED_USERS = [
  'pgin-receiving',    // Receiving Office
  'pgin-hr',          // Human Resource Department
  'pgin-oba',         // Office of Barangay Affairs
  'pgin-govoffice',   // Governor's Office
];

// Mapping of department codes to display names
export const USER_TAG_MAP = {
  'pgin-receiving': 'PGIN - Receiving Office',
  'pgin-hr': 'PGIN - Human Resource',
  'pgin-oba': 'PGIN - Office of Barangay Affairs',
  'pgin-govoffice': 'PGIN - Office of the Governor',
};

// Mapping of department codes to tag IDs and names
export const USER_TAG_ID_MAP = {
  'pgin-hr': { id: 2, name: 'PGIN - Human Resource' },
  'pgin-oba': { id: 3, name: 'PGIN - Office of Barangay Affairs' },
  'pgin-govoffice': { id: 4, name: 'PGIN - Office of the Governor' },
  'pgin-receiving': { id: 1, name: 'PGIN - Receiving Office' },
};

// Custom field IDs used in the application
export const CUSTOM_FIELD_IDS = {
  TRACKING_CODE: 1,    // Default field ID for tracking code (fallback)
  STATUS: 3,          // Field ID for document status
};

const TRACKING_CODE_FIELD_STORAGE_KEY = 'pgin_tracking_code_field_id';

/**
 * Get the tracking code custom field ID (dynamic, set when admin enables feature).
 * Returns null if not configured - avoids invalid IDs on fresh Paperless installs.
 */
export function getTrackingCodeFieldId() {
  const stored = localStorage.getItem(TRACKING_CODE_FIELD_STORAGE_KEY);
  const num = stored ? parseInt(stored, 10) : NaN;
  return Number.isNaN(num) ? null : num;
}

/**
 * Store the tracking code field ID (called when admin creates the field)
 */
export function setTrackingCodeFieldId(id) {
  localStorage.setItem(TRACKING_CODE_FIELD_STORAGE_KEY, String(id));
}

// Document status options
export const DOCUMENT_STATUSES = {
  UNDER_REVIEW: 'Under Review',
  NEEDS_ACTION: 'Needs Action',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  FOR_ARCHIVING: 'For Archiving',
  ARCHIVED: 'Archived',
  /** Display label on tracker when status is Approved or Rejected */
  ACTION_TAKEN: 'Action Taken',
};

// Default status for new documents
export const DEFAULT_DOCUMENT_STATUS = DOCUMENT_STATUSES.UNDER_REVIEW; 