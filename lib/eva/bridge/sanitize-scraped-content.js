/**
 * sanitizeScrapedContent — Strip injection patterns from scraped content
 *
 * SD: SD-ENRICH-STITCH-PROMPTS-WITH-ORCH-001-B
 *
 * Treats all scraped content (from srip_site_dna) as untrusted.
 * Strips HTML tags, script injection, prompt override attempts,
 * and other dangerous patterns before inclusion in Stitch prompts.
 *
 * @module lib/eva/bridge/sanitize-scraped-content
 */

const INJECTION_PATTERNS = [
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /<[^>]+>/g,
  /ignore\s+(all\s+)?previous\s+instructions/gi,
  /you\s+are\s+now\s+a/gi,
  /system\s*:\s*/gi,
  /assistant\s*:\s*/gi,
  /\[INST\]/gi,
  /<<SYS>>/gi,
  /\bprompt\s*injection\b/gi,
  /forget\s+(everything|all|your|the)\s+(above|previous|prior)/gi,
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
  /[\u200B-\u200F\u2028-\u202F\uFEFF]/g,
  /```[\s\S]*?```/g,
  /---+/g,
];

const MAX_FIELD_LENGTH = 500;

export function sanitizeString(value) {
  if (typeof value !== 'string') return '';
  let clean = value;
  for (const pattern of INJECTION_PATTERNS) {
    clean = clean.replace(pattern, '');
  }
  clean = clean.replace(/\s+/g, ' ').trim();
  if (clean.length > MAX_FIELD_LENGTH) {
    clean = clean.slice(0, MAX_FIELD_LENGTH) + '...';
  }
  return clean;
}

export function sanitizeArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(item => {
      if (typeof item === 'string') return sanitizeString(item);
      if (item && typeof item === 'object') {
        const sanitized = {};
        for (const [key, val] of Object.entries(item)) {
          sanitized[key] = typeof val === 'string' ? sanitizeString(val) : val;
        }
        return sanitized;
      }
      return item;
    })
    .filter(item => item !== '' && item != null);
}

export function sanitizeScrapedContent(dnaJson) {
  if (!dnaJson || typeof dnaJson !== 'object') return {};
  const sanitized = {};

  if (dnaJson.colors) {
    sanitized.colors = sanitizeArray(
      Array.isArray(dnaJson.colors) ? dnaJson.colors : [dnaJson.colors]
    );
  }
  if (dnaJson.typography || dnaJson.fonts) {
    sanitized.fonts = sanitizeArray(
      Array.isArray(dnaJson.typography || dnaJson.fonts)
        ? (dnaJson.typography || dnaJson.fonts)
        : [dnaJson.typography || dnaJson.fonts]
    );
  }
  if (dnaJson.spacing) {
    sanitized.spacing = sanitizeString(
      typeof dnaJson.spacing === 'string' ? dnaJson.spacing : JSON.stringify(dnaJson.spacing)
    );
  }
  if (dnaJson.personality) {
    sanitized.personality = sanitizeString(dnaJson.personality);
  }

  return sanitized;
}
