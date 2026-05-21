/**
 * useDocumentHistory Hook
 *
 * Manages document history fetching, filtering, and formatting.
 * Merges Paperless history (status, tracking code, assigned to) with
 * Laravel document_transfers (released from, received at, release undone).
 *
 * @param {string|number|null} documentId - Paperless document ID
 * @param {{ tagMap?: Record<number, string>, allTags?: Array<{id: number, name: string}> }} options - Optional cached tags to skip /api/tags/ fetch
 */

import { useState, useEffect, useRef } from 'react';
import { apiCall } from '../services/api.js';

const HIDDEN_VIEWER_HISTORY_CUSTOM_FIELDS = new Set(['document copy state']);

export function useDocumentHistory(documentId, { tagMap: tagMapProp, allTags, refreshTrigger } = {}) {
  const [history, setHistory] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [endorsements, setEndorsements] = useState([]);
  const [endorsementProgress, setEndorsementProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);
  const tagsRef = useRef(tagMapProp ?? allTags);
  tagsRef.current = tagMapProp ?? allTags;

  useEffect(() => {
    if (!documentId) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiCall(`/api/document-history/${documentId}`);
        const tags = tagsRef.current;
        const tagMap = (typeof tags === 'object' && tags !== null && !Array.isArray(tags))
          ? tags
          : buildTagMap(Array.isArray(tags) ? tags : []);
        const paperlessList = data?.paperlessHistory ?? [];
        const transfers = data?.transfers ?? [];
        const statusChanges = data?.statusChanges ?? [];
        const notes = data?.notes ?? [];
        const endorsements = data?.endorsements ?? [];
        let paperlessEntries = filterEssentialHistory(paperlessList);
        paperlessEntries = excludeAssignsDuplicatedByReceive(paperlessEntries, transfers, tagMap);
        paperlessEntries = excludeAssignsDuplicatedByRevertRelease(paperlessEntries, transfers, tagMap);
        paperlessEntries = excludeStatusDuplicatedByAudit(paperlessEntries, statusChanges);
        const transferEntries = transfers.map((t) => transferToTimelineEntry(t, tagMap));
        const statusEntries = statusChanges.map((s) => statusChangeToTimelineEntry(s));
        const noteEntries = notes.map((n) => noteToTimelineEntry(n));
        const endorsementEntries = endorsements.map((e) => endorsementToTimelineEntry(e, tagMap));

        const merged = mergeAndSort(paperlessEntries, transferEntries, statusEntries, noteEntries, endorsementEntries);
        setHistory(merged);
        setTransfers(transfers);
        setEndorsements(endorsements);
        setEndorsementProgress(data?.endorsementProgress ?? null);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Error fetching document history:', err);
          setError('Failed to load document history');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [documentId, refreshTrigger]);

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActionText = (entry) => {
    if ((entry.source === 'transfer' || entry.source === 'status_change' || entry.source === 'note' || entry.source === 'endorsement') && entry.displayText) {
      return entry.displayText;
    }
    const { action, changes } = entry;
    switch (action) {
      case 'update':
        if (changes?.custom_fields) {
          const field = changes.custom_fields.field;
          if (HIDDEN_VIEWER_HISTORY_CUSTOM_FIELDS.has(String(field || '').trim().toLowerCase())) {
            return null;
          }
          if (field === 'Document Status') {
            return `Status: ${changes.custom_fields.value}`;
          }
          if (field === 'Tracking Code') {
            return `Tracking Code: ${changes.custom_fields.value}`;
          }
          return `${field} Updated`;
        }
        if (changes?.tags) {
          if (changes.tags.operation === 'add' && changes.tags.objects?.length > 0) {
            return `Assigned to: ${changes.tags.objects[0]}`;
          }
          return null;
        }
        return 'Document Updated';
      default:
        return action ? action.charAt(0).toUpperCase() + action.slice(1) : '';
    }
  };

  return {
    history,
    transfers,
    endorsements,
    endorsementProgress,
    loading,
    error,
    formatTimestamp,
    getActionText,
  };
}

function buildTagMap(tagsRes) {
  const results = tagsRes?.results ?? (Array.isArray(tagsRes) ? tagsRes : []);
  const map = {};
  for (const t of results) {
    const id = t?.id ?? t?.pk;
    if (id != null) map[id] = t?.name ?? String(t);
  }
  return map;
}

function noteToTimelineEntry(n) {
  const who = n.user_name ? ` by ${n.user_name}` : '';
  const rawId = typeof n.id === 'string' ? n.id.replace(/^note_/, '') : n.id;
  return {
    id: n.id,
    noteId: rawId ? parseInt(rawId, 10) : null,
    user_id: n.user_id ?? null,
    tag_id: n.tag_id ?? null,
    timestamp: n.created_at,
    source: 'note',
    displayText: `Note${who}`,
    noteText: n.note,
  };
}

function statusChangeToTimelineEntry(change) {
  const who = change.user_name ? ` by ${change.user_name}` : '';
  const remarks = change.remarks?.trim();
  const rawId = typeof change.id === 'string' ? change.id.replace(/^status_/, '') : change.id;
  return {
    id: change.id,
    statusChangeId: rawId ? parseInt(rawId, 10) : null,
    tag_id: change.tag_id,
    timestamp: change.created_at,
    source: 'status_change',
    displayText: `Status: ${change.to_status}${who}`,
    noteText: remarks || undefined,
  };
}

function endorsementToTimelineEntry(e, tagMap) {
  const officeName = e.tag_id ? (tagMap[e.tag_id] ?? `Office #${e.tag_id}`) : 'Unknown';
  const rawId = typeof e.id === 'string' ? e.id.replace(/^endorsement_/, '') : e.id;
  return {
    id: e.id,
    endorsementId: rawId ? parseInt(rawId, 10) : null,
    tag_id: e.tag_id,
    timestamp: e.created_at,
    source: 'endorsement',
    displayText: `Endorsed by ${officeName}`,
    noteText: e.remarks?.trim() || undefined,
  };
}

function namesMatchForDisplay(a, b) {
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function transferToTimelineEntry(transfer, tagMap) {
  const timestamp = transfer.created_at;
  const by = transfer.user_name?.trim();
  let displayText = '';
  if (transfer.type === 'release' || transfer.type === 'digital_release') {
    const name = transfer.from_tag_id ? (tagMap[transfer.from_tag_id] ?? `Office #${transfer.from_tag_id}`) : 'Unknown';
    displayText = transfer.type === 'digital_release'
      ? `Digitally released from ${name}`
      : `Released from ${name}`;
  } else if (transfer.type === 'revert_release') {
    const name = transfer.from_tag_id ? (tagMap[transfer.from_tag_id] ?? `Office #${transfer.from_tag_id}`) : 'Unknown';
    displayText = `Release undone — document back at ${name}`;
  } else if (transfer.type === 'archive_release') {
    const fromName = transfer.from_tag_id ? (tagMap[transfer.from_tag_id] ?? `Office #${transfer.from_tag_id}`) : 'Unknown';
    const seq = transfer.route_sequence;
    const toId = Array.isArray(seq) && seq.length > 0 ? seq[0] : null;
    const toName = toId != null ? (tagMap[toId] ?? `Office #${toId}`) : 'another office';
    displayText =
      toId != null
        ? `Sent to ${toName} for archiving (from ${fromName})`
        : `Sent for archiving (from ${fromName})`;
  } else if (transfer.type === 'receive') {
    const name = transfer.to_tag_id ? (tagMap[transfer.to_tag_id] ?? `Office #${transfer.to_tag_id}`) : 'Unknown';
    if (transfer.received_at_wrong_office) {
      const redundantWho = by && namesMatchForDisplay(by, name);
      displayText = by && !redundantWho
        ? `Document wrongly forwarded to ${name} (${by}). Please forward to next office.`
        : `Document wrongly forwarded to ${name}. Please forward to next office.`;
    } else {
      const showBy = by && !namesMatchForDisplay(by, name);
      const suffix = showBy ? ` by ${by}` : '';
      displayText = `Received at ${name}${suffix}`;
    }
  } else {
    displayText = 'Transfer';
  }
  return {
    id: transfer.id,
    timestamp,
    source: 'transfer',
    displayText,
  };
}

/**
 * After undo release we PATCH tags in Paperless (new "Assigned to"). Laravel also logs
 * revert_release ("Release undone…"). Drop only that redundant assign.
 *
 * Do not use symmetric time windows: `abs(entry - revert) < 3min` wrongly removes the *original*
 * assign when upload → release → revert happens within a few minutes (same office tag).
 * Only strip tag-adds that occur at/after the revert moment (Paperless may log a few seconds early).
 */
function excludeAssignsDuplicatedByRevertRelease(paperlessEntries, transfers, tagMap) {
  const reverts = transfers.filter((t) => t.type === 'revert_release');
  if (reverts.length === 0) return paperlessEntries;

  const nameToId = {};
  for (const [id, name] of Object.entries(tagMap)) {
    if (name) nameToId[String(name).toLowerCase()] = parseInt(id, 10);
  }

  const PRE_MS = 8000; // Paperless row may precede Laravel `revert_release` slightly
  const POST_MS = 180000; // tag restore can lag
  return paperlessEntries.filter((entry) => {
    if (entry.changes?.tags?.operation !== 'add' || !entry.changes.tags.objects?.length) {
      return true;
    }
    const raw = entry.changes.tags.objects[0];
    const tagId =
      typeof raw === 'number' ? raw : (nameToId[String(raw || '').toLowerCase()] ?? null);
    if (tagId == null) return true;

    const entryTime = new Date(entry.timestamp).getTime();
    const isRedundantRestore = reverts.some((r) => {
      if (r.from_tag_id == null) return false;
      if (Number(r.from_tag_id) !== Number(tagId)) return false;
      const rTime = new Date(r.created_at).getTime();
      return entryTime >= rTime - PRE_MS && entryTime <= rTime + POST_MS;
    });
    return !isRedundantRestore;
  });
}

/**
 * Remove Paperless "Assigned to" entries that duplicate a "Received at" transfer.
 * When we receive, we PATCH tags in Paperless (logged as tag add) AND log to Laravel.
 * We only want to show "Received at X", not also "Assigned to: X".
 */
function excludeAssignsDuplicatedByReceive(paperlessEntries, transfers, tagMap) {
  const receiveTransfers = transfers.filter((t) => t.type === 'receive');
  if (receiveTransfers.length === 0) return paperlessEntries;

  const nameToId = {};
  for (const [id, name] of Object.entries(tagMap)) {
    if (name) nameToId[String(name).toLowerCase()] = parseInt(id, 10);
  }

  const MS_SLOP = 120000; // 2 minutes
  return paperlessEntries.filter((entry) => {
    if (entry.changes?.tags?.operation !== 'add' || !entry.changes.tags.objects?.length) {
      return true; // Keep non-tag-add entries
    }
    const raw = entry.changes.tags.objects[0];
    const tagId =
      typeof raw === 'number' ? raw : (nameToId[String(raw || '').toLowerCase()] ?? null);
    if (tagId == null) return true;

    const entryTime = new Date(entry.timestamp).getTime();
    const isDuplicate = receiveTransfers.some((r) => {
      if (r.to_tag_id !== tagId) return false;
      const rTime = new Date(r.created_at).getTime();
      return Math.abs(entryTime - rTime) < MS_SLOP;
    });
    return !isDuplicate;
  });
}

/** Paperless tag-add on create/update: operation is usually 'add'; some versions omit it on create. */
function isPaperlessTagAssignChange(tags) {
  if (!tags?.objects?.length) return false;
  const op = tags.operation;
  return op === 'add' || op == null || op === '';
}

function filterEssentialHistory(historyData) {
  const essentialEntries = historyData.filter((entry) => {
    if (entry.action === 'create') {
      if (isPaperlessTagAssignChange(entry.changes?.tags)) return true;
      return false;
    }
    if (entry.changes?.custom_fields) {
      const field = String(entry.changes.custom_fields.field || '').trim().toLowerCase();
      if (HIDDEN_VIEWER_HISTORY_CUSTOM_FIELDS.has(field)) return false;
      return true;
    }
    if (entry.changes?.tags) {
      if (entry.changes.tags.operation === 'add' && entry.changes.tags.objects?.length > 0) {
        return true;
      }
      return false;
    }
    return false;
  });

  const uniqueEntries = [];
  const seenKeys = new Set();

  for (const entry of essentialEntries) {
    let key = '';
    if (entry.changes?.custom_fields) {
      const field = entry.changes.custom_fields.field;
      const value = entry.changes.custom_fields.value;
      key = `CUSTOM_FIELD_${field}_${value}_${entry.timestamp || Date.now()}`;
    } else if (entry.changes?.tags) {
      const department = entry.changes.tags.objects?.[0] || 'UNKNOWN_DEPARTMENT';
      key = `TAG_${department}_${entry.timestamp}`;
    }
    if (key && !seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueEntries.push({ ...entry, source: 'paperless' });
    }
  }

  return uniqueEntries;
}

const AUDIT_STATUS_VALUES = ['Under Review', 'Needs Action', 'Approved', 'Rejected', 'For Archiving', 'Archived'];

/**
 * Remove Paperless status-change entries that duplicate an audit trail entry.
 * Status changes go through Laravel now; we show the audit record instead.
 */
function excludeStatusDuplicatedByAudit(paperlessEntries, statusChanges) {
  if (statusChanges.length === 0) return paperlessEntries;
  const MS_SLOP = 60000; // 1 minute
  const statusTimes = statusChanges.map((s) => ({
    time: new Date(s.created_at).getTime(),
    toStatus: s.to_status,
  }));

  return paperlessEntries.filter((entry) => {
    const cf = entry.changes?.custom_fields;
    if (!cf) return true;
    const value = cf.value;
    if (!value || !AUDIT_STATUS_VALUES.includes(value)) return true;
    const entryTime = new Date(entry.timestamp || 0).getTime();
    const isDuplicate = statusTimes.some(
      (st) => st.toStatus === value && Math.abs(entryTime - st.time) < MS_SLOP
    );
    return !isDuplicate;
  });
}

function mergeAndSort(paperlessEntries, transferEntries, statusEntries = [], noteEntries = [], endorsementEntries = []) {
  const combined = [
    ...paperlessEntries.map((e) => ({ ...e, timestamp: e.timestamp })),
    ...transferEntries,
    ...statusEntries,
    ...noteEntries,
    ...endorsementEntries,
  ];
  return combined
    .filter((e) => e.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}
