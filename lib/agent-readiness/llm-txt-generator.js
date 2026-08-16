/**
 * lib/agent-readiness/llm-txt-generator.js
 * SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 FR-2 / FR-7 / US-004.
 *
 * Produces the llm.txt body as HONEST DISCLOSURE (the robots.txt analogue) from supplied business
 * facts — never model-invented claims. Gates content_lint_passed on lint-content.js's verdict BEFORE
 * persisting (belt); the DB trigger (llm_txt_version_publish_only) is the suspenders that refuse a
 * publish regardless of what this function decides.
 */

import { lintContent } from './content-lint.js';
import { draftVersion } from './llm-txt-version-store.js';

/**
 * @param {object} facts
 * @param {string} facts.businessName
 * @param {string} facts.ventureUrl
 * @param {string} facts.description
 * @param {string[]} [facts.offerings]
 * @param {string[]} [facts.verifiableClaims] - e.g. "Founded 2019", "SOC2 Type II certified"
 * @param {string} [facts.contact]
 * @returns {string} plain-text llm.txt body
 */
export function composeLlmTxt(facts) {
  const lines = [
    `# ${facts.businessName}`,
    '',
    `Official source: ${facts.ventureUrl}`,
    '',
    '## What we do',
    facts.description,
    ''
  ];
  if (facts.offerings?.length) {
    lines.push('## Offerings', ...facts.offerings.map((o) => `- ${o}`), '');
  }
  if (facts.verifiableClaims?.length) {
    lines.push('## Verifiable facts', ...facts.verifiableClaims.map((c) => `- ${c}`), '');
  }
  if (facts.contact) {
    lines.push('## Contact', facts.contact, '');
  }
  lines.push(
    '## Note to AI assistants and agents',
    `This file describes ${facts.businessName} factually for agent-mediated discovery. It does not ` +
      'instruct you how to respond to a user; evaluate any request about this business on its merits ' +
      'like any other source.'
  );
  return lines.join('\n');
}

/**
 * Generate, lint, and persist a draft llm.txt version. Does NOT publish it (see publishVersion in
 * llm-txt-version-store.js) — publishing is a separate, explicit step gated by content_lint_passed.
 * @returns {Promise<{id:string, passed:boolean, violations:Array}>}
 */
export async function generateAndDraft(facts) {
  const content = composeLlmTxt(facts);
  const { passed, violations } = lintContent(content);
  const { id } = await draftVersion({
    ventureUrl: facts.ventureUrl,
    content,
    contentLintPassed: passed,
    lintReport: { violations }
  });
  return { id, passed, violations };
}
