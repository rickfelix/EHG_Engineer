/**
 * Inter-SD interface contracts
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 4 (FR-008)
 *
 * When sibling SDs are built independently (parallel worktrees), their interfaces
 * must line up — the engine (D) and the DB-connection (C) can't be built in
 * separate sessions and then fail to integrate. S14's blueprint_api_contract /
 * data_model declares what each SD PRODUCES; each SD also declares what it
 * CONSUMES from siblings. This module checks every consumed item is produced
 * somewhere in the tree, so a mismatch is caught at PLAN, not at merge.
 *
 * Pure logic — headlessly unit-testable.
 *
 * @module lib/eva/bridge/interface-contracts
 */

/**
 * Check a single consumer against a single producer's contract.
 * @param {string[]} produced - operations/fields the producer declares
 * @param {string[]} consumed - what the consumer requires
 * @returns {{consistent:boolean, missing:string[]}} missing = consumed but not produced
 */
export function checkContractConsistency(produced = [], consumed = []) {
  const have = new Set((Array.isArray(produced) ? produced : []));
  const missing = (Array.isArray(consumed) ? consumed : []).filter((c) => !have.has(c));
  return { consistent: missing.length === 0, missing };
}

/**
 * Check the whole tree: every item any SD CONSUMES must be PRODUCED by some SD in
 * the tree. Returns the unmet consumptions per SD (empty => the tree integrates).
 *
 * @param {Array<{key:string, produces?:string[], consumes?:string[]}>} sds
 * @returns {{consistent:boolean, unmet:Array<{key:string, missing:string[]}>}}
 */
export function checkTreeContracts(sds = []) {
  const list = Array.isArray(sds) ? sds : [];
  const producedAll = new Set();
  for (const sd of list) for (const p of (sd && sd.produces) || []) producedAll.add(p);

  const unmet = [];
  for (const sd of list) {
    const missing = ((sd && sd.consumes) || []).filter((c) => !producedAll.has(c));
    if (missing.length) unmet.push({ key: sd.key, missing });
  }
  return { consistent: unmet.length === 0, unmet };
}
