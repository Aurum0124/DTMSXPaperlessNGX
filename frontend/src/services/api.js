// API utility functions for Paperless-ngx and backend
import { API_CONFIG } from '../config.js';
import { sessionManager } from './session.js';

export async function apiCall(url, options = {}) {
  const fullUrl = url.startsWith('http') ? url : API_CONFIG.BASE_URL + url;
  const headers = options.headers || {};
  // Laravel routes: don't send Paperless token; add Bearer token for protected routes
  const isLaravelRoute = url.includes('/api/auth/') || url.includes('/api/transfers') || url.includes('/api/document-history/') || url.includes('/api/document-status') || url.includes('/api/document-archive') || url.includes('/api/archive-cabinets') || url.includes('/api/archive-drawers') || url.includes('/api/archive-folders') || url.includes('/api/document-comments') || url.includes('/api/document-endorsements') || url.includes('/api/needs-action-badge') || url.includes('/api/tracker/') || url.includes('/api/admin/') || url.includes('/api/employees') || url.includes('/api/route-templates') || url.includes('/api/document-summary') || url.includes('/api/document-public-route-hidden');
  const isAuthLogin = url.includes('/api/auth/login');
  let mergedHeaders = isLaravelRoute
    ? { 'Content-Type': 'application/json', 'Accept': 'application/json', ...headers }
    : { ...API_CONFIG.HEADERS, ...headers };
  if (isLaravelRoute && !isAuthLogin) {
    const token = sessionManager.getAuthToken?.();
    if (token) mergedHeaders.Authorization = `Bearer ${token}`;
  }
  mergedHeaders = Object.fromEntries(Object.entries(mergedHeaders).filter(([, v]) => v !== undefined));

  // If uploading FormData, remove Content-Type so browser sets it
  if (options.body instanceof FormData) {
    const { ['Content-Type']: _, ...headersWithoutContentType } = mergedHeaders;
    mergedHeaders = headersWithoutContentType;
  }

  const fetchOptions = {
    ...options,
    headers: mergedHeaders,
    credentials: 'include',
  };

  const response = await fetch(fullUrl, fetchOptions);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('API Error:', response.status, response.statusText, errorText);
    let msg = errorText || response.statusText;
    try {
      const errJson = JSON.parse(errorText);
      msg = errJson.error || errJson.message || msg;
    } catch {
      /* not JSON */
    }
    if (response.status === 401) throw new Error(msg || 'Authentication failed.');
    if (response.status === 403) throw new Error(msg || 'Access denied.');
    if (response.status === 404) throw new Error(msg || 'Endpoint not found.');
    if (response.status === 405) throw new Error(msg || 'Method not allowed.');
    if (response.status === 400) throw new Error(msg);
    throw new Error(msg || response.statusText);
  }
  
  // Read body once (response body can only be consumed once)
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

export async function testApiConnection() {
  try {
    await apiCall('/api/documents/?page_size=1');
    return true;
  } catch {
    return false;
  }
} 