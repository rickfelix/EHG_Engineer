# Venture substrate WIRING GAPS — 4 built-but-unwired joints block ventures from going live

## Type
bugfix

## Target Repos
EHG_Engineer

## Summary
Solomon chairman-approved hand-off #6 item A (ledger 3eb8f4d1, 5-agent ground-truth triangulation + adversarial pass). The venture substrate is BUILT-BUT-UNWIRED at 4 of 7 joints — every claim file:line-verified. This is the gap between "the factory exists" and "the factory can ship a venture end-to-end": the deploy, email, guardrails, and attribution capabilities all exist as code but are never called by any running path. **Directly blocks the first-revenue venture: Alt-Text cannot go live cleanly past S19/S24 with joints (1)+(3) dark.** Highest revenue-relevance item on the board.

## Functional Requirements
### FR-1: DEPLOY joint — Go-Live calls promote/publish
`lib/venture-deploy/promote.js` `promote()`/`publish()` are NEVER called by the Go-Live stage (`stage-24-go-live.js` sets launch_status strings only — `scripts/temp/refine-sd-retro-002-scope.mjs:5` admits it), so `venture_deployments status='routed'` is never written by a running path. Wire Go-Live to actually call promote/publish so a real deployment record is written.
### FR-2: EMAIL joint — provisioner calls provisionVentureEmail
`lib/venture-email/provision-venture-email.js` `provisionVentureEmail` has ZERO production callers (no stage worker or provisioner imports it). Wire the venture provisioning flow to call it so a venture actually gets its email provisioned.
### FR-3: GUARDRAILS joint — deploy path populates guardrail state
The S19 "spend guardrails ready" exit gate is dispatched fail-closed, BUT nothing calls `persistGuardrailDecisions`/`evaluateGuardrails` (`lib/venture-deploy/spend-guardrails.js:127,161`), so `venture_guardrail_state` is never populated — the gate can only BLOCK, never PASS. Wire the deploy path to evaluate + persist guardrail state so S19 can actually pass for a legitimate venture.
### FR-4: ATTRIBUTION joint — resolver runs on webhook/cron
`lib/payments/attribution-resolver.js` has never run in the fleet (`funnel-gauge.mjs:75` says so verbatim); the payment webhook stamps `venture_id:null`; `checkout-provenance.js` is uncalled. Wire the attribution resolver onto the webhook (and/or a cron) so per-venture revenue attribution actually resolves.

## Success Metrics
- metric: venture_deployments rows written by a running Go-Live; target: >0 (deploy joint live)
- metric: provisionVentureEmail production callers; target: >=1
- metric: S19 guardrail gate can PASS for a legit venture (state populated); target: yes
- metric: payment webhooks with resolved venture_id (not null); target: attributed

## Smoke Test Steps
1. instruction: Run a venture through Go-Live; expected_outcome: promote/publish called, venture_deployments status='routed' written.
2. instruction: Provision a venture; expected_outcome: provisionVentureEmail invoked.
3. instruction: Drive a venture to S19 with valid guardrails; expected_outcome: guardrail state persisted, gate PASSES (not just blocks).
4. instruction: Send a test payment webhook; expected_outcome: attribution resolver stamps the correct venture_id.

## Sizing / Notes
Tier 3 — orchestrator SD OR 4 sibling Tier-2s (decompose at sourcing per Solomon). REVENUE-CRITICAL + BLOCKS ALT-TEXT go-live (joints 1+3) — sequence ahead of Alt-Text S19/S24. COORDINATOR review for decomposition + sequencing vs the Alt-Text demand-test lane. Reachability-gap class (built-but-never-dispatched) — each FR = wire an existing tested function into its owning flow, not new construction. Board-track immediately. Item B (org-template arming) routed to chairman-aware disposition separately (see advisory).
