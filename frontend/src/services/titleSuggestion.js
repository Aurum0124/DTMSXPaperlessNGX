/**
 * Title suggestion from OCR content
 * Extracts a suggested title from document content (first line or first N chars).
 */

const MAX_TITLE_LENGTH = 80;

/**
 * Suggest a title from OCR content.
 * Uses first non-empty line, truncated to MAX_TITLE_LENGTH.
 * @param {string} content - Plain text OCR content
 * @param {string} fallback - Fallback if content is empty
 * @returns {string} Suggested title
 */
export function suggestTitleFromContent(content, fallback = '') {
  if (!content || typeof content !== 'string') return fallback;
  const trimmed = content.trim();
  if (!trimmed) return fallback;

  // First non-empty line
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] || trimmed;
  const candidate = firstLine.length > MAX_TITLE_LENGTH
    ? firstLine.slice(0, MAX_TITLE_LENGTH).trim()
    : firstLine;

  return candidate || fallback;
}
