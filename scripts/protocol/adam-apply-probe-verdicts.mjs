/**
 * Apply named-rule substance-probe verdicts onto the imperative inventory.
 * SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 — FR-1.
 *
 * Each verdict was produced by a HAND-WRITTEN probe encoding what the duty actually is, then
 * run against the approved shortened contract. The automated substance score is deliberately
 * NOT used: it was falsified against ground truth (a verified-lost duty scored 55%, a
 * verified-surviving one 54%), so it cannot separate the classes.
 */
import fs from 'fs';

const INV = 'docs/protocol/adam-contract-review-2026-07-29/imperative-inventory.json';

// [inventory-matching regex, verdict, evidence]
const VERDICTS = [
  // Confirmed present in the shortened contract under reworded prose.
  [/belt.{0,30}(never|not).{0,10}(dry|empty)/i, 'landed', 'substance probe: belt-never-dry law present'],
  [/belt.countdown/i, 'landed', 'substance probe: belt countdown duty present'],
  [/adam_task_ledger|rehydrateboard/i, 'landed', 'substance probe: board reconcile duty present'],
  [/decision.driving|chairman-decisions\.mjs/i, 'landed', 'substance probe: decision-driving sweep present'],
  [/quiet.hours|22:00|10pm/i, 'landed', 'substance probe: quiet-hours pause present'],
  [/acknowledged_at is null|full.inbox/i, 'landed', 'substance probe: full-inbox polling present'],
  [/north star|exelon|quit.threshold/i, 'landed', 'substance probe: chairman north star present'],
  [/fabricate a kr|per-scope anchor/i, 'landed', 'substance probe: per-scope anchoring present'],
  [/okr.drift|analyzeokrdrift/i, 'landed', 'substance probe: OKR-drift-patch present'],
  [/pre-ship|source-attribution|placeholder.honesty/i, 'landed', 'substance probe: artifact pre-ship gate present'],
  [/encode.before.next.use|conversation-only/i, 'landed', 'substance probe: encode-before-next-use present'],
  [/notifychairman|todoist|reminder_add/i, 'landed', 'substance probe: chairman phone-notify present'],
  [/taper|meta.to.product|distance.to.quit/i, 'landed', 'substance probe: taper rule present'],
  [/labell?ed options|details keyword|recommended option/i, 'landed', 'substance probe: ratified SMS message format present'],
  [/auto.default|no.reply/i, 'landed', 'substance probe: no-reply/auto-default policy present'],
  [/sleep window|america\/new_york/i, 'landed', 'substance probe: sleep-window strong handling present'],
  [/usage chart|oauthaccount/i, 'landed', 'substance probe: account-switch/usage duty present'],
  [/force-unfence|verify.first/i, 'landed', 'substance probe: block-resolution method present'],
  [/counterfactual/i, 'landed', 'substance probe: per-idea rationale bar present'],
  [/board-scan|eva.drain|vision-drift/i, 'landed', 'substance probe: per-scope task block present'],

  // Confirmed ABSENT and NOT companion-bound: a duty deleted outright.
  [/^\*{0,2}ACCEPTANCE-SITTING OWNERSHIP/i, 'NEEDS_DECISION',
    'CONFIRMED DELETION. Zero trace in the shortened contract (sitting/acceptance/reschedule/t-24 all 0 occurrences). Chairman-DELEGATED duty carrying 5 obligations. It is a DUTY, not how-to, so it belongs in the contract itself — must be RESTORED, not relocated.'],

  // Absent, but liveness is a chairman question — must not be silently dropped either way.
  [/every half hour|30 minutes.{0,40}hourly|temporary cadence/i, 'NEEDS_DECISION',
    'ABSENT and UNRESOLVED. Chairman verbal 2026-07-19 set the SMS heartbeat to 30min UNTIL HE RESTORES HOURLY. The shortened contract keeps hourly, so landing it silently cancels a possibly-live directive. Requires chairman confirmation — do not assume either state.'],

  // Absent by design: how-to content whose destination is the MANUAL companion.
  [/leo-create-sd|sd-create|creation field shape/i, 'merged_into',
    'EXPECTED RELOCATION, not loss: SD-creation how-to belongs in CLAUDE_ADAM_MANUAL.md. Absence from the contract is intended — but the companion does not exist yet, so this is only correct once it does.'],
];

const inv = JSON.parse(fs.readFileSync(INV, 'utf8'));
let applied = 0;
const counts = {};
for (const e of inv.entries) {
  for (const [re, verdict, evidence] of VERDICTS) {
    if (re.test(e.imperative)) {
      // Never downgrade a hand-adjudicated NEEDS_DECISION to landed on a later weaker match.
      if (e.probe_evidence && e.disposition === 'NEEDS_DECISION' && verdict === 'landed') break;
      e.disposition = verdict;
      e.probe_evidence = evidence;
      applied++;
      counts[verdict] = (counts[verdict] || 0) + 1;
      break;
    }
  }
}

inv.counts.landed = inv.entries.filter((e) => e.disposition === 'landed').length;
inv.counts.needs_decision = inv.entries.filter((e) => e.disposition === 'NEEDS_DECISION').length;
inv.probe_campaign = {
  method: 'hand-written substance probes; the automated score was falsified against ground truth and is NOT used',
  named_rules: { original: 178, proposed: 104, dropped: 85, probed: 36 },
  scope_limit: 'NAMED RULES ONLY. Says nothing about unnamed obligations, which are the majority.'
};

fs.writeFileSync(INV, JSON.stringify(inv, null, 1));
console.log('verdicts applied to', applied, 'entries:', JSON.stringify(counts));
console.log('inventory now — landed:', inv.counts.landed, '| NEEDS_DECISION:', inv.counts.needs_decision, '| total:', inv.entries.length);
