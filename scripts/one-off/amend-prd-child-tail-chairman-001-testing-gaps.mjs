#!/usr/bin/env node
/**
 * Addresses the 5 requirement gaps TESTING sub-agent flagged (verdict BLOCKED,
 * sub_agent_execution_results id dc42f0b8-f261-4071-94a9-a3b4e0b812a6) on the initial PRD for
 * SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001: error_handling, edge_case (future exclusions), performance,
 * security (who can change patterns), and executive_summary wording. Read-modify-write on the
 * existing PRD row -- appends, never clobbers.
 */
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const PRD_ID = 'PRD-SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001';
const supabase = await getSupabaseClient();

const { data: existing, error: readError } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, risks, executive_summary')
  .eq('id', PRD_ID)
  .single();
if (readError) { console.error('READ FAILED:', readError.message); process.exit(1); }

const executive_summary = 'This SD was originally scoped as reconciling a claimed divergence between the get_pending_chairman_items SQL RPC and its JS mirror in chairman-actionable.mjs. LEAD-phase verification (Explore + validation-agent, both live-DB-backed) found that claim FALSE: the two predicates are already byte-for-byte identical and enforced by a passing parity test. The real, evidenced gap is that neither predicate excludes ZZZ_-prefixed, UAT-prefixed, or epoch-tail-suffixed fixture venture names -- coverage that exists only in a deliberately separate module (lib/governance/fixture-exclusion.mjs) which must not be collapsed into this pair. This PRD closes that shared gap by adding the same proven-correct anchored patterns to the SQL RPC and JS mirror together, re-pinning both the unit parity test and a previously-blind integration contract test, and explicitly avoiding a false-positive class a prior cancelled QF already identified on this exact pattern list. Live measurement found zero current active-leak instances, so this is preventive hardening of a real, narrowly-scoped predicate gap -- not an emergency fix, and not a general-purpose exclusion-pattern framework.';

const technical_requirements = [
  ...existing.technical_requirements,
  {
    id: 'TR-5',
    title: 'Error handling: static patterns, no runtime failure mode',
    description: 'FIXTURE_NAME_PATTERNS / the SQL WHERE clause are static regex/ILIKE literals, not a runtime operation that can fail mid-execution. The only failure surfaces are (a) a malformed pattern shipped in a PR, caught pre-merge by FR-3/FR-4s test suites, and (b) the migration apply itself, which is chairman-gated and fails closed by construction (TR-4: staged, never auto-applied). No additional runtime error handling applies.'
  },
  {
    id: 'TR-6',
    title: 'Performance: negligible at current and near-future scale',
    description: 'Live measurement (2026-08-15, validation-agent) found 151 rows in ventures. Sequential ILIKE/regex WHERE clauses (growing from 13 to 19) over a table this size carry no measurable query-time impact; no index is required. Out of scope: optimizing the predicate for a substantially larger ventures table, which is not the current state.'
  },
  {
    id: 'TR-7',
    title: 'Change control: pattern edits require code review + chairman ceremony',
    description: 'These patterns are hardcoded literals in source (chairman-actionable.mjs, reviewed via normal PR process) and a chairman-gated SQL migration (TR-4: blank @approved-by, applied only at the chairman ceremony). There is no runtime/user-facing surface that can modify fixture-exclusion patterns; both edit paths require an authenticated code-review or chairman-approval step. No additional access control is needed.'
  },
  {
    id: 'TR-8',
    title: 'Out of scope: a general future-exclusion-pattern process',
    description: 'This SD closes one specific, evidenced gap (ZZZ_/UAT/epoch-tail) using patterns already proven correct elsewhere in the codebase. It does not establish a general intake process, review cadence, or tooling for future fixture-pattern requests. A recurring need for new patterns should be raised as its own SD/QF, informed by this ones landmines (QF-20260807-014 class, the asymmetric SQL/JS pairing, the stale-contract-test trap) rather than by this SD building infrastructure for a need that has not yet recurred.'
  }
];

const risks = [
  ...existing.risks,
  {
    risk: 'A future, unrelated change to these patterns reproduces the same landmines this SD had to discover (unanchored substrings, asymmetric SQL/JS pairing, stale contract-test pin)',
    mitigation: 'TR-8 explicitly documents these as named landmines for the next SD/QF that touches this surface, rather than leaving them to be re-discovered from scratch',
    severity: 'low'
  }
];

const { data, error } = await supabase
  .from('product_requirements_v2')
  .update({ executive_summary, technical_requirements, risks, updated_at: new Date().toISOString() })
  .eq('id', PRD_ID)
  .select('id, technical_requirements, risks')
  .maybeSingle();
if (error) { console.error('UPDATE FAILED:', error.message); process.exit(1); }
if (!data) { console.error('UPDATE MATCHED ZERO ROWS'); process.exit(1); }
console.log('TR count now:', data.technical_requirements.length, '| Risks count now:', data.risks.length);
