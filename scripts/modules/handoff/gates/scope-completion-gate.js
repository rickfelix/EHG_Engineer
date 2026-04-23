/**
 * Scope Completion Verification Gate
 * SD: SD-LEO-INFRA-COMPLETION-SCOPE-VERIFICATION-001
 *
 * Extracts deliverables from an SD's architecture plan and verifies
 * each one exists in the codebase. Produces a pass/fail checklist.
 *
 * Runs during /leo complete to prevent marking an SD as done
 * when planned deliverables are missing.
 */

import fs from 'fs';
import path from 'path';
import { createSupabaseServiceClient } from '../../../../lib/supabase-client.js';

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer';

/**
 * Extract deliverable items from architecture plan content.
 * Parses the "Implementation Phases" or "Route & Component Structure" sections
 * for file paths, module names, and table references.
 *
 * @param {string} content - Architecture plan markdown content
 * @returns {Array<{name: string, type: string, checkPattern: string}>}
 */
function extractDeliverables(content) {
  if (!content) return [];

  const deliverables = [];

  // Match file paths (e.g., lib/brainstorm/provider-rotation.js, scripts/foo.js)
  const filePathPattern = /(?:^|\s|`)((?:lib|scripts|src|database)\/[\w/.-]+\.(?:js|mjs|cjs|ts|sql))/gm;
  let match;
  while ((match = filePathPattern.exec(content)) !== null) {
    const filePath = match[1].trim();
    if (!deliverables.some(d => d.checkPattern === filePath)) {
      deliverables.push({
        name: filePath,
        type: 'file',
        checkPattern: filePath
      });
    }
  }

  // Match "New table: <name>" or "CREATE TABLE <name>"
  const tablePattern = /(?:New table|CREATE TABLE(?:\s+IF NOT EXISTS)?)\s*:?\s*(\w{3,})/gi;
  while ((match = tablePattern.exec(content)) !== null) {
    const tableName = match[1].trim();
    if (!deliverables.some(d => d.checkPattern === tableName)) {
      deliverables.push({
        name: `Table: ${tableName}`,
        type: 'table',
        checkPattern: tableName
      });
    }
  }

  // Match "ADD COLUMN <name>" on known tables
  const columnPattern = /ADD COLUMN(?:\s+IF NOT EXISTS)?\s+(\w+)\s+(\w+)/gi;
  while ((match = columnPattern.exec(content)) !== null) {
    const colName = match[1].trim();
    deliverables.push({
      name: `Column: ${colName}`,
      type: 'column',
      checkPattern: colName
    });
  }

  // Match exported function names: "Exports: funcA(), funcB()"
  const exportsPattern = /Exports?:\s*([\w(),\s]+)/gi;
  while ((match = exportsPattern.exec(content)) !== null) {
    const funcs = match[1].match(/(\w+)\(\)/g);
    if (funcs) {
      for (const func of funcs) {
        const funcName = func.replace('()', '');
        deliverables.push({
          name: `Function: ${funcName}`,
          type: 'function',
          checkPattern: funcName
        });
      }
    }
  }

  return deliverables;
}

/**
 * Check if a deliverable exists in the codebase.
 *
 * @param {{name: string, type: string, checkPattern: string}} deliverable
 * @returns {{status: 'found'|'missing'|'ambiguous', evidence: string}}
 */
function checkDeliverable(deliverable) {
  const { type, checkPattern } = deliverable;

  if (type === 'file') {
    const fullPath = path.join(PROJECT_ROOT, checkPattern);
    if (fs.existsSync(fullPath)) {
      return { status: 'found', evidence: `File exists: ${checkPattern}` };
    }
    // Check if file exists with different extension or nearby
    const dir = path.dirname(fullPath);
    const base = path.basename(checkPattern, path.extname(checkPattern));
    if (fs.existsSync(dir)) {
      try {
        const siblings = fs.readdirSync(dir);
        const similar = siblings.filter(f => f.startsWith(base));
        if (similar.length > 0) {
          return { status: 'ambiguous', evidence: `File not found at exact path but similar: ${similar.join(', ')}` };
        }
      } catch { /* ignore */ }
    }
    return { status: 'missing', evidence: `File not found: ${checkPattern}` };
  }

  if (type === 'function') {
    // Grep for the function name in JS/TS files
    try {
      const grepDirs = ['lib', 'scripts/modules'].map(d => path.join(PROJECT_ROOT, d));
      for (const dir of grepDirs) {
        if (!fs.existsSync(dir)) continue;
        const found = grepRecursive(dir, checkPattern);
        if (found) {
          return { status: 'found', evidence: `Function "${checkPattern}" found in ${found}` };
        }
      }
    } catch { /* ignore */ }
    return { status: 'missing', evidence: `Function "${checkPattern}" not found in lib/ or scripts/modules/` };
  }

  if (type === 'table') {
    // Check migration files for CREATE TABLE
    const migrationsDir = path.join(PROJECT_ROOT, 'database', 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const found = grepRecursive(migrationsDir, checkPattern);
      if (found) {
        return { status: 'found', evidence: `Table "${checkPattern}" referenced in ${found}` };
      }
    }
    return { status: 'ambiguous', evidence: `Table "${checkPattern}" not found in migrations (may exist in DB already)` };
  }

  if (type === 'column') {
    const migrationsDir = path.join(PROJECT_ROOT, 'database', 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const found = grepRecursive(migrationsDir, checkPattern);
      if (found) {
        return { status: 'found', evidence: `Column "${checkPattern}" referenced in ${found}` };
      }
    }
    return { status: 'ambiguous', evidence: `Column "${checkPattern}" not found in migrations (may exist in DB already)` };
  }

  return { status: 'ambiguous', evidence: `Unknown deliverable type: ${type}` };
}

/**
 * Simple recursive grep — find first file containing pattern.
 * @param {string} dir
 * @param {string} pattern
 * @returns {string|null} Relative file path or null
 */
function grepRecursive(dir, pattern) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const result = grepRecursive(fullPath, pattern);
        if (result) return result;
      } else if (entry.isFile() && /\.(js|mjs|cjs|ts|sql)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes(pattern)) {
          return path.relative(PROJECT_ROOT, fullPath);
        }
      }
    }
  } catch { /* ignore permission errors */ }
  return null;
}

// Convert a glob (**/ for 0+ path segments, * for chars-in-segment, ? for one char) to RegExp.
function globToRegExp(glob) {
  let src = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        // **/ matches zero or more path segments
        src += '(?:.*/)?';
        i += 2; // skip **/
      } else {
        // ** alone matches any chars
        src += '.*';
        i += 1; // skip second *
      }
    } else if (c === '*') {
      src += '[^/]*';
    } else if (c === '?') {
      src += '.';
    } else if ('.+^${}()|[]\\'.includes(c)) {
      src += '\\' + c;
    } else {
      src += c;
    }
  }
  return new RegExp('^' + src + '$');
}

// True when the child SD inherits arch scope from its parent but has not declared a scope_slice.
// Added for SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-A.
function isInheritedWithoutSlice(sd) {
  if (sd?.scope_slice != null) return false;
  const flag = sd?.metadata?.inherited_from_parent;
  if (flag === true) return true;
  if (Array.isArray(flag) && flag.length > 0) return true;
  return false;
}

// Filter parent arch plan deliverables through the child's scope_slice.
// stages: keep deliverables whose name/path references one of the listed stage numbers.
// deliverable_globs: keep deliverables whose checkPattern matches one of the globs.
// When both set, deliverable must match BOTH (intersection).
function filterBySlice(deliverables, scopeSlice) {
  if (!scopeSlice || typeof scopeSlice !== 'object') return deliverables;

  const stages = Array.isArray(scopeSlice.stages) ? scopeSlice.stages : null;
  const globs = Array.isArray(scopeSlice.deliverable_globs) ? scopeSlice.deliverable_globs : null;

  if ((!stages || stages.length === 0) && (!globs || globs.length === 0)) {
    return deliverables;
  }

  const globRegexes = globs ? globs.map(globToRegExp) : null;

  return deliverables.filter(d => {
    const target = (d.checkPattern || d.name || '').toLowerCase();

    if (stages && stages.length > 0) {
      const stageMatches = stages.some(n => {
        const s = String(n);
        const patterns = [`stage${s}`, `stage_${s}`, `stage-${s}`, `stage ${s}`, `/${s}/`, `s${s}_`, `_s${s}`];
        return patterns.some(p => target.includes(p));
      });
      if (!stageMatches) return false;
    }

    if (globRegexes && globRegexes.length > 0) {
      const cleanPath = d.checkPattern || d.name || '';
      const globMatches = globRegexes.some(rx => rx.test(cleanPath));
      if (!globMatches) return false;
    }

    return true;
  });
}

/**
 * Validate that all architecture plan deliverables are present in the codebase.
 *
 * @param {string} sdKey - The SD key
 * @returns {Promise<{pass: boolean, score: number, issues: string[], warnings: string[], checklist: Array}>}
 */
export async function validateScopeCompletion(sdKey) {
  console.log('\n📋 GATE: Scope Completion Verification');
  console.log('-'.repeat(50));
  console.log(`   SD: ${sdKey}`);

  const supabase = createSupabaseServiceClient();

  // 1. Get the SD's arch_key + scope_slice from metadata
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('metadata, scope_slice, parent_sd_id')
    .eq('sd_key', sdKey)
    .single();

  // Soft-pass path (SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-A):
  // children that inherit parent arch_key but have not declared a scope_slice
  // would otherwise be scored against the full parent deliverable set.
  if (isInheritedWithoutSlice(sd)) {
    console.log('   ℹ️  SD inherits scope from parent but has no scope_slice declared — soft-pass');
    return {
      pass: true,
      score: 70,
      issues: [],
      warnings: [
        `SD inherits scope from parent orchestrator (metadata.inherited_from_parent set) but has no scope_slice declared. Gate returns soft-pass (score=70). Declare scope_slice on the child to score only the claimed subset of parent deliverables.`
      ],
      checklist: [],
      details: {
        type: 'inherited-no-slice',
        inherited_from_parent: sd.metadata.inherited_from_parent,
        parent_sd_id: sd.parent_sd_id || null
      }
    };
  }

  const archKey = sd?.metadata?.arch_key;
  if (!archKey) {
    console.log('   ⚠️  No arch_key in SD metadata — skipping scope verification');
    return { pass: true, score: 100, issues: [], warnings: ['No architecture plan linked — scope verification skipped'], checklist: [] };
  }

  // 2. Fetch the architecture plan content
  const { data: archPlan } = await supabase
    .from('eva_architecture_plans')
    .select('content')
    .eq('plan_key', archKey)
    .single();

  if (!archPlan?.content) {
    console.log(`   ⚠️  Architecture plan ${archKey} not found or empty — skipping`);
    return { pass: true, score: 100, issues: [], warnings: [`Architecture plan ${archKey} not found`], checklist: [] };
  }

  console.log(`   Architecture plan: ${archKey}`);

  // 3. Extract deliverables
  let deliverables = extractDeliverables(archPlan.content);
  const rawDeliverableCount = deliverables.length;
  console.log(`   Deliverables extracted: ${rawDeliverableCount}`);

  // 3a. Apply child's scope_slice filter if declared
  if (sd?.scope_slice) {
    deliverables = filterBySlice(deliverables, sd.scope_slice);
    if (deliverables.length < rawDeliverableCount) {
      console.log(`   scope_slice filter applied: ${deliverables.length}/${rawDeliverableCount} deliverables retained`);
    }
  }

  if (deliverables.length === 0) {
    console.log('   ⚠️  No parseable deliverables found in architecture plan');
    return { pass: true, score: 100, issues: [], warnings: ['No deliverables extracted from architecture plan'], checklist: [] };
  }

  // 4. Check each deliverable
  const checklist = deliverables.map(d => {
    const result = checkDeliverable(d);
    const icon = result.status === 'found' ? '✅' : result.status === 'ambiguous' ? '⚠️' : '❌';
    console.log(`   ${icon} ${d.name}: ${result.status} — ${result.evidence}`);
    return { ...d, ...result };
  });

  // 5. Score
  const found = checklist.filter(c => c.status === 'found').length;
  const missing = checklist.filter(c => c.status === 'missing').length;
  const ambiguous = checklist.filter(c => c.status === 'ambiguous').length;
  const total = checklist.length;
  let score = Math.round(((found + ambiguous * 0.5) / total) * 100);

  // Minimum-deliverables guard: fewer than 2 deliverables caps score at 50%
  // to prevent a single false-positive match from scoring 100%
  if (total < 2) {
    console.log(`   ⚠️  Fewer than 2 deliverables extracted (${total}) — score capped at 50%`);
    score = Math.min(score, 50);
  }

  console.log(`\n   Results: ${found} found, ${ambiguous} ambiguous, ${missing} missing (${total} total)`);
  console.log(`   Score: ${score}/100`);

  // Pass if >50% of deliverables are found (missing items are warnings, not hard blocks)
  const pass = missing <= Math.floor(total * 0.5);

  const issues = missing > 0
    ? checklist.filter(c => c.status === 'missing').map(c => `Missing deliverable: ${c.name} — ${c.evidence}`)
    : [];

  const warnings = checklist
    .filter(c => c.status === 'ambiguous')
    .map(c => `Ambiguous: ${c.name} — ${c.evidence}`);

  if (!pass) {
    console.log(`\n   ❌ SCOPE VERIFICATION FAILED — ${missing}/${total} deliverables missing`);
  } else {
    console.log('\n   ✅ Scope verification passed');
  }

  return { pass, score, issues, warnings, checklist };
}

/**
 * Create the Scope Completion Verification Gate for use in handoff system.
 */
export function createScopeCompletionGate() {
  return {
    name: 'SCOPE_COMPLETION_VERIFICATION',
    validator: async (ctx) => {
      const sdKey = ctx.sdKey || ctx.sdId;
      return validateScopeCompletion(sdKey);
    },
    required: true,
    blocking: false, // Advisory by default — warns but doesn't block
    remediation: 'Review missing deliverables and implement them before marking SD complete.'
  };
}

export { extractDeliverables, checkDeliverable, grepRecursive, filterBySlice, globToRegExp, isInheritedWithoutSlice };
