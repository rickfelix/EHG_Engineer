-- QF-20260422-862: Q9 exemption matrix — infrastructure is CONDITIONAL, not exempt.
-- Code-producing infrastructure SDs require smoke_test_steps per SD-LEO-INFRA-ENFORCE-EXECUTION-SMOKE-001.
-- Idempotent: runs only when the old row text is still present.

UPDATE public.leo_protocol_sections
SET content = REPLACE(
  REPLACE(
    content,
    '| infrastructure | ❌ NO | Internal tooling |',
    '| infrastructure | ⚠️ CONDITIONAL | REQUIRED if SD produces code (see below); exempt for pure protocol/policy changes |'
  ),
  '| refactor | ❌ NO | Behavior unchanged by definition |' || E'\n\n' || '### Integration with Validation Gates',
  '| refactor | ❌ NO | Behavior unchanged by definition |' || E'\n\n' ||
  '**Code-producing infrastructure SDs require `smoke_test_steps`** (SD-LEO-INFRA-ENFORCE-EXECUTION-SMOKE-001). The gate auto-detects code production by scanning `scope`, `key_changes`, and `title` for:' || E'\n' ||
  '- Code file references: `.js`, `.ts`, `.cjs`, `.mjs`, `.jsx`, `.tsx`, `.py`, `.sh`, `.ps1`, `.bash`' || E'\n' ||
  '- Code-production keywords: `script`, `utility`, `function`, `module`, `handler`, `gate`, `validator`, `middleware`, `endpoint`, `api`, `worker`, `plugin`, `hook`, `adapter`, `factory`, `engine`, `executor`, `runner`' || E'\n\n' ||
  'If any match, the LEAD-TO-PLAN preflight will block with `SMOKE_TEST_MISSING`. Plain config/doc/protocol infrastructure SDs (e.g. "update CLAUDE.md", "add environment variable") are exempt. Detection logic: `scripts/modules/handoff/validation/sd-type-applicability-policy.js::detectCodeProduction`.' || E'\n\n' ||
  '### Integration with Validation Gates'
)
WHERE id = 365
  AND content LIKE '%| infrastructure | ❌ NO | Internal tooling |%';
