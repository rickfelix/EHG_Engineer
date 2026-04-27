/**
 * Decision-log envelope formatter v1.0.
 * SD: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A
 *
 * Per TR-1: each decision-log entry is serialized as a fenced
 * ```eva-decision-log JSON block embedded in a Todoist comment.
 *
 * Schema is additive-only. Phase B's decision_log table will read v1.0
 * verbatim or ship a forward migration — never silently mutate.
 */

import { FLOWS } from './_internal/system-prompt.js';

export const ENVELOPE_VERSION = '1.0';
export const FENCE_LANG = 'eva-decision-log';

export const REQUIRED_FIELDS = [
  'schema_version',
  'task_id',
  'sequence',
  'timestamp',
  'flow',
  'eva_reply_summary',
  'operator_input_summary',
  'override_reason',
  'model',
  'tokens_in',
  'tokens_out',
  'references',
];

const SUMMARY_MAX = 500;

function truncateSummary(s) {
  if (s == null) return '';
  const text = String(s);
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text;
}

/**
 * Build a decision-log entry object (validated).
 */
export function buildEntry({
  task_id,
  sequence,
  flow,
  eva_reply,
  operator_input,
  override_reason = null,
  model,
  tokens_in = 0,
  tokens_out = 0,
  references = [],
  timestamp = new Date().toISOString(),
}) {
  if (!task_id) throw new Error('task_id is required');
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('sequence must be a positive integer');
  if (!FLOWS.includes(flow)) throw new Error(`flow must be one of ${FLOWS.join(', ')} (got: ${flow})`);
  if (!model) throw new Error('model is required');

  return {
    schema_version: ENVELOPE_VERSION,
    task_id,
    sequence,
    timestamp,
    flow,
    eva_reply_summary: truncateSummary(eva_reply),
    operator_input_summary: truncateSummary(operator_input),
    override_reason: override_reason || null,
    model,
    tokens_in,
    tokens_out,
    references: Array.isArray(references) ? references : [],
  };
}

/**
 * Serialize an entry into a Todoist comment body (markdown summary + fenced JSON).
 */
export function serialize(entry) {
  const validated = validate(entry);
  if (!validated.valid) throw new Error(`Invalid entry: ${validated.errors.join('; ')}`);

  const overrideTag = entry.override_reason ? ` [OVERRIDE: ${entry.override_reason}]` : '';
  const header = `EVA #${entry.sequence} — ${entry.flow}${overrideTag}`;
  const json = JSON.stringify(entry, null, 2);

  return `${header}\n\n\`\`\`${FENCE_LANG}\n${json}\n\`\`\``;
}

/**
 * Parse a Todoist comment body and extract the decision-log entry, if present.
 * Returns null when no fenced block is found.
 */
export function parse(commentBody) {
  if (typeof commentBody !== 'string') return null;
  const fence = new RegExp(`\\\`\\\`\\\`${FENCE_LANG}\\s*\\n([\\s\\S]*?)\\n\\\`\\\`\\\``, 'm');
  const match = commentBody.match(fence);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[1]);
    const validated = validate(obj);
    return validated.valid ? obj : null;
  } catch {
    return null;
  }
}

/**
 * Validate an entry against the v1.0 schema. Returns { valid, errors }.
 */
export function validate(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object') {
    return { valid: false, errors: ['entry must be an object'] };
  }
  for (const field of REQUIRED_FIELDS) {
    if (!(field in entry)) errors.push(`missing field: ${field}`);
  }
  if (entry.schema_version && entry.schema_version !== ENVELOPE_VERSION) {
    errors.push(`schema_version must be ${ENVELOPE_VERSION} (got ${entry.schema_version})`);
  }
  if (entry.flow && !FLOWS.includes(entry.flow)) {
    errors.push(`flow must be one of ${FLOWS.join(', ')} (got ${entry.flow})`);
  }
  if (entry.eva_reply_summary && entry.eva_reply_summary.length > SUMMARY_MAX) {
    errors.push(`eva_reply_summary exceeds ${SUMMARY_MAX} chars`);
  }
  if (entry.operator_input_summary && entry.operator_input_summary.length > SUMMARY_MAX) {
    errors.push(`operator_input_summary exceeds ${SUMMARY_MAX} chars`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Render a chronological list of entries as readable markdown for /eva-support memory dump.
 */
export function renderMarkdown(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return 'No decision log entries on this subtask';
  }
  const sorted = [...entries].sort((a, b) => a.sequence - b.sequence);
  const lines = [`# Decision log (${sorted.length} ${sorted.length === 1 ? 'entry' : 'entries'})`, ''];
  for (const e of sorted) {
    const overrideMark = e.override_reason ? ' **[OVERRIDE]**' : '';
    lines.push(`## #${e.sequence} — ${e.flow}${overrideMark}`);
    lines.push(`- **Time**: ${e.timestamp}`);
    lines.push(`- **Model**: ${e.model} (in: ${e.tokens_in}, out: ${e.tokens_out})`);
    if (e.override_reason) lines.push(`- **Override reason**: ${e.override_reason}`);
    if (e.operator_input_summary) lines.push(`- **Operator**: ${e.operator_input_summary}`);
    lines.push(`- **EVA**: ${e.eva_reply_summary}`);
    if (Array.isArray(e.references) && e.references.length) {
      lines.push(`- **References**: ${e.references.join(', ')}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export default { buildEntry, serialize, parse, validate, renderMarkdown, ENVELOPE_VERSION, FENCE_LANG };
