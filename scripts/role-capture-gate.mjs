#!/usr/bin/env node
/**
 * SD-LEO-INFRA-FORCE-ROLE-SESSIONS-001 (FR-2) — CLI for the role capture obligation.
 *
 *   node scripts/role-capture-gate.mjs check      --role <adam|coordinator|solomon> [--json]
 *   node scripts/role-capture-gate.mjs record     --role <role> --text @<file>
 *   node scripts/role-capture-gate.mjs no-capture --role <role> --note "<why>"
 *
 * *** THIS PROCESS ALWAYS EXITS 0, INCLUDING WHEN THE GATE STATE IS REQUIRED. ***
 * That is not laxity, it is what makes AC-6 hold. The Adam and coordinator quiet ticks spawn each
 * core as a CHILD PROCESS via scriptCore(key, args) and read a non-zero exit as a core FAILURE, so
 * a gate that exited non-zero to mean "you owe a capture" would be indistinguishable from a gate
 * that crashed — and would degrade the very tick it rides on. Forward-motion pressure is carried
 * by the STATE TOKEN on the emitted line, which the role must clear; never by killing the tick.
 *
 * --text takes @<file> rather than an inline string because a learning body containing quotes,
 * apostrophes or newlines does not survive shell quoting.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import {
  ROLES, GATE_STATE, isKnownRole,
  evaluateRoleCaptureGate, recordForcedCapture, recordNoCaptureMarker,
} from '../lib/learning/role-capture-gate.js';

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function readTextArg(raw) {
  if (!raw) return null;
  return raw.startsWith('@') ? readFileSync(raw.slice(1), 'utf8') : raw;
}

function emit(line) { console.log(line); }

async function main() {
  const verb = process.argv[2];
  const role = String(arg('--role') || '').toLowerCase();
  const asJson = process.argv.includes('--json');

  if (!['check', 'record', 'no-capture'].includes(verb)) {
    emit(`ROLE_CAPTURE_GATE=? state=USAGE verbs=check|record|no-capture roles=${ROLES.join('|')}`);
    return;
  }
  // An unknown role is named, never silently defaulted to one — defaulting would let a typo
  // satisfy or block the wrong seat.
  if (!isKnownRole(role)) {
    emit(`ROLE_CAPTURE_GATE=${role || '?'} state=STORE_ERROR error=unknown_role known=${ROLES.join('|')}`);
    return;
  }

  const supabase = createSupabaseServiceClient();

  if (verb === 'check') {
    const r = await evaluateRoleCaptureGate({ supabase, role });
    if (asJson) { emit(JSON.stringify(r)); return; }
    emit(
      `ROLE_CAPTURE_GATE=${r.role} state=${r.state} kind=${r.kind ?? 'none'} ` +
      `age=${r.ageSeconds ?? 'na'} window=${r.windowSeconds ?? 'na'}` +
      (r.error ? ` error=${r.error}` : '') +
      (r.state === GATE_STATE.REQUIRED
        ? ` action=record_a_capture_or_declare_no_capture`
        : '')
    );
    return;
  }

  if (verb === 'record') {
    const text = readTextArg(arg('--text'));
    const r = await recordForcedCapture({ supabase, role, text });
    if (r.recorded) { emit(`ROLE_CAPTURE_GATE=${role} state=RECORDED kind=capture pattern=${r.patternId}`); return; }
    emit(`ROLE_CAPTURE_GATE=${role} state=REJECTED kind=capture${r.error ? ` error=${r.error}` : ''}`);
    // Print the scorer's own reasons so the role sees WHICH rubric check failed rather than
    // guessing. The commonest miss is a file path with no directory: the referent pattern
    // requires a slash-qualified path (lib/foo/bar.js), an SD-/QF-/PAT- key, or a table reference.
    for (const reason of r.reasons || []) emit(`  reason: ${reason}`);
    return;
  }

  // no-capture — the UNSCORED path. See lib/learning/role-capture-gate.js header.
  const r = await recordNoCaptureMarker({ supabase, role, note: arg('--note') || '' });
  emit(r.recorded
    ? `ROLE_CAPTURE_GATE=${role} state=RECORDED kind=no_capture_marker emission=${r.emissionType} pattern=${r.patternId}`
    : `ROLE_CAPTURE_GATE=${role} state=STORE_ERROR error=${r.error}`);
}

main()
  .catch((err) => {
    // Even an unexpected throw must not hand a non-zero exit to the tick that spawned us.
    emit(`ROLE_CAPTURE_GATE=? state=STORE_ERROR error=${err.message}`);
  })
  .finally(() => {
    // process.exit() races a closing libuv handle on Windows (exit 127) — set the code instead.
    process.exitCode = 0;
  });
