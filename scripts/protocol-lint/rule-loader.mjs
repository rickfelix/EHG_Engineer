/**
 * Rule discovery for the protocol linter.
 *
 * Scans `rules/declarative/*.json` (compiled via `compileDeclarativeRule`)
 * and `rules/code/*.mjs` (dynamic-imported; module must `export default` a
 * rule object with `{ id, severity, description, check(ctx) }`).
 *
 * SD-PROTOCOL-LINTER-001, slice 2/n.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_RULES_DIR = join(__dirname, 'rules');

/**
 * Load and return every enabled rule from both declarative and code sources.
 * @param {{rulesDir?: string}} opts
 */
export async function loadRules({ rulesDir = DEFAULT_RULES_DIR } = {}) {
  const rules = [];
  rules.push(...await loadDeclarativeRules(join(rulesDir, 'declarative')));
  rules.push(...await loadCodeRules(join(rulesDir, 'code')));
  return rules;
}

async function loadDeclarativeRules(dir) {
  const files = await safeReaddir(dir);
  const out = [];
  for (const name of files.filter(f => f.endsWith('.json'))) {
    const raw = await readFile(join(dir, name), 'utf8');
    const spec = JSON.parse(raw);
    out.push(compileDeclarativeRule(spec));
  }
  return out;
}

async function loadCodeRules(dir) {
  const files = await safeReaddir(dir);
  const out = [];
  for (const name of files.filter(f => f.endsWith('.mjs'))) {
    const mod = await import(pathToFileURL(join(dir, name)).href);
    const rule = mod.default;
    if (!rule || !rule.id || typeof rule.check !== 'function') continue;
    out.push(rule);
  }
  return out;
}

async function safeReaddir(dir) {
  try {
    return await readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * Compile a declarative JSON rule spec into a runnable rule object.
 *
 * Supported `pattern_type` values:
 *   - `required_phrase`  — every matching section must CONTAIN `pattern`
 *   - `forbidden_phrase` — no matching section may contain `pattern`
 *
 * Optional `section_type_filter` narrows the match to sections where
 * `section_type === <value>`.
 */
export function compileDeclarativeRule(spec) {
  if (!spec.id || !spec.severity || !spec.pattern_type) {
    throw new Error(`Invalid declarative rule: ${JSON.stringify(spec)}`);
  }
  const matches = (s) =>
    spec.section_type_filter == null || s.section_type === spec.section_type_filter;

  return {
    id: spec.id,
    severity: spec.severity,
    description: spec.description || '',
    enabled: spec.enabled !== false,
    check: (ctx) => {
      const sections = ctx.sections || [];
      switch (spec.pattern_type) {
        case 'required_phrase':
          return sections
            .filter(matches)
            .filter(s => !(s.content || '').includes(spec.pattern))
            .map(s => ({
              section_id: s.id,
              message: `Missing required phrase: "${spec.pattern}"`,
              context: { section_name: s.section_name, pattern: spec.pattern }
            }));
        case 'forbidden_phrase':
          return sections
            .filter(matches)
            .filter(s => (s.content || '').includes(spec.pattern))
            .map(s => ({
              section_id: s.id,
              message: `Contains forbidden phrase: "${spec.pattern}"`,
              context: { section_name: s.section_name, pattern: spec.pattern }
            }));
        default:
          throw new Error(`Unknown pattern_type for ${spec.id}: ${spec.pattern_type}`);
      }
    }
  };
}
