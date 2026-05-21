/**
 * File Type Constants and Utilities
 * 
 * This file contains file type-related constants and utility functions.
 */

// Supported file extensions for upload
export const SUPPORTED_FILE_EXTENSIONS = ['.pdf'];

// File type categories
export const FILE_TYPE_CATEGORIES = {
  DOCUMENTS: ['pdf'],
  SPREADSHEETS: [],
  PRESENTATIONS: [],
  IMAGES: [],
  ARCHIVES: [],
};

// Maximum file size in bytes (10MB)
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Maximum file size in MB for display
export const MAX_FILE_SIZE_MB = 10;

/**
 * Get the appropriate label for a file type based on its extension
 *
 * @param {string} filename - The filename to get the label for
 * @returns {string} The uppercase extension for the file type
 */
export function getFileTypeIcon(filename = '') {
  const ext = filename.split('.').pop().toLowerCase();
  if (!ext) return '';
  return ext.toUpperCase();
}

/**
 * Check if a file type is supported for upload
 * 
 * @param {string} filename - The filename to check
 * @returns {boolean} True if the file type is supported
 */
export function isSupportedFileType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return SUPPORTED_FILE_EXTENSIONS.includes(`.${ext}`);
}

/**
 * Get the file extension from a filename
 * 
 * @param {string} filename - The filename
 * @returns {string} The file extension (without the dot)
 */
export function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

/**
 * Format file size in human-readable format
 * 
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size (e.g., "1.5 MB")
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
} 