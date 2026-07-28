#!/usr/bin/env node
/**
 * FR-5 provenance: append the self-score operating-reality block to leo_protocol_sections
 * 601 (Adam) and 611 (Solomon). SD-LEO-INFRA-ROLE-SESSION-SELF-001.
 *
 * WHY THIS FILE EXISTS AT ALL, and it is the SD's own thesis pointed at itself. FR-5 changed the
 * DATABASE source of truth, and the branch originally carried only the generated CLAUDE_ADAM.md /
 * CLAUDE_SOLOMON.md — i.e. the edit had NO REPRODUCIBLE PROVENANCE. A reviewer could see the
 * markdown changed but could not re-derive, re-apply or audit the change that caused it, and the
 * FR-5 content test would keep passing on a reverted branch because it asserts live-DB state this
 * commit did not produce. That is a corrected design surviving only in a transcript, which is
 * exactly the failure mode this SD documents in its own LEAD verification.
 *
 * IDEMPOTENT: keyed on the section marker, so re-running is a no-op rather than a duplicate block.
 *
 * Usage: node scripts/one-off/_fr5-self-score-operating-reality-sections.mjs [--dry-run]
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';

const MARKER = '### Self-score cadence — the operating reality';

const block = (role, flag, writer) => `

${MARKER} (SD-LEO-INFRA-ROLE-SESSION-SELF-001 FR-5)

Recorded because the contract previously asserted a cadence that the runtime did not provide, and
a reader had no way to tell the difference. Three facts, each verifiable in code:

1. **THE SCORER SHIPS INERT.** \`${writer}\` gates on \`${flag}\` and no-ops when it is not
   exactly \`on\`. The default is \`off\`, and the variable is set nowhere — not in \`.env\`, not in
   \`.env.example\`, not in \`.claude/settings.json\`, not in any cron. A ${role} self-score does
   NOT happen by itself.

2. **\`--force\` IS THE OPERATING PATH, and it is chairman-directed — not a workaround.** The
   self-score loop is armed on a 6h cadence and its prompt MANDATES re-running with \`--force\`
   when the flag gate blocks (QF-20260719-825: *the chairman-directed cadence outranks the
   ships-inert default*, and *a flag-gated no-op is escalated by the agent rather than silently
   accepted*). So "inert" describes the FLAG, not the cadence: scoring is expected every ~6h via
   \`--force\`, and the staleness gauge trips at 8h precisely because that expectation is real.
   A ${role} session that reads "ships inert" as "no score is expected" has misread this.

3. **\`leo_feature_flags\` IS A GAUGE FOR THIS FLAG, NOT A GATE.** \`${writer}\` reads
   \`process.env\` only, and nothing hydrates \`leo_feature_flags\` into the environment. Flipping
   \`is_enabled\` on that row therefore has **no runtime effect whatsoever** — it changes a
   dashboard, not a behaviour. Do not "turn on the scorer" by editing that table.

**If live enablement is genuinely wanted**, it is its own change with its own blast radius (review
noise and feedback-table write saturation across the parallel worker sessions, the coordinator and
Adam) and it must go through \`SD-LEO-INFRA-ENABLE-TRI-PARTY-001\` — currently CANCELLED — rather
than arriving as a side effect of a fix. Note also that the three staleness gauges in
\`lib/governance/gauge-registry.js\` ship \`enabled:false\` DELIBERATELY PAIRED with these cadence
flags: enabling the writers alone gives scoring with no staleness detection, and enabling the
gauges alone gives a permanent false trip. Flip both together or neither.`;

const TARGETS = [
  { id: 601, role: 'Adam', flag: 'ADAM_SELF_SCORE_CADENCE', writer: 'scripts/adam-self-assessment-writer.cjs' },
  { id: 611, role: 'Solomon', flag: 'SOLOMON_SELF_SCORE_CADENCE', writer: 'scripts/solomon-self-assessment-writer.cjs' },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const db = createSupabaseServiceClient();
  for (const t of TARGETS) {
    const { data, error } = await db.from('leo_protocol_sections').select('content').eq('id', t.id).single();
    if (error) { console.log(`id ${t.id} (${t.role}): READ FAILED — ${error.message}`); continue; }
    const cur = data?.content || '';
    if (cur.includes(MARKER)) { console.log(`id ${t.id} (${t.role}): already present — no-op`); continue; }
    if (dryRun) { console.log(`id ${t.id} (${t.role}): WOULD append ${block(t.role, t.flag, t.writer).length} chars`); continue; }
    const { error: wErr } = await db.from('leo_protocol_sections')
      .update({ content: cur + block(t.role, t.flag, t.writer) }).eq('id', t.id);
    console.log(`id ${t.id} (${t.role}): ${wErr ? 'ERR ' + wErr.message : 'appended'}`);
  }
  console.log('\nNow regenerate the markdown so the docs match the DB:');
  console.log('  node scripts/generate-claude-md-from-db.js && node scripts/check-claude-md-drift.cjs');
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });
