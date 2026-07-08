The LEO Protocol is the factory's core build workflow: **LEAD** (Strategy) -> **PLAN** (Architecture) -> **EXEC** (Implementation).

- Source of truth for all SD/PRD/handoff state is the database — `strategic_directives_v2`, `product_requirements_v2`, and `sd_phase_handoffs` — never markdown files.
- Canonical phase transitions run through `node scripts/handoff.js execute <PHASE> <SD-ID>`, in order: LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD, LEAD-FINAL-APPROVAL.
- Each handoff requires fresh sub-agent evidence in `sub_agent_execution_results` before it can pass; manual DB checks are not accepted as evidence.
- AUTO-PROCEED is on by default: phase transitions, PRD creation, and decomposition into child SDs are NOT pause points. The five canonical pause points are: orchestrator completion (chaining off), a blocking error requiring human decision, test failures after two retry attempts, all children blocked, and a critical security/data-loss scenario.
- Work is tiered by size: Tier 1 (<=30 LOC) auto-approved quick-fix, Tier 2 (31-75 LOC) standard quick-fix, Tier 3 (>75 LOC, or touching auth/schema/migration/payments/credentials) full SD workflow.
- Shipping happens only via PR + the hardened auto-merge/witness path (`lib/ship/auto-merge.mjs`) — never a bare `gh pr merge`, and never a manual merge by a human operator.
