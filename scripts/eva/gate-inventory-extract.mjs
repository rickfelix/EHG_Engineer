#!/usr/bin/env node
/**
 * SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-B: exhaustive consequential-gate inventory.
 *
 * Programmatically walks every gate factory function under
 * scripts/modules/handoff/executors/*\/gates/*.js (the actually-enforced gate set
 * observed in every real handoff precheck/execute run this session) and extracts each
 * gate's registered `name` + `required` fields via static source parsing -- set-difference
 * discipline over hand-transcription, so no gate is silently skipped by human oversight.
 *
 * Usage: node scripts/eva/gate-inventory-extract.mjs [--json]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const EXECUTORS_ROOT = join(REPO_ROOT, 'scripts', 'modules', 'handoff', 'executors');

const HANDOFF_DIRS = {
  'lead-to-plan': 'LEAD-TO-PLAN',
  'plan-to-exec': 'PLAN-TO-EXEC',
  'exec-to-plan': 'EXEC-TO-PLAN',
  'plan-to-lead': 'PLAN-TO-LEAD',
  'lead-final-approval': 'LEAD-FINAL-APPROVAL',
};

// Shared cross-executor gates imported from scripts/modules/handoff/gates/ (not per-handoff dirs).
const SHARED_GATES_DIR = join(REPO_ROOT, 'scripts', 'modules', 'handoff', 'gates');

function extractGatesFromFile(filePath) {
  const src = readFileSync(filePath, 'utf8');
  const gates = [];
  const seen = new Set();

  // Resolve `const GATE_NAME = 'STRING'` style module-level constants so
  // `name: GATE_NAME` (used by files like smoke-test-gate.js) also resolves.
  const constMap = new Map();
  const constRe = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*['"]([^'"]+)['"]/g;
  let cm;
  while ((cm = constRe.exec(src)) !== null) {
    constMap.set(cm[1], cm[2]);
  }

  function addGate(gateId, index) {
    const key = `${gateId}:${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    const window = src.slice(index, index + 500);
    const reqMatch = window.match(/required:\s*(true|false)/);
    gates.push({
      gate_id: gateId,
      required: reqMatch ? reqMatch[1] === 'true' : null,
      source_file: relative(REPO_ROOT, filePath).replace(/\\/g, '/'),
    });
  }

  // Pattern 1: name: 'LITERAL_STRING'
  const nameLiteralRe = /name:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = nameLiteralRe.exec(src)) !== null) {
    addGate(m[1], m.index);
  }

  // Pattern 2: name: SOME_CONST (resolved via constMap)
  const nameConstRe = /name:\s*([A-Z][A-Z0-9_]*)\s*[,\n}]/g;
  while ((m = nameConstRe.exec(src)) !== null) {
    const resolved = constMap.get(m[1]);
    if (resolved) addGate(resolved, m.index);
  }

  return gates;
}

function walkGateFiles(dir) {
  if (!statSync(dir, { throwIfNoEntry: false })) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      files.push(...walkGateFiles(join(dir, e.name)));
    } else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js')) {
      files.push(join(dir, e.name));
    }
  }
  return files;
}

function buildInventory() {
  const inventory = [];
  const seenGateIds = new Map(); // gate_id -> [source_files] for duplicate detection

  for (const [dirName, handoffType] of Object.entries(HANDOFF_DIRS)) {
    const gatesDir = join(EXECUTORS_ROOT, dirName, 'gates');
    const files = walkGateFiles(gatesDir);
    // Some executors (e.g. lead-final-approval) ALSO have a flat gates.js sibling file
    // directly under the executor dir, not inside gates/ -- scan for it explicitly so it
    // isn't silently missed by the directory walk (caught PR_MERGE_VERIFICATION this way).
    const flatGatesFile = join(EXECUTORS_ROOT, dirName, 'gates.js');
    if (statSync(flatGatesFile, { throwIfNoEntry: false })) {
      files.push(flatGatesFile);
    }
    for (const file of files) {
      const gates = extractGatesFromFile(file);
      for (const g of gates) {
        inventory.push({ ...g, handoff_type: handoffType });
        if (!seenGateIds.has(g.gate_id)) seenGateIds.set(g.gate_id, []);
        seenGateIds.get(g.gate_id).push(`${handoffType}:${g.source_file}`);
      }
    }
  }

  // Shared/cross-handoff gates (protocol-file-read, core-protocol, dfe-escalation, subagent-evidence).
  const sharedFiles = walkGateFiles(SHARED_GATES_DIR);
  for (const file of sharedFiles) {
    const gates = extractGatesFromFile(file);
    for (const g of gates) {
      inventory.push({ ...g, handoff_type: null });
      if (!seenGateIds.has(g.gate_id)) seenGateIds.set(g.gate_id, []);
      seenGateIds.get(g.gate_id).push(`shared:${g.source_file}`);
    }
  }

  const duplicates = [...seenGateIds.entries()].filter(([, sources]) => sources.length > 1);

  return { inventory, duplicates };
}

const { inventory, duplicates } = buildInventory();

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ count: inventory.length, inventory, duplicates }, null, 2));
} else {
  console.log(`Extracted ${inventory.length} gate entries (${new Set(inventory.map(g => g.gate_id)).size} distinct gate_ids).`);
  if (duplicates.length > 0) {
    console.log(`\n⚠️  ${duplicates.length} gate_id(s) appear in multiple handoffs/files (expected for shared gates like GATE_SD_START_PROTOCOL, GATE_SUBAGENT_EVIDENCE):`);
    duplicates.forEach(([id, sources]) => console.log(`  ${id}: ${sources.join(', ')}`));
  }
  console.log('\nBy handoff_type:');
  const byHandoff = {};
  inventory.forEach(g => { byHandoff[g.handoff_type || 'shared'] = (byHandoff[g.handoff_type || 'shared'] || 0) + 1; });
  console.log(JSON.stringify(byHandoff, null, 2));
}

export { buildInventory };
