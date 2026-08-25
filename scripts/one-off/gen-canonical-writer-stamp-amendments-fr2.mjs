// SD-LEO-INFRA-FOLLOW-WIRE-REGISTERED-001 / FR-2.
//
// Same discipline as scripts/one-off/gen-canonical-writer-stamp-amendments.mjs (SD-LEO-INFRA-
// STRATEGIC-DIRECTIVES-CANONICAL-001): produces .after.sql / .diff.txt evidence from the live
// .before.sql captures, via an EXACT single-occurrence regex match (capturing real indentation
// rather than hand-typed anchors, to avoid whitespace-drift errors) so the AFTER body is provably
// the live BEFORE body plus the stamp line, never a retyped approximation.
import fs from 'node:fs';
import path from 'node:path';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const OUT = 'database/evidence/canonical-writer-choke';

// Each pattern must match the strategic_directives_v2 UPDATE's `updated_at = NOW()/now()` line
// (captured indentation in group 1) followed by the WHERE clause that disambiguates it from any
// other `updated_at` assignment in the same function body (e.g. fn_rollback_sd_hierarchy also
// updates product_requirements_v2). $1 is reused in the replacement to preserve indentation.
const TARGETS = {
  complete_business_evaluation: {
    pattern: /^([ \t]*)(updated_at = NOW\(\))\n([ \t]*WHERE id = p_sd_id;)$/m,
  },
  request_business_evaluation: {
    pattern: /^([ \t]*)(updated_at = NOW\(\))\n([ \t]*WHERE id = p_sd_id\n[ \t]*AND status = 'draft';)$/m,
  },
  fn_rollback_sd_hierarchy: {
    pattern: /^([ \t]*)(updated_at = NOW\(\))\n([ \t]*WHERE id = ANY\(v_descendant_ids\)\n[ \t]*AND status != 'cancelled';)$/m,
  },
  delete_venture: {
    pattern: /^([ \t]*)(updated_at = now\(\))\n([ \t]*WHERE venture_id = p_venture_id\n[ \t]*AND status NOT IN \('completed', 'cancelled'\);)$/m,
  },
  kill_venture: {
    pattern: /^([ \t]*)(updated_at = now\(\))\n([ \t]*WHERE venture_id = p_venture_id\n[ \t]*AND status NOT IN \('completed', 'cancelled'\);)$/m,
  },
};

function countMatches(text, re) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  return (text.match(g) || []).length;
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

function main() {
  const summary = [];
  for (const [name, { pattern }] of Object.entries(TARGETS)) {
    const beforePath = path.join(OUT, `${name}.before.sql`);
    const raw = fs.readFileSync(beforePath, 'utf8').replace(/\r\n/g, '\n');
    const defStart = raw.indexOf('CREATE OR REPLACE FUNCTION');
    if (defStart === -1) throw new Error(`no CREATE OR REPLACE FUNCTION in ${beforePath}`);
    const header = raw.slice(0, defStart);
    const beforeDef = raw.slice(defStart);

    const hits = countMatches(beforeDef, pattern);
    if (hits !== 1) {
      throw new Error(`ANCHOR DRIFT in ${name}: expected exactly 1 match, found ${hits}.\nPattern: ${pattern}`);
    }
    const afterDef = beforeDef.replace(pattern, (_m, indent, updatedAtLine, whereClause) =>
      `${indent}lifecycle_write_token = '${name}',\n${indent}${updatedAtLine}\n${whereClause}`
    );
    if (afterDef === beforeDef) throw new Error(`${name}: no change produced`);
    if (!afterDef.includes('lifecycle_write_token')) throw new Error(`${name}: stamp missing from AFTER`);

    const afterHeader = header
      .replace('BEFORE artifact', 'AFTER artifact (generated)')
      .replace(
        '-- Source: live consolidated engineer DB.',
        '-- Source: this file is the BEFORE capture with ONLY the enumerated stamp line inserted, produced\n' +
          '-- by scripts/one-off/gen-canonical-writer-stamp-amendments-fr2.mjs (exactly-once anchor matching).\n' +
          '-- Original source: live consolidated engineer DB.'
      );
    fs.writeFileSync(path.join(OUT, `${name}.after.sql`), afterHeader + afterDef);
    fs.writeFileSync(path.join(OUT, `${name}.diff.txt`), unifiedDiff(beforeDef, afterDef, name) + '\n');
    const added = afterDef.split('\n').length - beforeDef.split('\n').length;
    summary.push(`${name}: +${added} line(s)`);
  }
  console.log(summary.join('\n'));
}

if (isMainModule(import.meta.url)) {
  main();
}
