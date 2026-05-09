/**
 * Tier-3 Security Audit Events Emitter
 *
 * Writes append-only rows to public.security_audit_events with per-event-type
 * payload validation and SHA-256 integrity_hash. Fail-closed: throws on insert
 * failure; callers MUST await.
 *
 * SD-LEO-INFRA-DEDICATED-SECURITY-AUDIT-001
 *
 * @module lib/security/audit-events-emitter
 */

import crypto from 'node:crypto';

const EVENT_TYPES = ['nfkd_collision', 'port_isol_violation', 'capability_suppression', 'fail_closed_error'];
const SEVERITIES = ['info', 'warning', 'critical', 'tier3'];
const TAXONOMY_CLASSES = ['permanent', 'transient'];

const PAYLOAD_REQUIRED_FIELDS = {
  nfkd_collision: ['attempted_name', 'normalized_key', 'candidates'],
  port_isol_violation: ['violation_kind', 'pat_pattern_id'],
  capability_suppression: ['suppressed_layers', 'suppression_reason'],
  fail_closed_error: ['error_code', 'error_message']
};

function computeIntegrityHash({ event_type, severity, occurred_at, source_agent, venture_id, sd_id, event_payload }) {
  const canonical = JSON.stringify({
    event_type,
    severity,
    occurred_at,
    source_agent,
    venture_id: venture_id || null,
    sd_id: sd_id || null,
    event_payload: event_payload || {}
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function validateAuditEvent(args) {
  if (!EVENT_TYPES.includes(args.event_type)) {
    throw new Error(`Invalid event_type: ${args.event_type}. Must be one of: ${EVENT_TYPES.join(', ')}`);
  }
  if (!SEVERITIES.includes(args.severity)) {
    throw new Error(`Invalid severity: ${args.severity}. Must be one of: ${SEVERITIES.join(', ')}`);
  }
  if (args.event_type === 'fail_closed_error' && !TAXONOMY_CLASSES.includes(args.taxonomy_class)) {
    throw new Error(`fail_closed_error requires taxonomy_class in ${TAXONOMY_CLASSES.join(', ')}, got ${args.taxonomy_class}`);
  }
  if (!args.source_agent) {
    throw new Error('source_agent is required');
  }
  const required = PAYLOAD_REQUIRED_FIELDS[args.event_type] || [];
  for (const field of required) {
    if (!(field in (args.event_payload || {}))) {
      throw new Error(`Missing required payload field for ${args.event_type}: ${field}`);
    }
  }
  return true;
}

export async function writeAuditEvent({
  supabase,
  event_type,
  severity,
  taxonomy_class = null,
  venture_id = null,
  venture_name_input = null,
  venture_name_normalized = null,
  colliding_with_venture_id = null,
  source_agent,
  source_module_path = null,
  correlation_id = null,
  session_id = null,
  sd_id = null,
  occurred_at = null,
  event_payload = {},
  pat_pattern_id = null
}) {
  if (!supabase) throw new Error('writeAuditEvent: supabase client is required');

  validateAuditEvent({ event_type, severity, taxonomy_class, source_agent, event_payload });

  const occurredAt = occurred_at || new Date().toISOString();
  const correlationId = correlation_id || crypto.randomUUID();

  const integrity_hash = computeIntegrityHash({
    event_type,
    severity,
    occurred_at: occurredAt,
    source_agent,
    venture_id,
    sd_id,
    event_payload
  });

  const row = {
    event_type,
    severity,
    taxonomy_class,
    venture_id,
    venture_name_input,
    venture_name_normalized,
    colliding_with_venture_id,
    source_agent,
    source_module_path,
    correlation_id: correlationId,
    session_id,
    sd_id,
    occurred_at: occurredAt,
    event_payload,
    integrity_hash,
    pat_pattern_id
  };

  const { data, error } = await supabase
    .from('security_audit_events')
    .insert(row)
    .select('id, occurred_at, correlation_id, integrity_hash')
    .single();

  if (error) {
    throw new Error(`writeAuditEvent failed: ${error.message} (code=${error.code})`);
  }

  return data;
}

export { computeIntegrityHash };
