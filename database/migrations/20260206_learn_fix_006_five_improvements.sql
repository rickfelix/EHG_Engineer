-- Migration: SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-006
-- Purpose: Add 5 protocol improvements from /learn system
-- SD: SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-006
-- Type: Infrastructure (protocol sections + PIQ updates)
-- FIXED: Changed section_key → section_type, removed category field, removed updated_at from PIQ update
-- NOTE: PIQ items may not exist if they were already applied/removed

BEGIN;

-- 1. Stop Hook Context Awareness - Ad-hoc Work Override
-- PIQ: f1a670ab-1a0f-4a73-a9fa-f921f8328fe5
INSERT INTO leo_protocol_sections (
  protocol_id, section_type, title, content, order_index, metadata
) VALUES (
  'leo-v4-3-3-ui-parity',
  'stop_hook_context_awareness',
  'Stop Hook Context Awareness for Ad-Hoc Work',
  E'## Stop Hook Context Awareness\n\nThe pre-commit stop hook enforces that commits are associated with an active SD. However, ad-hoc work (documentation fixes, config tweaks, tooling updates) may not have an SD.\n\n### Override Options\n\n1. **Branch name detection**: If the branch name contains `ad-hoc`, `hotfix`, or `docs/`, the stop hook allows commits without an active SD claim.\n2. **Commit message flag**: Include `[ad-hoc]` or `[no-sd]` in the commit message to bypass SD enforcement for that commit.\n3. **Environment variable**: Set `LEO_AD_HOC=true` before committing to temporarily disable SD enforcement.\n\n### When to Use\n\n- Documentation-only fixes that do not warrant a full SD\n- Emergency hotfixes that need immediate deployment\n- Configuration changes to development tooling\n- Branch cleanup and maintenance tasks\n\n### Audit Trail\n\nAll ad-hoc commits are logged to `audit_log` with `event_type=AD_HOC_COMMIT` for traceability. This ensures no work is truly untracked.',
  2382,
  '{"source_sd": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-006", "source_piq": "f1a670ab-1a0f-4a73-a9fa-f921f8328fe5", "generated_by": "learn_system"}'::jsonb
) ON CONFLICT (protocol_id, section_type, order_index) DO UPDATE SET
  content = EXCLUDED.content,
  metadata = EXCLUDED.metadata;

-- 2. Infrastructure Config Persistence Through Hooks
-- PIQ: ff9dc5bc-ecb5-42ac-959d-e1f9edb4293e
INSERT INTO leo_protocol_sections (
  protocol_id, section_type, title, content, order_index, metadata
) VALUES (
  'leo-v4-3-3-ui-parity',
  'infrastructure_config_persistence',
  'Infrastructure Config File Persistence Through Hooks',
  E'## Infrastructure Config Persistence\n\nJSON configuration files (e.g., `package.json`, `tsconfig.json`, `.eslintrc.json`) can be silently reverted by pre-commit hooks, linters, or formatters that auto-fix formatting.\n\n### Prevention Strategies\n\n1. **Stage after formatting**: Always run `git add` AFTER pre-commit hooks have executed, not before. This ensures the formatted version is what gets committed.\n2. **Check diff after commit**: Run `git diff` after committing to verify no unstaged changes remain from hook modifications.\n3. **Pin formatter versions**: Use exact versions for prettier, eslint, and other formatters to prevent unexpected reformatting.\n4. **Use .prettierignore**: Exclude critical config files from auto-formatting if their format is significant.\n\n### Common Scenarios\n\n| Scenario | Symptom | Fix |\n|----------|---------|-----|\n| Prettier reformats JSON | Config changes lost after commit | Add to .prettierignore |\n| ESLint auto-fix modifies config | Import order changes reverted | Pin eslint-plugin versions |\n| Sort-package-json hook | package.json key order changes | Verify after hook runs |\n\n### Verification\n\nAfter any infrastructure config change, verify persistence:\n```bash\ngit diff          # Should show no changes if commit was clean\ngit show HEAD     # Verify committed content matches intent\n```',
  2383,
  '{"source_sd": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-006", "source_piq": "ff9dc5bc-ecb5-42ac-959d-e1f9edb4293e", "generated_by": "learn_system"}'::jsonb
) ON CONFLICT (protocol_id, section_type, order_index) DO UPDATE SET
  content = EXCLUDED.content,
  metadata = EXCLUDED.metadata;

-- 3. SD Context Persistence Across Handoffs
-- PIQ: 1c589d37-c10f-458e-b9e3-a2b01f2f3779
INSERT INTO leo_protocol_sections (
  protocol_id, section_type, title, content, order_index, metadata
) VALUES (
  'leo-v4-3-3-ui-parity',
  'sd_context_persistence_handoffs',
  'SD Context Persistence Across Handoff Boundaries',
  E'## SD Context Persistence Across Handoffs\n\nThe GATE_SD_START_PROTOCOL gate requires reading digest files (CLAUDE_DIGEST.md, CLAUDE_CORE_DIGEST.md, and phase-specific digests) before each handoff. After context compaction or long sessions, the LLM may lose track of previously-read files.\n\n### Why This Happens\n\n1. **Context compaction**: When the conversation context is compressed, file-read state markers are lost\n2. **Session boundaries**: New sessions start with no file-read history\n3. **Long sessions**: LLM drift causes protocol adherence to weaken over time\n\n### Prevention Strategy\n\nBefore EVERY handoff attempt:\n1. Read CLAUDE_DIGEST.md\n2. Read CLAUDE_CORE_DIGEST.md\n3. Read the phase-specific digest (CLAUDE_LEAD_DIGEST.md, CLAUDE_PLAN_DIGEST.md, or CLAUDE_EXEC_DIGEST.md)\n4. For transitions that cross phases (e.g., LEAD-TO-PLAN), also read the TARGET phase digest\n\n### Key Insight\n\nThis is an INTENTIONAL design decision, not a bug. Re-reading reinforces protocol adherence. When the gate blocks, simply read the required files and retry. Do NOT invoke RCA or treat this as a process issue.\n\n### Quick Reference\n\n| Handoff | Files to Read Before |\n|---------|---------------------|\n| LEAD-TO-PLAN | DIGEST, CORE_DIGEST, LEAD_DIGEST, PLAN_DIGEST |\n| PLAN-TO-EXEC | DIGEST, CORE_DIGEST, PLAN_DIGEST, EXEC_DIGEST |\n| EXEC-TO-PLAN | DIGEST, CORE_DIGEST, EXEC_DIGEST, PLAN_DIGEST |\n| PLAN-TO-LEAD | DIGEST, CORE_DIGEST, PLAN_DIGEST, LEAD_DIGEST |\n| LEAD-FINAL | DIGEST, CORE_DIGEST, LEAD_DIGEST |',
  2384,
  '{"source_sd": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-006", "source_piq": "1c589d37-c10f-458e-b9e3-a2b01f2f3779", "generated_by": "learn_system"}'::jsonb
) ON CONFLICT (protocol_id, section_type, order_index) DO UPDATE SET
  content = EXCLUDED.content,
  metadata = EXCLUDED.metadata;

-- 4. Schema Validation Helper
-- PIQ: 90dcaddb-d698-4e1a-a85f-3d0f20e7c3c9
INSERT INTO leo_protocol_sections (
  protocol_id, section_type, title, content, order_index, metadata
) VALUES (
  'leo-v4-3-3-ui-parity',
  'schema_validation_helper',
  'Schema Validation Helper for Database Queries',
  E'## Schema Validation Helper\n\nBefore executing database queries (especially SELECT statements with specific columns), validate that the referenced columns actually exist in the target table.\n\n### Common Failure Pattern\n\nQuerying a column that does not exist (e.g., `risk_assessment` on `strategic_directives_v2`) causes runtime errors that interrupt the workflow.\n\n### Prevention Approach\n\n1. **Check schema docs first**: Read `docs/reference/schema/engineer/tables/<table_name>.md` to verify column names\n2. **Use information_schema**: Query `information_schema.columns` to verify column existence before building dynamic queries\n3. **Fallback gracefully**: When a column is not found, omit it from the SELECT rather than failing\n\n### Verification Query\n\n```sql\nSELECT column_name \nFROM information_schema.columns \nWHERE table_schema = ''public'' \n  AND table_name = ''<table_name>'' \nORDER BY ordinal_position;\n```\n\n### When to Apply\n\n- Before any ad-hoc database query in scripts\n- When building dynamic SELECT statements\n- When migrating queries between table versions\n- After schema changes that may have renamed or removed columns',
  2385,
  '{"source_sd": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-006", "source_piq": "90dcaddb-d698-4e1a-a85f-3d0f20e7c3c9", "generated_by": "learn_system"}'::jsonb
) ON CONFLICT (protocol_id, section_type, order_index) DO UPDATE SET
  content = EXCLUDED.content,
  metadata = EXCLUDED.metadata;

-- 5. Pre-commit Hook Edge Case Testing Checklist
-- PIQ: f02894ef-aae4-48da-8395-ab3a5b10df31
INSERT INTO leo_protocol_sections (
  protocol_id, section_type, title, content, order_index, metadata
) VALUES (
  'leo-v4-3-3-ui-parity',
  'precommit_hook_edge_case_checklist',
  'Pre-commit Hook Edge Case Testing Checklist',
  E'## Pre-commit Hook Edge Case Testing Checklist\n\nWhen modifying pre-commit hooks or adding new ones, test these edge cases before shipping:\n\n### Mandatory Test Matrix\n\n| # | Test Case | How to Verify |\n|---|-----------|---------------|\n| 1 | Normal commit with SD active | `git commit` succeeds with valid SD claim |\n| 2 | Commit without SD active | Hook blocks or warns appropriately |\n| 3 | Merge commit from main | `git merge origin/main` followed by commit succeeds |\n| 4 | Auto-generated files (schema docs) | Files from main are not flagged as secrets |\n| 5 | Large file commit (>1MB) | Hook handles gracefully, no timeout |\n| 6 | Binary file commit (images, PDFs) | Secret detection skips binary files |\n| 7 | File with Supabase API refs | Secret detection does not false-positive on API URL patterns |\n| 8 | Commit with --no-verify | Bypass works when explicitly requested |\n| 9 | Empty commit (--allow-empty) | Hook handles gracefully |\n| 10 | Amend commit | Hook re-validates correctly |\n\n### Regression Indicators\n\n- False positives on auto-generated schema documentation\n- Timeout on large commits (>50 files)\n- Blocking merge commits that resolve conflicts\n- Failing on files that were already committed on main\n\n### After Testing\n\nDocument results in the PR description with pass/fail for each test case.',
  2386,
  '{"source_sd": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-006", "source_piq": "f02894ef-aae4-48da-8395-ab3a5b10df31", "generated_by": "learn_system"}'::jsonb
) ON CONFLICT (protocol_id, section_type, order_index) DO UPDATE SET
  content = EXCLUDED.content,
  metadata = EXCLUDED.metadata;

-- Update PIQ items to APPLIED status (if they exist)
UPDATE protocol_improvement_queue
SET status = 'APPLIED',
    assigned_sd_id = 'SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-006'
WHERE id IN (
  'f1a670ab-1a0f-4a73-a9fa-f921f8328fe5',
  'ff9dc5bc-ecb5-42ac-959d-e1f9edb4293e',
  '1c589d37-c10f-458e-b9e3-a2b01f2f3779',
  '90dcaddb-d698-4e1a-a85f-3d0f20e7c3c9',
  'f02894ef-aae4-48da-8395-ab3a5b10df31'
);

COMMIT;
