/**
 * Constants Index
 * 
 * This file exports all constants from a single location for easier imports.
 * Import constants like: import { COLORS, API_ENDPOINTS } from '../constants';
 */

// Department constants
export * from './departments.js';

// File type constants and utilities
export * from './fileTypes.js';

// API endpoint constants
export * from './apiEndpoints.js';

// UI constants
export * from './uiConstants.js';

// Validation constants and patterns
export * from './validation.js';

// Configuration (re-export from config.js)
export { API_CONFIG, SESSION_KEYS } from '../config.js'; 