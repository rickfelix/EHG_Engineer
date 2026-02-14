/**
 * Add reference document paths to EVA Remediation SD descriptions
 *
 * Replaces the generic "Source: docs/audits/eva-comprehensive/" line with
 * specific references to:
 * - The relevant audit report(s) for each SD
 * - The Vision spec (docs/plans/eva-venture-lifecycle-vision.md)
 * - The Architecture spec (docs/plans/eva-platform-architecture.md)
 *
 * Run: node scripts/one-time/add-eva-remediation-reference-docs.cjs
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const GENERIC_SOURCE = 'Source: docs/audits/eva-comprehensive/ (12 completed audit reports from SD-EVA-QA-AUDIT-ORCH-001)';

const VISION = 'docs/plans/eva-venture-lifecycle-vision.md';
const ARCH = 'docs/plans/eva-platform-architecture.md';

// Per-SD reference mapping
const refs = [
  {
    sd_key: 'SD-EVA-FIX-CHAIRMAN-GATES-001',
    audits: ['vision/audit-report.md'],
    specs: [VISION],
    notes: 'Vision defines Chairman decision points at stages 10, 22, 25'
  },
  {
    sd_key: 'SD-EVA-FIX-STAGE15-RISK-001',
    audits: ['phase-4-blueprint.md'],
    specs: [ARCH],
    notes: 'Architecture Section 8.4 defines Risk Register schema for Stage 15'
  },
  {
    sd_key: 'SD-EVA-FIX-ERROR-LOGGING-001',
    audits: ['cross-cutting/audit-report.md'],
    specs: [],
    notes: 'Cross-cutting findings CRIT-002/003, HIGH-001 for error and logging patterns'
  },
  {
    sd_key: 'SD-EVA-FIX-UTILITY-DEDUP-001',
    audits: ['cross-cutting/audit-report.md'],
    specs: [],
    notes: 'Cross-cutting CRIT-001: 25 parseJSON copies identified'
  },
  {
    sd_key: 'SD-EVA-FIX-DB-SCHEMA-001',
    audits: ['database-schema/audit-report.md'],
    specs: [ARCH],
    notes: 'Architecture defines ENUM types and stage data structure'
  },
  {
    sd_key: 'SD-EVA-FIX-REALITY-GATES-001',
    audits: ['phase-2-engine/audit-report.md', 'vision/audit-report.md', 'phase-3-identity/audit-report.md'],
    specs: [VISION],
    notes: 'Vision defines reality gate boundaries; Engine CRITICAL-1 for wrong artifacts; Identity for dual-gate'
  },
  {
    sd_key: 'SD-EVA-FIX-INFRA-BUGS-001',
    audits: ['infrastructure/audit-report.md'],
    specs: [],
    notes: 'Infrastructure CRIT-001/002/003, HIGH-001/005 — all in event bus and CLI'
  },
  {
    sd_key: 'SD-EVA-FIX-KILL-GATES-001',
    audits: ['phase-4-blueprint.md', 'phase-6-launch/audit-report.md', 'phase-2-engine/audit-report.md'],
    specs: [VISION],
    notes: 'Vision v4.7 defines risk thresholds (7=caution, 9=chairman); Blueprint #8 for Stage 13; Launch CC-3 for Stage 23'
  },
  {
    sd_key: 'SD-EVA-FIX-DOSSIER-REBUILD-001',
    audits: ['dossier-reconciliation/'],
    specs: [VISION],
    notes: 'Vision defines authoritative 25-stage names for dossier alignment'
  },
  {
    sd_key: 'SD-EVA-FIX-TEMPLATE-ALIGN-001',
    audits: [
      'phase-3-identity/audit-report.md',
      'phase-5-buildloop/audit-report.md',
      'phase-6-launch/audit-report.md',
      'phase-2-engine/audit-report.md'
    ],
    specs: [ARCH],
    notes: 'Architecture v2.0 defines required fields per stage; each phase audit lists missing fields'
  },
  {
    sd_key: 'SD-EVA-FIX-ENUM-NAMING-001',
    audits: ['phase-5-buildloop/audit-report.md', 'cross-cutting/audit-report.md'],
    specs: [ARCH],
    notes: 'Build Loop Finding 2 lists 8 typeof fields; Cross-cutting HIGH-003 for DI naming'
  },
  {
    sd_key: 'SD-EVA-FIX-POST-LAUNCH-001',
    audits: ['phase-6-launch/audit-report.md', 'vision/audit-report.md'],
    specs: [VISION],
    notes: 'Vision HIGH-002 defines Stage 25 decision routing; Launch audit for test gaps'
  }
];

async function main() {
  console.log('=== Adding Reference Documents to EVA Remediation SDs ===\n');

  let ok = 0;
  let fail = 0;

  for (const ref of refs) {
    // Fetch current description
    const { data: sd, error: fetchErr } = await db
      .from('strategic_directives_v2')
      .select('sd_key,description')
      .eq('sd_key', ref.sd_key)
      .single();

    if (fetchErr || !sd) {
      console.error(`FAIL ${ref.sd_key}: ${fetchErr?.message || 'not found'}`);
      fail++;
      continue;
    }

    // Build reference block
    const lines = ['Reference documents:'];
    for (const audit of ref.audits) {
      lines.push(`- Audit: docs/audits/eva-comprehensive/${audit}`);
    }
    for (const spec of ref.specs) {
      lines.push(`- Spec: ${spec}`);
    }

    const refBlock = lines.join('\n');

    // Replace generic source line with specific references
    const newDesc = sd.description.replace(GENERIC_SOURCE, refBlock);

    if (newDesc === sd.description) {
      console.log(`SKIP ${ref.sd_key}: generic source line not found (already replaced?)`);
      continue;
    }

    const { error: updateErr } = await db
      .from('strategic_directives_v2')
      .update({ description: newDesc })
      .eq('sd_key', ref.sd_key);

    if (updateErr) {
      console.error(`FAIL ${ref.sd_key}: ${updateErr.message}`);
      fail++;
    } else {
      console.log(`OK ${ref.sd_key}: ${ref.audits.length} audit(s) + ${ref.specs.length} spec(s)`);
      ok++;
    }
  }

  console.log(`\n=== Done: ${ok} updated, ${fail} failed ===`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
