/**
 * contract-target-resolver — maps a chairman-ratification target contract to the SET of
 * rendered files that carry it. SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-B (W2 child B), PR1.
 *
 * WHY THIS EXISTS
 * lib/chairman/ratification-writer.mjs verifies an encoded ruling's marker against exactly ONE
 * file: it reads manifest.section_digests.meta[section_id].target_file, a scalar, and never
 * iterates row.target_contracts. Measured 2026-09-03 over the live ledger: 49 encoded rows name
 * 105 target-contract slots, only 48 are covered, 57 (54.3%) were never verified and 34 of 49
 * rows are short. "Verify at every target" was not implementable because no name-to-file mapping
 * existed anywhere -- VALID_TARGET_CONTRACTS (ratification-writer.mjs:22) is a membership
 * allowlist used only at :74, and both capture-detector.mjs:88 and ratification-stall.mjs:43
 * merely join the array into a display string.
 *
 * WHY section-file-mapping.json AND NOT THE MANIFEST
 * scripts/modules/claude-md-generator/index.js:745-747 states in-source that the DB column
 * `target_file` is deliberately EXCLUDED from the section digest because it is not rendered --
 * "placement is keyed off section_type via the mapping". Measured over 291 live sections the two
 * sources agree on only 67 and disagree on 48, and target_file is NULL for 176 (86 of which the
 * mapping nonetheless places). The mapping is therefore the generator's real placement authority
 * and the only correct source for this resolver.
 *
 * WHY A SET AND NOT A SCALAR
 * The mapping is keyed file -> {sections:[section_type]}, so inverting it is one-to-MANY. Four
 * section types legitimately land in more than one file (e.g. role_partnership_contract ->
 * CLAUDE_ADAM.md + CLAUDE_COORDINATOR.md). Live data already exercises this: 5 of 49 markers
 * span companion files. A scalar return is wrong by construction, which is why the SD's
 * acceptance criterion requires set EQUALITY rather than a non-empty result -- a resolver
 * returning one file per contract would pass a membership check while reproducing the exact
 * under-verification defect this child exists to close.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Mirrors VALID_TARGET_CONTRACTS in ratification-writer.mjs:22. Kept as its own frozen copy so
 *  this module has no import cycle with the writer; the parity test asserts the two agree. */
export const TARGET_CONTRACTS = Object.freeze(['adam', 'coordinator', 'solomon', 'protocol']);

/** Not a path. section-file-mapping.json carries a `SHARED` pseudo-key holding 26 section types
 *  that are injected into several rendered files; it must never appear in a resolved file set. */
export const PSEUDO_KEYS = Object.freeze(['SHARED']);

/** Role contracts own a filename prefix; everything else real is the `protocol` residual. */
const ROLE_PREFIXES = Object.freeze({
  adam: 'CLAUDE_ADAM',
  coordinator: 'CLAUDE_COORDINATOR',
  solomon: 'CLAUDE_SOLOMON',
});

const DEFAULT_REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAPPING_RELPATH = join('scripts', 'section-file-mapping.json');

export class ContractResolutionError extends Error {
  constructor(message, { contract } = {}) {
    super(message);
    this.name = 'ContractResolutionError';
    this.code = 'CONTRACT_UNRESOLVABLE';
    this.contract = contract;
  }
}

/**
 * Read the mapping's real file keys (pseudo-keys excluded).
 * Fail-closed: an unreadable or malformed mapping THROWS rather than yielding an empty set --
 * an empty set would make every marker assertion vacuously satisfiable, which is the fail-open
 * shape this workstream is removing (ratification-writer.mjs:43/:46/:50).
 */
export function readMappingFiles({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  let raw;
  try {
    raw = readFileSync(join(repoRoot, MAPPING_RELPATH), 'utf8');
  } catch (err) {
    throw new ContractResolutionError(
      `section-file-mapping.json unreadable at ${join(repoRoot, MAPPING_RELPATH)}: ${err.message}`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ContractResolutionError(`section-file-mapping.json is not valid JSON: ${err.message}`);
  }
  const files = Object.keys(parsed).filter((k) => !PSEUDO_KEYS.includes(k));
  if (files.length === 0) {
    throw new ContractResolutionError('section-file-mapping.json contains no real file keys');
  }
  return files;
}

/** Which contract owns a rendered file. Role prefixes win; everything else is `protocol`. */
export function contractForFile(file) {
  for (const [contract, prefix] of Object.entries(ROLE_PREFIXES)) {
    if (file === `${prefix}.md` || file.startsWith(`${prefix}_`)) return contract;
  }
  return 'protocol';
}

/**
 * Full contract -> sorted file list map, derived from the mapping.
 *
 * FR-2 DECISION, recorded here because it is a judgment and not a fact: `protocol` is the
 * RESIDUAL of section-file-mapping.json's real file keys after the three role prefixes are
 * removed -- 8 files (CLAUDE.md, CLAUDE_CORE.md, CLAUDE_CORE_MANUAL.md, CLAUDE_LEAD.md,
 * CLAUDE_LEAD_MANUAL.md, CLAUDE_PLAN.md, CLAUDE_PLAN_MANUAL.md, CLAUDE_EXEC.md). It EXCLUDES the
 * `SHARED` pseudo-key (not a path) and EXCLUDES the 7 *_DIGEST.md files, which exist on disk and
 * in the generation manifest but are ABSENT from section-file-mapping.json entirely -- they are
 * generated derivatives, and the mapping is the placement authority. Deriving the residual rather
 * than hardcoding it means a newly-mapped protocol file is picked up automatically; the pinning
 * test asserts the set by EQUALITY so such a change surfaces as a failing test, never silently.
 */
export function buildContractFileMap({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const map = Object.fromEntries(TARGET_CONTRACTS.map((c) => [c, []]));
  for (const file of readMappingFiles({ repoRoot })) {
    map[contractForFile(file)].push(file);
  }
  for (const contract of TARGET_CONTRACTS) map[contract].sort();
  return map;
}

/**
 * Resolve one target contract to the SET of rendered files carrying it.
 * Throws ContractResolutionError for an unknown contract or one that resolves to nothing --
 * never returns an empty set, because a caller iterating an empty set verifies nothing and
 * reports success.
 *
 * @param {string} contract - a member of TARGET_CONTRACTS
 * @param {{repoRoot?: string}} [opts]
 * @returns {string[]} sorted, non-empty list of repo-relative rendered file paths
 */
export function resolveContractTargets(contract, { repoRoot = DEFAULT_REPO_ROOT } = {}) {
  if (typeof contract !== 'string' || contract.trim() === '') {
    throw new ContractResolutionError('target contract must be a non-empty string', { contract });
  }
  const key = contract.trim();
  if (!TARGET_CONTRACTS.includes(key)) {
    throw new ContractResolutionError(
      `unknown target contract '${key}' (known: ${TARGET_CONTRACTS.join(', ')})`,
      { contract: key }
    );
  }
  const files = buildContractFileMap({ repoRoot })[key];
  if (!files || files.length === 0) {
    throw new ContractResolutionError(
      `target contract '${key}' resolved to no rendered files -- refusing to report a vacuous pass`,
      { contract: key }
    );
  }
  return files;
}

/**
 * Resolve every contract a ratification row names, de-duplicated across contracts.
 * A row naming both `adam` and `coordinator` shares no files today, but a future companion could
 * be claimed by two contracts; de-duplicating here keeps the caller's per-file assertion count
 * honest.
 *
 * @param {string[]} contracts - row.target_contracts
 * @returns {{files: string[], byContract: Record<string,string[]>}}
 */
export function resolveRowTargets(contracts, { repoRoot = DEFAULT_REPO_ROOT } = {}) {
  if (!Array.isArray(contracts) || contracts.length === 0) {
    throw new ContractResolutionError('target_contracts must be a non-empty array');
  }
  const byContract = {};
  const all = new Set();
  for (const c of contracts) {
    const files = resolveContractTargets(c, { repoRoot });
    byContract[c] = files;
    for (const f of files) all.add(f);
  }
  return { files: [...all].sort(), byContract };
}
