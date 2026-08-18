#!/usr/bin/env node
// SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001 FR-5.
//
// Pins a reproducible 30-SD baseline (the most-recently-completed infrastructure-type SDs as of
// EXEC start) and runs the (now testing_evidence-aware) classifier read-only against each, to
// prove this SD's change moves zero real SDs off their current classification -- because no
// production writer for metadata.fr_coverage exists yet (a separately-tracked follow-up SD).
// Writes docs/reference/fr-delivery-baseline-30.json and prints the pre-merge report.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classifyFrDelivery } from '../modules/handoff/gates/fr-delivery-classifier.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', '..', 'docs', 'reference', 'fr-delivery-baseline-30.json');

async function main() {
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, sd_type, status, completion_date, metadata')
    .eq('status', 'completed')
    .eq('sd_type', 'infrastructure')
    .order('completion_date', { ascending: false, nullsFirst: false })
    .limit(30);

  if (error) throw new Error(`Failed to query completed infrastructure SDs: ${error.message}`);
  if (!sds || sds.length < 30) {
    console.warn(`WARNING: only found ${sds?.length ?? 0} completed infrastructure SDs (wanted 30)`);
  }

  const results = [];
  let sdsWithRegexMentions = 0;
  let totalAdmittedTestingRowsSeen = 0;
  let totalFrsDeliveredViaTestingEvidence = 0;
  let sdsMovedByTestingEvidence = 0;

  for (const sd of sds) {
    const classification = await classifyFrDelivery(supabase, {
      sdId: sd.id,
      directiveId: sd.sd_key,
      sdMetadata: sd.metadata || {},
    });

    if (classification.regex_fr_mentions.length > 0) sdsWithRegexMentions += 1;
    totalAdmittedTestingRowsSeen += classification.testing_evidence_rows_seen;
    const deliveredViaTestingEvidence = classification.frs.filter((f) => f.delivery_basis === 'testing_evidence').length;
    totalFrsDeliveredViaTestingEvidence += deliveredViaTestingEvidence;
    if (deliveredViaTestingEvidence > 0) sdsMovedByTestingEvidence += 1;

    results.push({
      sd_key: sd.sd_key,
      completion_date: sd.completion_date,
      total: classification.total,
      delivered: classification.delivered,
      descoped: classification.descoped,
      undelivered: classification.undelivered,
      unverifiable: classification.unverifiable,
      convention_in_use: classification.convention_in_use,
      has_work_product: classification.has_work_product,
      regex_fr_mentions_count: classification.regex_fr_mentions.length,
      testing_evidence_rows_seen: classification.testing_evidence_rows_seen,
      unmatched_fr_coverage_ids: classification.unmatched_fr_coverage_ids,
      delivered_via_testing_evidence: deliveredViaTestingEvidence,
    });
  }

  const baseline = {
    generated_at: new Date().toISOString(),
    sd_type_filter: 'infrastructure',
    sd_count: results.length,
    query: "status='completed' AND sd_type='infrastructure', ordered by completion_date DESC, limit 30",
    sds: results,
  };

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');

  console.log('=== FR-5 pre-merge pinned-baseline report ===');
  console.log(`SDs pinned: ${results.length}`);
  console.log(`SDs with >=1 regex_fr_mentions (report-only, never delivery-promoting): ${sdsWithRegexMentions}`);
  console.log(`Admitted-phase TESTING rows seen across all pinned SDs: ${totalAdmittedTestingRowsSeen}`);
  console.log(`FRs delivered via testing_evidence (matched, schema-valid fr_coverage): ${totalFrsDeliveredViaTestingEvidence}`);
  console.log(`SDs newly moved off 100%-unverifiable/undelivered via testing_evidence: ${sdsMovedByTestingEvidence}`);
  console.log(sdsMovedByTestingEvidence === 0
    ? 'REASON: 0 SDs moved -- no production TESTING-agent writer for metadata.fr_coverage exists yet (deferred follow-up SD); this SD only adds the READER.'
    : 'NOTE: some SDs DID move -- a fr_coverage writer already exists in production; investigate before treating this as a zero-blast-radius reader-only change.');
  console.log(`Baseline written to: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
