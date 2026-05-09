/**
 * Tier-3 Security Audit Events Reader (Chairman-scoped, RLS-respecting)
 *
 * Returns text-formatted forensic chains. No UI surface this SD —
 * UI tile deferred to follow-up SD.
 *
 * SD-LEO-INFRA-DEDICATED-SECURITY-AUDIT-001
 *
 * @module lib/security/audit-events-reader
 */

const SAFE_COLUMNS = 'id, event_type, severity, taxonomy_class, venture_id, source_agent, correlation_id, sd_id, occurred_at, detected_at, event_payload, integrity_hash, pat_pattern_id';

export async function getEventsByCorrelationId(supabase, correlationId, { limit = 100 } = {}) {
  if (!supabase) throw new Error('supabase client required');
  if (!correlationId) throw new Error('correlationId required');

  const { data, error } = await supabase
    .from('security_audit_events')
    .select(SAFE_COLUMNS)
    .eq('correlation_id', correlationId)
    .order('occurred_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`getEventsByCorrelationId failed: ${error.message}`);
  return data || [];
}

export async function getEventsByVenture(supabase, ventureId, { limit = 100 } = {}) {
  if (!supabase) throw new Error('supabase client required');
  if (!ventureId) throw new Error('ventureId required');

  const { data, error } = await supabase
    .from('security_audit_events')
    .select(SAFE_COLUMNS)
    .eq('venture_id', ventureId)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getEventsByVenture failed: ${error.message}`);
  return data || [];
}

export async function getRecentBySeverity(supabase, severity, { limit = 100 } = {}) {
  if (!supabase) throw new Error('supabase client required');
  if (!['info', 'warning', 'critical', 'tier3'].includes(severity)) {
    throw new Error(`Invalid severity: ${severity}`);
  }

  const { data, error } = await supabase
    .from('security_audit_events')
    .select(SAFE_COLUMNS)
    .eq('severity', severity)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getRecentBySeverity failed: ${error.message}`);
  return data || [];
}

export function formatForensicChain(events) {
  if (!Array.isArray(events) || events.length === 0) return 'No events.';
  const lines = events.map(e =>
    `[${e.occurred_at}] ${e.severity.toUpperCase()} ${e.event_type}` +
    (e.taxonomy_class ? ` (${e.taxonomy_class})` : '') +
    ` from=${e.source_agent}` +
    (e.pat_pattern_id ? ` pattern=${e.pat_pattern_id}` : '') +
    ` integrity=${e.integrity_hash.slice(0, 12)}...`
  );
  return lines.join('\n');
}
