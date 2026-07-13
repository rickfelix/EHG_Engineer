#!/usr/bin/env node
// QF-20260713-946: durably capture 3 high-priority retro action items as issue_patterns
// rows. The canonical path (scripts/auto-extract-patterns-from-retro.js ->
// IssueKnowledgeBase.createPattern()) is confirmed broken (reproduced this session,
// deterministic PAT-001 collision -- same bug hit and RCA'd by QF-20260713-000 earlier
// today). Mirrors the ALREADY-PROVEN-SAFE content-fingerprint id scheme from
// lib/rca/rca-orchestrator.js:291 (PAT-AUTO-<fingerprint8>) instead of the broken
// lexicographic read-max-and-increment generator.
import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_ID = '6629ee0d-633a-4da6-bcb0-2536611c3f8b'; // SD-FDBK-FIX-FLEET-WIDE-CLAUDE-001
const RETRO_ID = '1232b41d-071a-4812-b3cb-9de47f4e2727';

const items = [
  {
    issue_summary: 'Add a live-deployed-state test (querying pg_get_functiondef against production, no transaction rollback) to every future migration whose deployment is time-critical to an active incident, not just to create_or_replace_session.',
    category: 'testing',
    severity: 'high',
    prevention_checklist: [
      'A migration test that runs its SQL inside a transaction it always rolls back proves the migration FILE is correct but can never detect that the migration was never actually deployed',
      'Any migration whose deployment matters for an active incident needs a companion live-deployed-state check that queries pg_get_functiondef against the actual production object, not just the file',
      'Owner: PLAN -- specify this test class explicitly when the PRD scopes an incident-critical migration',
    ],
  },
  {
    issue_summary: 'When amending a migration authored by an earlier SD, diff the full live object definition against the migration text before re-staging it, to catch unrelated hardening (like SET search_path) that landed after the original authoring date.',
    category: 'process',
    severity: 'high',
    prevention_checklist: [
      'Before amending code someone else already patched, diff the CURRENT deployed object against the migration text field-by-field, not just the specific bug being fixed',
      'A narrowly-scoped fix can silently regress unrelated hardening that landed after the original migration was authored (here, a SET search_path clause)',
      'Owner: EXEC -- run pg_get_functiondef on the live object before re-staging any amendment to a prior migration',
    ],
  },
  {
    issue_summary: 'Route any coordinator signal message containing backtick-quoted code through a write-to-file-then-$(cat file) pattern instead of an inline double-quoted Bash string, to eliminate shell command-substitution risk entirely rather than relying on the deploy guard to catch it downstream.',
    category: 'process',
    severity: 'high',
    prevention_checklist: [
      'Backtick-quoted inline code snippets passed directly inside a double-quoted Bash string trigger real shell command substitution, even when the intent was purely descriptive text',
      'Write descriptive/code-snippet text to a file first and read it back via $(cat file) instead of inlining it in a double-quoted string',
      'Owner: ALL -- this is a structural fix (eliminate the risk), not reliance on the deploy guard as a safety net (it caught this incident, but should not be the only control)',
    ],
  },
];

for (const item of items) {
  const fingerprint = crypto.createHash('sha256').update(item.issue_summary).digest('hex').slice(0, 8);
  const pattern_id = `PAT-AUTO-${fingerprint}`;

  const { data: existing } = await supabase
    .from('issue_patterns')
    .select('id, pattern_id')
    .eq('pattern_id', pattern_id)
    .maybeSingle();
  if (existing) {
    console.log(`SKIP (already exists): ${pattern_id}`);
    continue;
  }

  const { data, error } = await supabase
    .from('issue_patterns')
    .insert({
      pattern_id,
      category: item.category,
      severity: item.severity,
      issue_summary: item.issue_summary,
      occurrence_count: 1,
      first_seen_sd_id: SD_ID,
      last_seen_sd_id: SD_ID,
      prevention_checklist: item.prevention_checklist,
      status: 'active',
      source: 'retrospective',
      metadata: {
        retrospective_id: RETRO_ID,
        captured_via: 'scripts/one-off/insert-patterns-qf-20260713-946.mjs',
        reason: 'Canonical auto-extract-patterns-from-retro.js path confirmed broken this session (PAT-001 collision, reproduced via --dry-run against this retro; same bug already RCA\'d + harness-bug-signaled by QF-20260713-000 earlier today) -- manual capture using the proven-safe PAT-AUTO-<fingerprint> id scheme instead of the broken sequential generator.',
        source_qf: 'QF-20260713-946',
      },
    })
    .select('id, pattern_id')
    .single();

  if (error) {
    console.error(`INSERT FAIL (${pattern_id}):`, error.message);
    process.exit(1);
  }
  console.log(`CREATED: ${data.pattern_id} (${data.id})`);
}
