/**
 * Prompt Brief Validator
 * Validates sub-agent prompts contain Five-Point Brief fields.
 * Advisory mode only — warns but does not block execution.
 *
 * SD-LEO-INFRA-SUB-AGENT-EXECUTION-001-A (FR-001, FR-003)
 */

const BRIEF_FIELDS = [
  { key: 'symptom', patterns: [/symptom/i, /what\s+is\s+happening/i, /observed\s+behavior/i] },
  { key: 'location', patterns: [/location/i, /file[s]?\s*[:/]/i, /endpoint/i, /table/i] },
  { key: 'frequency', patterns: [/frequency/i, /pattern/i, /timing/i, /how\s+often/i, /always|intermittent|once/i] },
  { key: 'prior_attempts', patterns: [/prior\s+attempts?/i, /already\s+tried/i, /previous(ly)?\s+(tried|attempted)/i] },
  { key: 'desired_outcome', patterns: [/desired\s+outcome/i, /success\s+criteria/i, /expected\s+(result|behavior|outcome)/i] },
];

/**
 * Validate a prompt for Five-Point Brief fields.
 * Returns { valid, missing, present, score }.
 *
 * @param {string} prompt - The sub-agent prompt text
 * @returns {{ valid: boolean, missing: string[], present: string[], score: number }}
 */
export function validateBrief(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { valid: false, missing: BRIEF_FIELDS.map(f => f.key), present: [], score: 0 };
  }

  const present = [];
  const missing = [];

  for (const field of BRIEF_FIELDS) {
    const found = field.patterns.some(p => p.test(prompt));
    if (found) {
      present.push(field.key);
    } else {
      missing.push(field.key);
    }
  }

  const score = present.length / BRIEF_FIELDS.length;
  return { valid: missing.length === 0, missing, present, score };
}

/**
 * Build an RCA-specific brief template pre-filled from error context.
 * FR-003: Pre-fills Symptom, Location, Prior attempts from available data.
 *
 * @param {Object} errorContext
 * @param {string} [errorContext.errorMessage] - The error/failure message
 * @param {string} [errorContext.filePath] - File where error occurred
 * @param {number} [errorContext.retryCount] - Number of retries attempted
 * @param {string} [errorContext.sdId] - Strategic Directive ID
 * @returns {string} Pre-filled brief template section
 */
export function buildRcaBriefTemplate(errorContext = {}) {
  const symptom = errorContext.errorMessage || '<describe what IS happening>';
  const location = errorContext.filePath || '<file/endpoint/table>';
  const retries = errorContext.retryCount ?? 0;
  const priorAttempts = retries > 0
    ? `Retried ${retries} time(s) without resolution`
    : '<what you already tried>';

  return [
    '--- Five-Point Brief (RCA) ---',
    `Symptom: ${symptom}`,
    `Location: ${location}`,
    'Frequency: Observed during current execution',
    `Prior attempts: ${priorAttempts}`,
    'Desired outcome: Root cause identified with corrective action',
    '--- End Brief ---',
  ].join('\n');
}

/**
 * Build a generic brief template enriched with SD/PRD context.
 * FR-002: Auto-fills available fields from resolved SD data.
 *
 * @param {Object} sdContext
 * @param {string} [sdContext.sdKey] - SD key
 * @param {string} [sdContext.phase] - Current phase
 * @param {string[]} [sdContext.targetFiles] - Target files from PRD
 * @param {string[]} [sdContext.missingFields] - Which brief fields are missing
 * @returns {string} Brief template section to inject
 */
export function buildBriefTemplate(sdContext = {}) {
  const lines = ['--- Five-Point Brief ---'];

  const defaults = {
    symptom: '<describe what IS happening>',
    location: sdContext.targetFiles?.length
      ? `Files: ${sdContext.targetFiles.slice(0, 3).join(', ')}`
      : '<file/endpoint/table>',
    frequency: '<pattern/timing>',
    prior_attempts: '<what you already tried>',
    desired_outcome: '<clear success criteria>',
  };

  const missing = sdContext.missingFields || Object.keys(defaults);

  for (const field of BRIEF_FIELDS) {
    if (missing.includes(field.key)) {
      const label = field.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      lines.push(`${label}: ${defaults[field.key]}`);
    }
  }

  if (sdContext.sdKey) {
    lines.push(`Context: SD ${sdContext.sdKey}${sdContext.phase ? ` (${sdContext.phase} phase)` : ''}`);
  }

  lines.push('--- End Brief ---');
  return lines.join('\n');
}
