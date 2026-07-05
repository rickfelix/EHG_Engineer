// Door classifier: ONE-WAY vs TWO-WAY door routing for tiered orchestration.
// SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001 (FR-1 / DOOR-1).
//
// THE OPERATING MODEL (chairman sprint item 5 + 2:35PM amendment): post-Tuesday,
// Fable runs on API pricing as the orchestrator; ONE-WAY doors (irreversible work)
// stay Fable-exclusive, TWO-WAY doors (reversible work) delegate to Opus/Sonnet
// Max-plan sessions. This module is the PURE predicate both the stamper and the
// dispatch gate consume — the routing workflow IS this lib (AI-maintained; no
// hand-kept mapping tables).
//
// REUSE, NOT REINVENTION:
//   - Risk/forbidden keywords come from scripts/classify-quick-fix.js
//     (CLASSIFICATION_RULES + word-boundary matchesKeyword) through the SAME
//     import bridge lib/fleet/sd-tier-rank.mjs uses — never a third list.
//   - The gate shape and conservative bias mirror lib/adam/execute-vs-escalate.js
//     classifyDecision: reversibility-uncertain is treated as NOT reversible.
//
// BIAS BY CONSTRUCTION (the false-two_way direction is the dangerous one):
//   two_way is reachable ONLY through a closed ALLOWLIST of reversible-shape
//   conditions, and only when NO one-way marker fired. Everything ambiguous,
//   empty, conflicting, or unrecognized lands one_way. Closed verdict set.

import { matchesKeyword, CLASSIFICATION_RULES } from '../../scripts/classify-quick-fix.js';
import doorConstants from './door-constants.cjs';

// Single definition shared with the CJS dispatch gate (door-constants.cjs).
export const { DOORS, DELEGATE_TIERS } = doorConstants;

// Irreversibility path markers: files whose change is structurally hard to walk
// back (or that alter shared contracts every downstream consumer depends on).
const ONE_WAY_PATH_MARKERS = [
  { re: /(^|[\\/])migrations[\\/]/i, reason: 'migration_file' },
  { re: /\.sql$/i, reason: 'sql_file' },
  { re: /(^|[\\/])(openapi|swagger)[^\\/]*\.(ya?ml|json)$/i, reason: 'api_contract_file' },
  { re: /(^|[\\/])CLAUDE(_[A-Z]+)?\.md$/i, reason: 'protocol_file' },
  { re: /(^|[\\/])docs[\\/](01_architecture|03_protocols_and_standards)[\\/]/i, reason: 'architecture_or_protocol_doc' },
];

// Irreversibility text markers (beyond the QF keyword lists): explicit commitments
// the reversal of which is a project, not a revert. The irreversible-or-external
// phrasing follows lib/adam/adherence-probes.js's COMES_TO_HIM precedent.
const ONE_WAY_TEXT_MARKERS = [
  { re: /\b(irreversible|non-?reversible|cannot be undone)\b/i, reason: 'declared_irreversible' },
  { re: /\bapi contract|breaking change|backward[- ]incompatible\b/i, reason: 'api_contract_change' },
  { re: /\bprotocol (amendment|change|section)\b/i, reason: 'protocol_amendment' },
  { re: /\barchitectur(e|al)\b/i, reason: 'architectural_commitment' },
  { re: /\bdrop (table|column)|truncate\b/i, reason: 'destructive_ddl' },
  { re: /\bdata[- ]loss|delete (all|production)\b/i, reason: 'data_loss_surface' },
];

// The CLOSED two_way allowlist: reversible-shape conditions. A work item must
// positively match one of these — and trip zero one-way markers — to delegate.
const TWO_WAY_ALLOWLIST = [
  { id: 'copy_content_edit', re: /\b(copy|reword|rephrase|wording|typo|tagline|hero (copy|text)|content edit)\b/i },
  { id: 'ui_only_change', re: /\b(ui[- ]only|styling|stylesheet|css|visual polish|layout tweak|component render)\b/i },
  { id: 'flag_gated_change', re: /\b(feature[- ]flag(ged)?|behind (a )?flag|kill[- ]switch[- ]gated)\b/i },
  { id: 'docs_only_change', re: /\b(docs?[- ]only|documentation[- ]only|readme|changelog)\b/i },
  { id: 'test_only_change', re: /\b(test[- ]only|tests? only|add(ing)? (unit |integration )?tests?)\b/i },
];

// Docs/test file-shape corroboration for the allowlist (files, when provided,
// must not contradict the claimed reversible shape).
const TWO_WAY_SAFE_PATH = /(^|[\\/])(docs|tests?|__tests__)[\\/]|\.(md|test\.[jt]s|spec\.[jt]s|css)$/i;

function textOf(item) {
  // Null-before-join discipline: every field is optional; never coerce null.
  const parts = [
    item && item.title,
    item && item.description,
    item && item.scope,
    Array.isArray(item && item.key_changes)
      ? item.key_changes.map((k) => (k && typeof k === 'object' ? k.change : k)).filter(Boolean).join(' ')
      : (item && item.key_changes),
  ].filter((v) => typeof v === 'string' && v.trim().length > 0);
  return parts.join(' ').toLowerCase();
}

function filesOf(item) {
  const f = item && item.files;
  return Array.isArray(f) ? f.filter((p) => typeof p === 'string' && p.length > 0) : [];
}

/**
 * Pure door classification. No I/O; closed verdict set; every verdict carries
 * named reasons. Missing/ambiguous input NEVER yields two_way.
 *
 * @param {Object} item — { title?, description?, scope?, key_changes?, files?, sd_type?, estimated_loc? }
 * @returns {{ door: 'one_way'|'two_way', reasons: string[], gates: { reversible: boolean|null, risk_keyword: boolean, path_marker: boolean } }}
 */
export function classifyDoor(item) {
  const text = textOf(item);
  const files = filesOf(item);
  const reasons = [];

  // Gate 1 — blast radius via the SHARED keyword lists (bridge, not a copy).
  let riskKeyword = false;
  for (const k of CLASSIFICATION_RULES.forbiddenKeywords) {
    if (matchesKeyword(text, k)) { riskKeyword = true; reasons.push('risk_keyword:' + k); break; }
  }
  if (!riskKeyword) {
    for (const k of CLASSIFICATION_RULES.riskKeywords) {
      if (matchesKeyword(text, k)) { riskKeyword = true; reasons.push('risk_keyword:' + k); break; }
    }
  }

  // Gate 2 — irreversibility markers (paths, then text).
  let pathMarker = false;
  for (const m of ONE_WAY_PATH_MARKERS) {
    const hit = files.find((f) => m.re.test(f));
    if (hit) { pathMarker = true; reasons.push(m.reason + ':' + hit); }
  }
  for (const m of ONE_WAY_TEXT_MARKERS) {
    if (m.re.test(text)) { pathMarker = true; reasons.push(m.reason); }
  }

  if (riskKeyword || pathMarker) {
    return { door: DOORS.ONE_WAY, reasons, gates: { reversible: false, risk_keyword: riskKeyword, path_marker: pathMarker } };
  }

  // Gate 3 — ambiguity fail-safe: with no scoreable text at all, we cannot call
  // anything reversible (execute-vs-escalate's reversibility-uncertain posture).
  if (text.trim().length === 0) {
    return { door: DOORS.ONE_WAY, reasons: ['ambiguous_fail_safe'], gates: { reversible: null, risk_keyword: false, path_marker: false } };
  }

  // Gate 4 — the closed two_way allowlist. Files, when present, must corroborate
  // (all inside safe shapes) — a "copy edit" touching a migration never delegates
  // (that case is already caught by Gate 2, but the corroboration keeps the
  // allowlist honest if markers evolve).
  for (const a of TWO_WAY_ALLOWLIST) {
    if (a.re.test(text)) {
      const contradicted = files.length > 0 && a.id !== 'copy_content_edit' && a.id !== 'flag_gated_change'
        ? !files.every((f) => TWO_WAY_SAFE_PATH.test(f))
        : false;
      if (!contradicted) {
        return { door: DOORS.TWO_WAY, reasons: ['allowlist:' + a.id], gates: { reversible: true, risk_keyword: false, path_marker: false } };
      }
      return { door: DOORS.ONE_WAY, reasons: ['allowlist_contradicted_by_files:' + a.id], gates: { reversible: false, risk_keyword: false, path_marker: false } };
    }
  }

  // Default: recognized text but no reversible shape matched — one_way.
  return { door: DOORS.ONE_WAY, reasons: ['no_reversible_shape_matched'], gates: { reversible: null, risk_keyword: false, path_marker: false } };
}

export default { classifyDoor, DOORS, DELEGATE_TIERS };
