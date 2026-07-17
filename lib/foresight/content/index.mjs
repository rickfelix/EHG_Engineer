/**
 * Foresight Board Phase-1 content — loader + validators
 * (SD-LEO-INFRA-EHG-VENTURE-FORESIGHT-001-A).
 *
 * Authored content for the chairman-authored EHG Venture Foresight Board spec
 * (docs/design/ehg-venture-foresight-board-spec.md): 5 council definitions
 * (§8.2 + §5) and 20 PerspectiveProfile documents (§8.1 + §4.1).
 *
 * FIELD-FIDELITY CONTRACT (C-5/C-6): JSON keys use the spec's §8.1/§8.2
 * suggested field names VERBATIM so sibling -B's tables ingest key-for-key.
 * ADDITIVE fields (documented deviations, never silent): councils carry
 * `primary_questions` (§5 verbatim, for -C's prompts); profiles carry
 * `sources` (manual citations of real public work — parent plan item 6),
 * `provenance_note` (public-thought-informed disclaimer + staleness note),
 * and `forecasting_style` (style characterization — NEVER fabricated dated
 * predictions; the §16.3 forecast ledger is later machinery).
 *
 * ANTI-IMPERSONATION (§3/§4.1/§18, chairman-authored hard rule): profiles are
 * third-person analytical LENSES — recurring arguments, actual public
 * frameworks, cautions, biases. lintAntiImpersonation() below is the
 * CI-enforced guard (C-1..C-4): structural enforcement, not author discipline.
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const COUNCIL_FIELDS = Object.freeze([
  'council_id', 'council_name', 'purpose', 'adjudicator_perspective_id',
  'specialist_perspective_ids', 'required_output_type', 'default_prompt_version', 'status',
]);
export const PROFILE_FIELDS = Object.freeze([
  'perspective_id', 'person_name', 'council_id', 'role_type', 'expertise_domains',
  'analytical_frameworks', 'recurring_themes', 'known_cautions', 'known_biases',
  'source_count', 'doctrine_version', 'last_refreshed_at', 'confidence_in_profile', 'active_status',
]);
export const ADDITIVE_COUNCIL_FIELDS = Object.freeze(['primary_questions']);
export const ADDITIVE_PROFILE_FIELDS = Object.freeze(['sources', 'provenance_note', 'forecasting_style']);
export const ROLE_TYPES = Object.freeze(['specialist', 'adjudicator', 'governance_reviewer', 'external_scout']);

/** The chairman-named §5 roster — part of the content contract (C-6). */
export const SPEC_ROSTER = Object.freeze({
  frontier_capability: { adjudicator: 'Alex Wissner-Gross', specialists: ['Jack Clark', 'Nathan Benaich', 'Rodney Brooks'] },
  human_transition: { adjudicator: 'Sínead Bovell', specialists: ['Marina Gorbis', 'Heather McGowan', 'Rumman Chowdhury'] },
  strategic_foresight: { adjudicator: 'Amy Webb', specialists: ['Peter Schwartz', 'Sohail Inayatullah', 'Jamais Cascio'] },
  exponential_systems: { adjudicator: 'Azeem Azhar', specialists: ['Carlota Perez', 'Tony Seba', 'Parag Khanna'] },
  market_reality: { adjudicator: 'Benedict Evans', specialists: ['Ben Thompson', 'Horace Dediu', 'Rita McGrath'] },
});

export function loadCouncils() {
  return JSON.parse(readFileSync(path.join(HERE, 'councils.json'), 'utf8'));
}

export function loadProfiles() {
  const dir = path.join(HERE, 'profiles');
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
}

// ── Anti-impersonation lint (C-1..C-4) ────────────────────────────────────────
const BANNED_KEYS = ['speech_style', 'mannerisms', 'persona', 'voice', 'tone', 'first_person_prompt', 'character', 'speaking_style'];
const FIRST_PERSON_RE = /(^|[\s"“(])(I|I'm|I've|my|mine)\b/;
const SPEAK_AS_RE = /\byou are\s+(?:the\s+)?[A-ZÁÉÍÓÚÀ-ÿ][a-zà-ÿ]+(?:\s+[A-ZÁÉÍÓÚÀ-ÿ][a-zà-ÿ-]+)+/i;
const ENDORSEMENT_RE = /\b(endorses?|approved by|works? (?:with|for) EHG|partner(?:ed|ship)? with EHG|affiliated with EHG)\b/i;

function allStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => allStrings(v, out));
  return out;
}

/**
 * Pure: returns [] when clean, else violation strings. Fails on persona keys,
 * first-person voice, speak-as-the-person prompt forms (the spec's own banned
 * example: "You are Alex Wissner-Gross. Tell EHG what to build"), and
 * endorsement/affiliation claims.
 */
export function lintAntiImpersonation(profile) {
  const violations = [];
  for (const k of Object.keys(profile || {})) {
    if (BANNED_KEYS.includes(k)) violations.push(`banned persona field: ${k}`);
  }
  for (const s of allStrings(profile)) {
    if (FIRST_PERSON_RE.test(s)) violations.push(`first-person voice: "${s.slice(0, 60)}"`);
    if (SPEAK_AS_RE.test(s)) violations.push(`speak-as-person form: "${s.slice(0, 60)}"`);
    if (ENDORSEMENT_RE.test(s)) violations.push(`endorsement/affiliation claim: "${s.slice(0, 60)}"`);
  }
  return violations;
}

// ── Shape + board validators ──────────────────────────────────────────────────
export function validateCouncil(c) {
  const problems = COUNCIL_FIELDS.filter((f) => c?.[f] === undefined).map((f) => `council missing ${f}`);
  if (Array.isArray(c?.specialist_perspective_ids) && c.specialist_perspective_ids.length !== 3) {
    problems.push(`council ${c.council_id}: expected 3 specialists, got ${c.specialist_perspective_ids.length}`);
  }
  const extras = Object.keys(c || {}).filter((k) => !COUNCIL_FIELDS.includes(k) && !ADDITIVE_COUNCIL_FIELDS.includes(k));
  if (extras.length) problems.push(`council ${c?.council_id}: undocumented fields ${extras.join(',')}`);
  return problems;
}

export function validateProfile(p) {
  const problems = PROFILE_FIELDS.filter((f) => p?.[f] === undefined).map((f) => `profile ${p?.perspective_id}: missing ${f}`);
  if (p && !ROLE_TYPES.includes(p.role_type)) problems.push(`profile ${p.perspective_id}: invalid role_type ${p.role_type}`);
  if (p && !(Number(p.confidence_in_profile) > 0 && Number(p.confidence_in_profile) <= 1)) {
    problems.push(`profile ${p.perspective_id}: confidence_in_profile must be in (0,1]`);
  }
  if (p && p.doctrine_version !== 'v1.0') problems.push(`profile ${p.perspective_id}: Phase-1 doctrine_version must be v1.0`);
  if (p && !Number.isFinite(Date.parse(p.last_refreshed_at))) problems.push(`profile ${p.perspective_id}: last_refreshed_at not a date`);
  if (p && !(typeof p.provenance_note === 'string' && /public/i.test(p.provenance_note) && /stale|knowledge|cutoff/i.test(p.provenance_note))) {
    problems.push(`profile ${p?.perspective_id}: provenance_note must carry the public-thought disclaimer + staleness note`);
  }
  const extras = Object.keys(p || {}).filter((k) => !PROFILE_FIELDS.includes(k) && !ADDITIVE_PROFILE_FIELDS.includes(k));
  if (extras.length) problems.push(`profile ${p?.perspective_id}: undocumented fields ${extras.join(',')}`);
  return problems.concat(lintAntiImpersonation(p).map((v) => `profile ${p?.perspective_id}: ${v}`));
}

/** Full-board validation: shapes, integrity, and the chairman-named roster. */
export function validateBoard(councils, profiles) {
  const problems = [];
  if ((councils || []).length !== 5) problems.push(`expected 5 councils, got ${(councils || []).length}`);
  for (const c of councils || []) problems.push(...validateCouncil(c));
  for (const p of profiles || []) problems.push(...validateProfile(p));

  const byId = new Map((profiles || []).map((p) => [p.perspective_id, p]));
  for (const c of councils || []) {
    const adj = byId.get(c.adjudicator_perspective_id);
    if (!adj) problems.push(`council ${c.council_id}: adjudicator ${c.adjudicator_perspective_id} not found`);
    else if (adj.role_type !== 'adjudicator' || adj.council_id !== c.council_id) {
      problems.push(`council ${c.council_id}: adjudicator ${adj.perspective_id} role/council mismatch`);
    }
    for (const sid of c.specialist_perspective_ids || []) {
      const sp = byId.get(sid);
      if (!sp) problems.push(`council ${c.council_id}: specialist ${sid} not found`);
      else if (sp.role_type !== 'specialist' || sp.council_id !== c.council_id) {
        problems.push(`council ${c.council_id}: specialist ${sid} role/council mismatch`);
      }
    }
    const roster = SPEC_ROSTER[c.council_id];
    if (roster) {
      if (adj && adj.person_name !== roster.adjudicator) problems.push(`council ${c.council_id}: adjudicator must be ${roster.adjudicator} (§5)`);
      const names = (c.specialist_perspective_ids || []).map((sid) => byId.get(sid)?.person_name).filter(Boolean).sort();
      const expected = [...roster.specialists].sort();
      if (JSON.stringify(names) !== JSON.stringify(expected)) {
        problems.push(`council ${c.council_id}: specialists must be exactly ${expected.join(', ')} (§5)`);
      }
    } else problems.push(`unknown council_id ${c.council_id} (not in the §5 roster)`);
  }
  const roleCounts = (profiles || []).reduce((acc, p) => ((acc[p.role_type] = (acc[p.role_type] || 0) + 1), acc), {});
  if ((profiles || []).length === 20) {
    if (roleCounts.adjudicator !== 5) problems.push(`expected 5 adjudicators, got ${roleCounts.adjudicator || 0}`);
    if (roleCounts.specialist !== 15) problems.push(`expected 15 specialists, got ${roleCounts.specialist || 0}`);
  }
  return problems;
}
