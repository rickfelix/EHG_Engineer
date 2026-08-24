// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 / FR-4 + FR-6.
//
// Produces the `.after.sql` and `.diff.txt` evidence artifacts by applying EXACT, single-occurrence
// substitutions to the `.before.sql` files captured live via pg_get_functiondef(). Every anchor must
// match exactly once or this script throws -- an AFTER body is therefore provably the live BEFORE body
// plus the enumerated stamp lines, never a retyped approximation. The migration file then carries the
// generated AFTER bodies verbatim, and the DDL test asserts that verbatim-ness (see
// tests/ddl/strategic-directives-canonical-writer-choke-ddl.db.test.js).
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'database/evidence/canonical-writer-choke';

/** @type {Record<string, Array<{find: string, replace: string}>>} */
const EDITS = {
  fn_atomic_lead_to_plan_transition: [
    {
      find: "         status            = 'in_progress',\n",
      replace:
        "         status            = 'in_progress',\n" +
        "         lifecycle_write_token = 'fn_atomic_lead_to_plan_transition',\n",
    },
  ],
  fn_atomic_exec_to_plan_transition: [
    {
      find: "    status = 'active',\n",
      replace:
        "    status = 'active',\n" +
        "    lifecycle_write_token = 'fn_atomic_exec_to_plan_transition',\n",
    },
  ],
  auto_transition_status: [
    {
      find:
        "        IF NEW.current_phase = 'EXEC' AND NEW.progress >= 100 THEN\n" +
        "          NEW.status = 'pending_approval';\n" +
        '        END IF;\n',
      replace:
        "        IF NEW.current_phase = 'EXEC' AND NEW.progress >= 100 THEN\n" +
        '          IF NEW.lifecycle_write_token IS NULL THEN\n' +
        "            NEW.lifecycle_write_token = 'auto_transition_status';\n" +
        '          END IF;\n' +
        "          NEW.status = 'pending_approval';\n" +
        '        END IF;\n',
    },
    {
      find:
        "        IF NEW.current_phase = 'PLAN' AND NEW.progress >= 100 THEN\n" +
        "          NEW.status = 'pending_approval';\n" +
        '        END IF;\n',
      replace:
        "        IF NEW.current_phase = 'PLAN' AND NEW.progress >= 100 THEN\n" +
        '          IF NEW.lifecycle_write_token IS NULL THEN\n' +
        "            NEW.lifecycle_write_token = 'auto_transition_status';\n" +
        '          END IF;\n' +
        "          NEW.status = 'pending_approval';\n" +
        '        END IF;\n',
    },
  ],
  complete_orchestrator_sd: [
    {
      find: "    SET status = 'pending_approval', updated_at = now()\n",
      replace:
        "    SET status = 'pending_approval', lifecycle_write_token = 'complete_orchestrator_sd', updated_at = now()\n",
    },
    {
      find:
        "  SET status = 'completed', current_phase = 'COMPLETED', is_working_on = false, updated_at = now()\n",
      replace:
        "  SET status = 'completed', current_phase = 'COMPLETED', is_working_on = false, lifecycle_write_token = 'complete_orchestrator_sd', updated_at = now()\n",
    },
  ],
  update_sd_after_exec_completion: [
    {
      find: '            END,\n            updated_at = NOW()\n',
      replace:
        '            END,\n' +
        "            lifecycle_write_token = 'update_sd_after_exec_completion',\n" +
        '            updated_at = NOW()\n',
    },
  ],
  update_sd_after_lead_evaluation: [
    {
      find: '        END,\n        updated_at = NOW()\n',
      replace:
        '        END,\n' +
        "        lifecycle_write_token = 'update_sd_after_lead_evaluation',\n" +
        '        updated_at = NOW()\n',
    },
  ],
  update_sd_after_plan_validation: [
    {
      find: '        END,\n        updated_at = NOW()\n',
      replace:
        '        END,\n' +
        "        lifecycle_write_token = 'update_sd_after_plan_validation',\n" +
        '        updated_at = NOW()\n',
    },
  ],
  update_sd_progress_from_phases: [
    {
      find: '            LIMIT 1\n        ),\n        updated_at = NOW()\n',
      replace:
        '            LIMIT 1\n' +
        '        ),\n' +
        "        lifecycle_write_token = 'update_sd_progress_from_phases',\n" +
        '        updated_at = NOW()\n',
    },
    {
      find: "        status = 'completed',\n        completion_date = NOW()\n",
      replace:
        "        status = 'completed',\n" +
        '        completion_date = NOW(),\n' +
        "        lifecycle_write_token = 'update_sd_progress_from_phases'\n",
    },
  ],
};

function countOccurrences(haystack, needle) {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

function unifiedDiff(beforeText, afterText, label) {
  const b = beforeText.split('\n');
  const a = afterText.split('\n');
  const lines = [`--- ${label}.before.sql`, `+++ ${label}.after.sql`];
  let bi = 0;
  let ai = 0;
  while (bi < b.length || ai < a.length) {
    if (bi < b.length && ai < a.length && b[bi] === a[ai]) {
      lines.push(`  ${b[bi]}`);
      bi += 1;
      ai += 1;
    } else if (ai < a.length && (bi >= b.length || !b.slice(bi).includes(a[ai]))) {
      lines.push(`+ ${a[ai]}`);
      ai += 1;
    } else if (bi < b.length) {
      lines.push(`- ${b[bi]}`);
      bi += 1;
    } else {
      lines.push(`+ ${a[ai]}`);
      ai += 1;
    }
  }
  return lines.join('\n');
}

const summary = [];
for (const [name, edits] of Object.entries(EDITS)) {
  const beforePath = path.join(OUT, `${name}.before.sql`);
  // A repo-level EOL hook rewrites checked-in files to CRLF. Normalize on read so the anchors below
  // (and the DDL test's verbatim comparison) are line-ending agnostic rather than silently missing.
  const raw = fs.readFileSync(beforePath, 'utf8').replace(/\r\n/g, '\n');
  // The capture header is provenance, not SQL. Split it off so the diff shows only the definition.
  const defStart = raw.indexOf('CREATE OR REPLACE FUNCTION');
  if (defStart === -1) throw new Error(`no CREATE OR REPLACE FUNCTION in ${beforePath}`);
  const header = raw.slice(0, defStart);
  const beforeDef = raw.slice(defStart);

  let afterDef = beforeDef;
  for (const { find, replace } of edits) {
    const hits = countOccurrences(afterDef, find);
    if (hits !== 1) {
      throw new Error(
        `ANCHOR DRIFT in ${name}: expected exactly 1 occurrence of anchor, found ${hits}.\n` +
          `Anchor:\n${find}`,
      );
    }
    afterDef = afterDef.replace(find, replace);
  }
  if (afterDef === beforeDef) throw new Error(`${name}: no change produced`);
  if (!afterDef.includes('lifecycle_write_token')) throw new Error(`${name}: stamp missing from AFTER`);

  const afterHeader = header.replace('BEFORE artifact', 'AFTER artifact (generated)').replace(
    '-- Source: live consolidated engineer DB.',
    '-- Source: this file is the BEFORE capture with ONLY the enumerated stamp lines inserted, produced\n' +
      '-- by scripts/one-off/gen-canonical-writer-stamp-amendments.mjs (exactly-once anchor matching).\n' +
      '-- Original source: live consolidated engineer DB.',
  );
  fs.writeFileSync(path.join(OUT, `${name}.after.sql`), afterHeader + afterDef);
  fs.writeFileSync(path.join(OUT, `${name}.diff.txt`), unifiedDiff(beforeDef, afterDef, name) + '\n');
  const added = afterDef.split('\n').length - beforeDef.split('\n').length;
  summary.push(`${name}: +${added} line(s)`);
}

console.log(summary.join('\n'));
