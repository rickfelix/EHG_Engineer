-- SD-LEO-INFRA-OPUS-MODULE-SUB-001 (Module C)
-- Append DB-enforcement clause to Module A2 text in leo_protocol_sections row 209
-- (session_prologue). Row was updated by SD-LEO-FIX-PLAN-OPUS-HARNESS-001 with the
-- SUBAGENT_EVIDENCE_MISSING language, but shipped no gate code. This SD closes that
-- gap with subagent-evidence-gate.js; the protocol text now explicitly references
-- the enforcement behavior.
--
-- Idempotent: runs only when the enforcement clause is absent.

UPDATE public.leo_protocol_sections
SET content = content || E'\n\n' ||
  '**Enforcement**: `scripts/modules/handoff/gates/subagent-evidence-gate.js` runs at every handoff precheck and blocks with `SUBAGENT_EVIDENCE_MISSING` when any required sub-agent has no fresh `sub_agent_execution_results` row (created_at >= current phase start). Required set keyed on handoff type via `REQUIRED_SUBAGENTS` export. Emergency bypass: `LEO_DISABLE_SUBAGENT_EVIDENCE_GATE=1` (writes audit_log warning).'
WHERE id = 209
  AND content NOT LIKE '%subagent-evidence-gate.js%';
