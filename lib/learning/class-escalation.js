/**
 * Class-level pattern escalation by SITE DIVERSITY
 * (SD-LEO-INFRA-CLASS-LEVEL-PATTERN-001).
 *
 * Recurring incident CLASSES were promoted to class-level fixes only when a
 * human noticed ("third artifact-type mismatch this month"). occurrence_count
 * counts repeats but cannot distinguish "the same site failing five times"
 * (one fix) from "five DIFFERENT sites failing the same way" (a structural
 * class). This module records a per-pattern site ledger in
 * issue_patterns.metadata.sites[] (additive JSONB — no migration) and, when a
 * pattern accumulates >= N DISTINCT sites (default 3), drafts ONE propose-only
 * class-fix SD through the normal LEAD gate (createSD inserts status='draft'
 * by construction — CONST-002 compliant, nothing auto-executes).
 *
 * Precision tuned on the known-good historical classes (each should have
 * escalated at the 3rd distinct site): artifact-type mismatches
 * (S21/S22/S23 family), phantom-column writes (30 file sites), and
 * process.exit-after-Supabase hangs (4+ CLIs). The failed corrective-sd
 * -generator path (5/5 vision-tier false positives — single-doc complaints,
 * zero site diversity) is gated default-OFF at its score-command call site.
 *
 * Every DB-write path here is FAIL-SOFT: escalation problems log and return
 * null — they never throw into the host recording seam (RCA capture and
 * knowledge-base writes are more important than escalation).
 */

export const DEFAULT_MIN_SITES = 3;
export const MIN_SITES_FLOOR = 2;
export const SITES_CAP = 50;

/** Effective threshold (env-tunable, floor-clamped). */
export function minSites(env = process.env) {
  const raw = Number(env.CLASS_ESCALATION_MIN_SITES);
  if (!Number.isFinite(raw)) return DEFAULT_MIN_SITES;
  return Math.max(MIN_SITES_FLOOR, Math.floor(raw));
}

/**
 * Canonical site key. Precedence: file > gate > stage > sd_id — the most
 * location-specific signal wins so "same file, different SDs" stays ONE site
 * while "different files via the same SD" counts as distinct sites.
 * Returns null when the occurrence carries no usable site signal.
 */
export function siteKeyFrom(site = {}) {
  const norm = (s) => String(s).trim().replace(/\\/g, '/').toLowerCase();
  if (site.file) return `file:${norm(site.file)}`;
  if (site.gate) return `gate:${norm(site.gate)}`;
  if (site.stage !== undefined && site.stage !== null && site.stage !== '') return `stage:${norm(site.stage)}`;
  if (site.sd_id) return `sd:${norm(site.sd_id)}`;
  return null;
}

/**
 * Merge a site into a pattern's metadata (pure — returns a NEW metadata object).
 * @returns {{metadata: object, distinctCount: number, added: boolean}}
 */
export function mergeSite(metadata, site, now = new Date()) {
  const md = { ...(metadata || {}) };
  const key = siteKeyFrom(site);
  const sites = Array.isArray(md.sites) ? [...md.sites] : [];
  if (!key) return { metadata: md, distinctCount: sites.length, added: false };
  const exists = sites.some((s) => s && s.key === key);
  if (!exists) {
    sites.push({
      key,
      ...(site.file ? { file: site.file } : {}),
      ...(site.gate ? { gate: site.gate } : {}),
      ...(site.stage !== undefined && site.stage !== null && site.stage !== '' ? { stage: site.stage } : {}),
      ...(site.sd_id ? { sd_id: site.sd_id } : {}),
      first_seen: now.toISOString(),
    });
    while (sites.length > SITES_CAP) sites.shift();
  }
  md.sites = sites;
  return { metadata: md, distinctCount: sites.length, added: !exists };
}

/**
 * Escalation predicate. Pure.
 * @param {object} pattern — issue_patterns row (status, data_quality_status, metadata)
 */
export function shouldEscalate(pattern, { threshold, env = process.env } = {}) {
  const n = threshold ?? minSites(env);
  if (!pattern) return false;
  if (pattern.status !== 'active') return false;
  if (pattern.data_quality_status === 'noise') return false;
  const md = pattern.metadata || {};
  if (md.class_escalation && md.class_escalation.sd_key) return false; // exactly once
  const sites = Array.isArray(md.sites) ? md.sites : [];
  return sites.length >= n;
}

/** Build the class-fix SD draft payload (pure — for tests + the drafter). */
export function buildClassSdInput(pattern) {
  const md = pattern.metadata || {};
  const sites = Array.isArray(md.sites) ? md.sites : [];
  const head = String(pattern.issue_summary || 'recurring issue').slice(0, 80).replace(/\s+/g, ' ').trim();
  const siteLines = sites.map((s) => `- ${s.key}${s.first_seen ? ` (first seen ${s.first_seen.slice(0, 10)})` : ''}`).join('\n');
  return {
    title: `Class fix: ${pattern.category || 'uncategorized'}: ${head}`,
    description:
      'CLASS-LEVEL ESCALATION (auto-drafted, propose-only — SD-LEO-INFRA-CLASS-LEVEL-PATTERN-001): ' +
      `pattern ${pattern.pattern_id} ("${head}") has recurred across ${sites.length} DISTINCT sites — this is a structural class, not an instance. ` +
      'Each site below failed the same way; instance-level fixes have not stopped the class. ' +
      'Deliverable: ONE structural fix addressing the class at its shared root (registry/lint/contract/sweep as appropriate), not another per-site patch.\n\n' +
      `Sites (${sites.length}):\n${siteLines}\n\n` +
      `Evidence: issue_patterns.pattern_id=${pattern.pattern_id}, occurrence_count=${pattern.occurrence_count}, category=${pattern.category}, severity=${pattern.severity}. ` +
      'This draft enters the NORMAL LEAD gate — verify the class premise against the live tree before approving (sites may have been fixed since recording).',
    type: 'infrastructure',
    priority: pattern.severity === 'critical' ? 'high' : 'medium',
    source: 'class_escalation',
  };
}

/**
 * Draft the class SD + stamp the pattern. FAIL-SOFT: returns the created
 * sd_key, or null on any failure (logged, never thrown).
 */
export async function escalateToClassSd(supabase, pattern, { now = new Date() } = {}) {
  try {
    // Lazy import: scripts/leo-create-sd.js is the proven programmatic draft
    // path (corrective-triage precedent); its CLI entry is isMainModule-guarded
    // so importing is side-effect-free. createSD inserts status='draft'.
    const { createSD } = await import('../../scripts/leo-create-sd.js');
    const input = buildClassSdInput(pattern);
    const created = await createSD(input);
    const sdKey = created?.sd_key || created?.sdKey || created?.id;
    if (!sdKey) {
      console.warn(`[class-escalation] createSD returned no key for ${pattern.pattern_id} — not stamping`);
      return null;
    }
    const md = { ...(pattern.metadata || {}) };
    md.class_escalation = {
      sd_key: sdKey,
      escalated_at: now.toISOString(),
      sites_at_escalation: (md.sites || []).map((s) => s.key),
    };
    const { error } = await supabase
      .from('issue_patterns')
      .update({ metadata: md, assigned_sd_id: sdKey, assignment_date: now.toISOString() })
      .eq('id', pattern.id);
    if (error) {
      console.warn(`[class-escalation] stamp failed for ${pattern.pattern_id}: ${error.message} (SD ${sdKey} exists — manual stamp ok)`);
    }
    console.log(`[class-escalation] CLASS ESCALATED: ${pattern.pattern_id} (${(md.sites || []).length} sites) -> ${sdKey} (draft, LEAD gate)`);
    return sdKey;
  } catch (err) {
    console.warn(`[class-escalation] escalation failed (non-fatal): ${err.message}`);
    return null;
  }
}

/**
 * The seam entry: record a site occurrence on a pattern row and escalate when
 * the diversity threshold is crossed. FAIL-SOFT end to end — the host write
 * (RCA capture / knowledge-base) must never be harmed by this path.
 *
 * @param {object} supabase  service client
 * @param {object} pattern   the freshly-read issue_patterns row (id, pattern_id, status, metadata, ...)
 * @param {object} site      {file?, gate?, stage?, sd_id?}
 * @returns {Promise<{distinctCount: number, escalatedSdKey: string|null}>}
 */
export async function recordSiteAndMaybeEscalate(supabase, pattern, site, opts = {}) {
  try {
    if (!pattern || !pattern.id) return { distinctCount: 0, escalatedSdKey: null };
    const { metadata, distinctCount, added } = mergeSite(pattern.metadata, site, opts.now || new Date());
    if (added) {
      const { error } = await supabase
        .from('issue_patterns')
        .update({ metadata })
        .eq('id', pattern.id);
      if (error) {
        console.warn(`[class-escalation] site record failed for ${pattern.pattern_id}: ${error.message}`);
        return { distinctCount, escalatedSdKey: null };
      }
    }
    const candidate = { ...pattern, metadata };
    if (shouldEscalate(candidate, opts)) {
      const sdKey = await escalateToClassSd(supabase, candidate, opts);
      return { distinctCount, escalatedSdKey: sdKey };
    }
    return { distinctCount, escalatedSdKey: null };
  } catch (err) {
    console.warn(`[class-escalation] recordSiteAndMaybeEscalate failed (non-fatal): ${err.message}`);
    return { distinctCount: 0, escalatedSdKey: null };
  }
}
