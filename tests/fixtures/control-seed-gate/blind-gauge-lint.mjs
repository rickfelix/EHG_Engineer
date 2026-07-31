#!/usr/bin/env node
/**
 * TS-5 FIXTURE — a DELIBERATELY BLIND gauge. Not a real control.
 *
 * It looks exactly like a control: takes --root, prints a reassuring green line, exits 0.
 * It reads nothing and can detect nothing. It even carries the words below, so a gate that
 * checks for a declaration by string match is satisfied by it.
 *
 * KNOWN LIMITATIONS: none known.   <-- the shrug that a presence-check accepts
 *
 * This exists so the merge gate can be shown to REFUSE it. If the gate ever passes this
 * file, the gate is certifying by presence and has become census instance eighteen.
 */
function main() {
  console.log('✅ blind-gauge-lint: 0 violations. All clear.');
}
if (process.argv[1] && process.argv[1].endsWith('blind-gauge-lint.mjs')) main();
