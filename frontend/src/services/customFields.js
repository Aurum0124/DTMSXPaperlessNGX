/**
 * Custom Fields Service - Resolves Paperless-ngx custom field IDs by name
 *
 * On a fresh Paperless install, custom field IDs differ. This fetches from API.
 */

import { apiCall } from './api.js';
import { API_ENDPOINTS } from '../constants/apiEndpoints.js';
import { getTrackingCodeFieldId, setTrackingCodeFieldId } from '../constants/departments.js';

const STATUS_FIELD_NAME = 'Document Status';
const TRACKING_CODE_FIELD_NAME = 'Tracking Code';
const COPY_STATE_FIELD_NAME = 'Document Copy State';
const SUBMITTED_BY_FIELD_NAME = 'Submitted By';
/** Matches Laravel DocumentStatusController ARCHIVING_FIELD_NAMES (Paperless custom field label). */
const ARCHIVING_FIELD_NAMES = ['archiving', 'archive status'];

/** Matches Laravel DocumentPublicRouteHiddenController — select field; value "Untracked" when opted out of public tracker. */
const PUBLIC_TRACKING_FIELD_NAMES = ['public tracking'];

let cachedFields = null;

export async function fetchCustomFields() {
  if (cachedFields) return cachedFields;
  try {
    const data = await apiCall(API_ENDPOINTS.CUSTOM_FIELDS);
    const results = data?.results ?? (Array.isArray(data) ? data : data ? [data] : []);
    cachedFields = Array.isArray(results) ? results : [];
    return cachedFields;
  } catch (err) {
    console.warn('Failed to fetch custom fields:', err);
    return [];
  }
}

export async function getStatusFieldId() {
  const fields = await fetchCustomFields();
  const f = fields.find((x) => (x.name || '').toLowerCase() === STATUS_FIELD_NAME.toLowerCase());
  return f?.id ?? f?.pk ?? null;
}

export async function getArchivingFieldIdAsync() {
  const fields = await fetchCustomFields();
  const f = fields.find((x) =>
    ARCHIVING_FIELD_NAMES.includes(String(x.name || '').toLowerCase().trim())
  );
  return f?.id ?? f?.pk ?? null;
}

/** Exact field name for Paperless `custom_field_query` (first element of the triplet). */
export async function getArchivingFieldQueryName() {
  const fields = await fetchCustomFields();
  const f = fields.find((x) =>
    ARCHIVING_FIELD_NAMES.includes(String(x.name || '').toLowerCase().trim())
  );
  const name = f?.name;
  return name != null && String(name).trim() ? String(name).trim() : null;
}

export async function getPublicTrackingFieldIdAsync() {
  const fields = await fetchCustomFields();
  const f = fields.find((x) =>
    PUBLIC_TRACKING_FIELD_NAMES.includes(String(x.name || '').toLowerCase().trim())
  );
  return f?.id ?? f?.pk ?? null;
}

export async function getTrackingCodeFieldIdAsync() {
  const stored = getTrackingCodeFieldId();
  const fields = await fetchCustomFields();
  const storedExists = stored && fields.some((x) => (x.id ?? x.pk) === stored);
  if (storedExists) return stored;
  const tc = fields.find((x) => (x.name || '').toLowerCase() === TRACKING_CODE_FIELD_NAME.toLowerCase());
  const id = tc?.id ?? tc?.pk ?? null;
  if (id) setTrackingCodeFieldId(id);
  return id;
}

export async function getCopyStateFieldIdAsync() {
  const fields = await fetchCustomFields();
  const f = fields.find((x) => (x.name || '').toLowerCase() === COPY_STATE_FIELD_NAME.toLowerCase());
  return f?.id ?? f?.pk ?? null;
}

export async function getSubmittedByFieldIdAsync() {
  const fields = await fetchCustomFields();
  const f = fields.find((x) => (x.name || '').toLowerCase() === SUBMITTED_BY_FIELD_NAME.toLowerCase());
  return f?.id ?? f?.pk ?? null;
}

/** Merge Paperless custom field updates without dropping existing fields on PATCH. */
export function mergeCustomFieldUpdates(existingFields, updates) {
  const map = new Map();
  (existingFields || []).forEach((f) => {
    const fieldId = f.field ?? f;
    if (fieldId == null) return;
    map.set(Number(fieldId), { field: fieldId, value: f.value });
  });
  (updates || []).forEach((u) => {
    if (u?.field == null) return;
    map.set(Number(u.field), { field: u.field, value: u.value });
  });
  return Array.from(map.values());
}

export function clearCustomFieldsCache() {
  cachedFields = null;
}
