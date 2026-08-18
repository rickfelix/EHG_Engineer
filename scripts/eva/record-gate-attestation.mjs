#!/usr/bin/env node
/**
 * Record an interim human-attested gate check — SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-7.
 *
 * Writes a row into venture_gate_attestations. All real validation (citation shape, actor
 * identity, judge<>producer) is enforced by the table's own DB CHECK constraints — this CLI's
 * job is a clean, unambiguous flag parse plus surfacing the DB's rejection reason legibly,
 * never reimplementing that validation client-side (a client-side copy can drift from the
 * DB constraint it is supposed to mirror).
 *
 * Usage:
 *   node scripts/eva/record-gate-attestation.mjs \
 *     --venture <uuid> --type <stage17_judgment|chairman_site_review> --verdict <PASS|BLOCKED|NO_DATA> \
 *     --citation "<url|kind:id|path@sha>" --actor "<real name>" --producer "<real name>" \
 *     --subject-ref "<what was reviewed>" --path-to-pass "<what would need to change>" \
 *     [--content-hash <sha256>] [--findings '<json object>']
 *
 * Exit codes: 0 = recorded, 1 = rejected (bad flags or DB constraint violation), 2 = table not
 * yet applied (chairman migration pending).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { parseFlags } from '../../lib/eva/lifecycle/cli-flag-parser.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const KNOWN_FLAGS = ['--venture', '--type', '--verdict', '--citation', '--actor', '--producer', '--subject-ref', '--path-to-pass', '--content-hash', '--findings'];
const REQUIRED = ['--venture', '--type', '--verdict', '--citation', '--actor', '--producer', '--subject-ref', '--path-to-pass'];

function isMissingRelationError(error) {
  const code = error?.code || '';
  const message = String(error?.message || '');
  return code === 'PGRST205' || code === '42P01' || /schema cache/i.test(message);
}

export function buildAttestationRow(values) {
  return {
    venture_id: values['--venture'],
    check_type: values['--type'],
    verdict: values['--verdict'],
    citation: values['--citation'],
    attested_by: values['--actor'],
    produced_by: values['--producer'],
    subject_ref: values['--subject-ref'],
    path_to_pass: values['--path-to-pass'],
    subject_content_hash: values['--content-hash'] || null,
    findings: values['--findings'] ? JSON.parse(values['--findings']) : {},
    enforcement_strength: 'convention',
  };
}

export async function main(argv = process.argv, deps = {}) {
  const { values, error: parseError } = parseFlags(argv, KNOWN_FLAGS);
  if (parseError) {
    console.error(`FLAG ERROR: ${parseError}`);
    return { exitCode: 1 };
  }

  const missing = REQUIRED.filter((f) => !values[f]);
  if (missing.length > 0) {
    console.error(`Missing required flag(s): ${missing.join(', ')}`);
    return { exitCode: 1 };
  }

  let row;
  try {
    row = buildAttestationRow(values);
  } catch (err) {
    console.error(`Invalid --findings JSON: ${err.message}`);
    return { exitCode: 1 };
  }

  const supabase = deps.supabase || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data, error } = await supabase.from('venture_gate_attestations').insert(row).select('id, verdict, computed_at').single();

  if (error) {
    if (isMissingRelationError(error)) {
      console.error('venture_gate_attestations does not exist yet — the chairman-gated migration has not been applied.');
      return { exitCode: 2 };
    }
    // Surface the DB CHECK constraint's own message legibly rather than a raw PostgREST dump —
    // the constraint names (vga_attested_by_is_identified, vga_attester_not_producer, etc.) are
    // self-documenting in the migration's own CHECK definitions.
    console.error(`REJECTED by database constraint: ${error.message}`);
    return { exitCode: 1 };
  }

  console.log(`Recorded: id=${data.id} venture=${row.venture_id} type=${row.check_type} verdict=${data.verdict} at=${data.computed_at}`);
  return { exitCode: 0, id: data.id };
}

if (isMainModule(import.meta.url)) {
  main().then(({ exitCode }) => process.exit(exitCode));
}
