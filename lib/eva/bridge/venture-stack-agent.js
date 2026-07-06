/**
 * VENTURE_STACK compliance agent (panel dimension)
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 2 (FR-002)
 *
 * The panel's compliance dimension: ensures each venture leaf's PRD POSITIVELY
 * specifies the EHG venture stack (Clerk auth, Replit Postgres, Replit hosting/
 * Secrets) and contains NO forbidden tech (Supabase, Replit-Auth, CLI-as-product).
 * This is the shift-left of the existing fail-closed S19 gate: catch drift at
 * PLAN, in the spec, before the build — not after, in the repo.
 *
 * Unlike DATABASE/SECURITY (LLM sub-agents), VENTURE_STACK is DETERMINISTIC: it
 * reuses the canonical policy SSOT (venture-stack-policy.js) + the negation-aware
 * scanner (venture-stack-compliance.js), so it runs headlessly and is fully
 * unit-testable — the live driver can run it without spawning a sub-agent.
 *
 * Agent contract matches the panel driver: returns { ok, section }. A leaf that
 * positively specifies forbidden tech is NOT ok (ok:false => the orchestrator
 * holds it, since VENTURE_STACK is a required agent). Missing REQUIRED tech is
 * advisory only (mirrors the gate's compliant/hold semantics).
 *
 * SD-LEO-INFRA-ACTIVATE-DORMANT-EXIT-001 (FR-5): this asymmetry is a CONFIRMED gap —
 * a leaf whose spec never mentions the required stack silently PASSES. Directly
 * flipping `compliant` to also require `scan.missing.length === 0` would immediately
 * HOLD every already-passing leaf fleet-wide (severe blast radius). Instead this
 * function stays PURE and returns an additive `observeOnly` field describing what
 * WOULD have failed; the async wrapper (lib/sub-agents/venture_stack.js) logs it
 * (warnings + system_events) without changing `ok`/verdict. The eventual bind (make
 * `compliant` require `missing.length === 0` too) is a separate, later, one-line
 * change gated by the same named criterion as FR-3 — explicitly NOT performed here.
 *
 * @module lib/eva/bridge/venture-stack-agent
 */

import { REQUIRED, FORBIDDEN } from '../standards/venture-stack-policy.js';
import { scanTextForStackCompliance } from '../standards/venture-stack-compliance.js';

/** Generate the positive stack-conformance PRD section from the policy SSOT. */
export function buildStackConformanceSection() {
  const required = REQUIRED.map((r) => `- **${r.label}** (${r.kind}) — ${r.why}`).join('\n');
  const forbidden = FORBIDDEN.map((f) => `- ${f.label} (${f.kind}) — ${f.why}`).join('\n');
  return [
    'EHG venture-stack conformance (SSOT: lib/eva/standards/venture-stack-policy.js):',
    '',
    'REQUIRED — this leaf must specify:',
    required,
    '',
    'FORBIDDEN — this leaf must NOT specify or use:',
    forbidden,
  ].join('\n');
}

/**
 * Run the VENTURE_STACK agent over a leaf.
 *
 * @param {object} params
 * @param {object} [params.leaf] - leaf payload ({ title, description, ... })
 * @param {Array<{section:string}>} [params.priorSections] - sections already produced by earlier panel agents
 * @returns {{ok:boolean, section:(string|null), violations:string[], missing:string[], reason:string, observeOnly:{wouldFailClosed:boolean, missing:string[]}}}
 */
export function runVentureStackAgent({ leaf = {}, priorSections = [] } = {}) {
  const texts = [leaf.title, leaf.description, ...priorSections.map((s) => s && s.section)]
    .filter((t) => typeof t === 'string' && t.trim());

  // Reuse the canonical negation-aware scanner. No scannable text => nothing forbidden present.
  const scan = texts.length
    ? scanTextForStackCompliance(texts)
    : { violations: [], missing: REQUIRED.map((r) => r.label) };

  const compliant = scan.violations.length === 0; // forbidden-present holds; missing is advisory
  const missing = scan.missing || [];
  return {
    ok: compliant,
    section: compliant ? buildStackConformanceSection() : null,
    violations: scan.violations.map((v) => v.id || v.label || String(v)),
    missing,
    reason: compliant ? 'compliant' : 'forbidden_stack_present',
    // SD-LEO-INFRA-ACTIVATE-DORMANT-EXIT-001 (FR-5): pure, additive — never affects `ok`/`compliant`.
    observeOnly: { wouldFailClosed: compliant && missing.length > 0, missing },
  };
}
