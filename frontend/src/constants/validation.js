/**
 * Validation Constants and Patterns
 * 
 * This file contains validation patterns and rules used throughout the application.
 */

// Tracking code validation pattern
// Format: TRK-YYYY-XXXXX (e.g., TRK-2026-00001)
export const TRACKING_CODE_PATTERN = /^[A-Za-z0-9]+-\d{4}-\d{5}$/;

// Email validation pattern
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password validation patterns
export const PASSWORD_PATTERNS = {
  MIN_LENGTH: 8,
  REQUIRE_UPPERCASE: /[A-Z]/,
  REQUIRE_LOWERCASE: /[a-z]/,
  REQUIRE_NUMBER: /\d/,
  REQUIRE_SPECIAL: /[!@#$%^&*(),.?":{}|<>]/,
};

// File validation rules
export const FILE_VALIDATION = {
  MAX_SIZE: 50 * 1024 * 1024, // 50MB (multi-page PDFs commonly exceed 10MB)
  ALLOWED_TYPES: ['application/pdf'],
  ALLOWED_EXTENSIONS: ['.pdf'],
};

// Form validation messages
export const VALIDATION_MESSAGES = {
  REQUIRED: 'This field is required',
  INVALID_EMAIL: 'Please enter a valid email address',
  INVALID_TRACKING_CODE: 'Tracking code must be in format PREFIX-YYYY-XXXXX',
  PASSWORD_TOO_SHORT: `Password must be at least ${PASSWORD_PATTERNS.MIN_LENGTH} characters`,
  PASSWORD_NO_UPPERCASE: 'Password must contain at least one uppercase letter',
  PASSWORD_NO_LOWERCASE: 'Password must contain at least one lowercase letter',
  PASSWORD_NO_NUMBER: 'Password must contain at least one number',
  PASSWORD_NO_SPECIAL: 'Password must contain at least one special character',
  FILE_TOO_LARGE: 'File size must be less than 50MB',
  FILE_TYPE_NOT_ALLOWED: 'Only PDF files can be uploaded.',
  NETWORK_ERROR: 'Network error. Please check your connection and try again',
  UPLOAD_FAILED: 'Upload failed. Please try again',
  PROCESSING_FAILED: 'Document processing failed. Please try again',
};

/**
 * Validate tracking code format
 * 
 * @param {string} trackingCode - The tracking code to validate
 * @returns {boolean} True if the tracking code is valid
 */
export function isValidTrackingCode(trackingCode) {
  return TRACKING_CODE_PATTERN.test(trackingCode);
}

/**
 * Validate email format
 * 
 * @param {string} email - The email to validate
 * @returns {boolean} True if the email is valid
 */
export function isValidEmail(email) {
  return EMAIL_PATTERN.test(email);
}

/**
 * Validate password strength
 * 
 * @param {string} password - The password to validate
 * @returns {object} Validation result with isValid and errors
 */
export function validatePassword(password) {
  const errors = [];
  
  if (password.length < PASSWORD_PATTERNS.MIN_LENGTH) {
    errors.push(VALIDATION_MESSAGES.PASSWORD_TOO_SHORT);
  }
  
  if (!PASSWORD_PATTERNS.REQUIRE_UPPERCASE.test(password)) {
    errors.push(VALIDATION_MESSAGES.PASSWORD_NO_UPPERCASE);
  }
  
  if (!PASSWORD_PATTERNS.REQUIRE_LOWERCASE.test(password)) {
    errors.push(VALIDATION_MESSAGES.PASSWORD_NO_LOWERCASE);
  }
  
  if (!PASSWORD_PATTERNS.REQUIRE_NUMBER.test(password)) {
    errors.push(VALIDATION_MESSAGES.PASSWORD_NO_NUMBER);
  }
  
  if (!PASSWORD_PATTERNS.REQUIRE_SPECIAL.test(password)) {
    errors.push(VALIDATION_MESSAGES.PASSWORD_NO_SPECIAL);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate file for upload
 * 
 * @param {File} file - The file to validate
 * @returns {object} Validation result with isValid and error message
 */
export function validateFile(file) {
  if (!file) {
    return { isValid: false, error: VALIDATION_MESSAGES.REQUIRED };
  }
  
  if (file.size > FILE_VALIDATION.MAX_SIZE) {
    return { isValid: false, error: VALIDATION_MESSAGES.FILE_TOO_LARGE };
  }
  
  const extension = '.' + file.name.split('.').pop().toLowerCase();
  if (!FILE_VALIDATION.ALLOWED_EXTENSIONS.includes(extension)) {
    return { isValid: false, error: VALIDATION_MESSAGES.FILE_TYPE_NOT_ALLOWED };
  }

  const t = file.type && String(file.type).trim().toLowerCase();
  if (t && t !== 'application/pdf') {
    return { isValid: false, error: VALIDATION_MESSAGES.FILE_TYPE_NOT_ALLOWED };
  }

  return { isValid: true, error: null };
} 