#!/usr/bin/env node
/**
 * One-shot patch for scanner defect (c) found while validating
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151 at PLAN_TO_LEAD.
 *
 * Defect: the registry scanner decided "the deliverable imports validator-registry/index.js" with a
 * raw substring test over the WHOLE file. The deliverable's header comment says
 * "registerGateLValidators, called at validator-registry/index.js:38" -- prose, not an import. The
 * scanner read that sentence as an import and reported reachability to the shared singleton that
 * does not exist. Fix: strip comments, then look only at actual import/require statements.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const TARGET =
  'scripts/one-off/_regression-write-result-sd-learn-fix-address-pattern-learn-151-plan-to-lead.mjs';

const OLD_IMPORTS_CHECK = `  const deliverableImportsIndex =
    deliverableSrc.includes('validator-registry/index') ||
    /from\\s+['"][^'"]*validator-registry['"]/.test(deliverableSrc);`;

const NEW_IMPORTS_CHECK = `  // Scanner defect (c): deciding "imports index.js" by substring over the WHOLE file read the
  // deliverable's HEADER COMMENT ("registerGateLValidators, called at validator-registry/index.js:38")
  // as an import. Strip comments first, then inspect only real import/require statements.
  const codeOnly = deliverableSrc
    .replace(/\\/\\*[\\s\\S]*?\\*\\//g, '')
    .split('\\n')
    .map(l => l.replace(/^\\s*\\/\\/.*$/, ''))
    .join('\\n');
  const importStatements = codeOnly
    .split('\\n')
    .filter(l => /^\\s*import\\b/.test(l) || /\\brequire\\s*\\(/.test(l));
  const deliverableImportsIndex = importStatements.some(
    l => l.includes('validator-registry/index') || /validator-registry['"]/.test(l)
  );
  // Does the deliverable ever touch the EXPORTED singleton binding by name?
  const deliverableTouchesSingleton = /\\bvalidatorRegistry\\b/.test(codeOnly);`;

const OLD_SCAN_FIELDS = `    deliverable_imports_registry_index: deliverableImportsIndex,`;
const NEW_SCAN_FIELDS = `    deliverable_imports_registry_index: deliverableImportsIndex,
    deliverable_references_exported_singleton: deliverableTouchesSingleton,`;

const OLD_DEFECTS = `      'factory-call singleton false negative (create*ValidatorRegistry now matched)',`;
const NEW_DEFECTS = `      'factory-call singleton false negative (create*ValidatorRegistry now matched)',
      'comment-as-import false positive (import detection now ignores comments)',`;

const OLD_R4 = `        'which is built by a FACTORY CALL. Had I trusted run 1, I would have reported ' +
        '"no shared registry exists" -- the opposite of the truth -- and reached the right verdict ' +
        'on a false premise. Both defects are fixed in the committed scanner; the stored artifact is ' +
        'from the corrected run.',`;
const NEW_R4 = `        'which is built by a FACTORY CALL. Had I trusted run 1, I would have reported ' +
        '"no shared registry exists" -- the opposite of the truth -- and reached the right verdict ' +
        'on a false premise. (c) A THIRD false positive in run 2: "does the deliverable import ' +
        'index.js" was a substring test over the whole file, so it matched the deliverable\\'s HEADER ' +
        'COMMENT ("registerGateLValidators, called at validator-registry/index.js:38") -- prose read ' +
        'as an import. Corrected to inspect only real import statements after stripping comments; ' +
        'the deliverable imports ONLY core.js and the gate module. All three defects are fixed in the ' +
        'committed scanner; the stored artifact is from the fully corrected run.',`;

function apply(src, oldStr, newStr, label) {
  if (!src.includes(oldStr)) {
    console.error('ANCHOR NOT FOUND:', label);
    process.exit(1);
  }
  console.log('patched:', label);
  return src.replace(oldStr, newStr);
}

function main() {
  let s = readFileSync(TARGET, 'utf8');
  const before = s.length;
  s = apply(s, OLD_IMPORTS_CHECK, NEW_IMPORTS_CHECK, 'import detection');
  s = apply(s, OLD_SCAN_FIELDS, NEW_SCAN_FIELDS, 'scan fields');
  s = apply(s, OLD_DEFECTS, NEW_DEFECTS, 'defect list');
  s = apply(s, OLD_R4, NEW_R4, 'finding R4');
  writeFileSync(TARGET, s, 'utf8');
  console.log('OK', before, '->', s.length);
}

if (isMainModule(import.meta.url)) main();
