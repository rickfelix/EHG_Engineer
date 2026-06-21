import fs from 'fs';
import path from 'path';

/**
 * Invocation-path detector (FOUNDATION) — SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-A (FR-1).
 *
 * Given a script entry-point (e.g. "scripts/foo.cjs"), determine whether a LIVE production
 * trigger actually references it: a scheduled GHA workflow `run:` step, an npm script, a
 * registered+wired loop-contract, a .claude hook, or a parent script that shells it.
 *
 * KEY INVARIANT: invocation != reachability. Static reachability (the file is importable from
 * an entry point) is NOT invocation. Only a concrete trigger reference counts. This module is
 * the SSOT consumed by the classifier (-B) and the gate (-C).
 *
 * DESIGN: every matcher is PURE (string/array in → trigger|null out, no I/O), so the matching
 * logic is fully unit-testable without a filesystem. `detectInvocationPath` is a thin pure
 * assembler over injected trigger-source data; `loadTriggerSources(rootDir)` is the only I/O
 * (separated so callers can inject fixtures). Mirrors the pure-core + injectable-seam pattern.
 */

export const TRIGGER_TYPES = Object.freeze({
  GHA_WORKFLOW: 'GHA_WORKFLOW',
  NPM_SCRIPT: 'NPM_SCRIPT',
  LOOP_CONTRACT_REGISTRY: 'LOOP_CONTRACT_REGISTRY',
  CLAUDE_HOOK: 'CLAUDE_HOOK',
  PARENT_SCRIPT_SHELL: 'PARENT_SCRIPT_SHELL',
});

/**
 * Canonicalize an entry-point path to a forward-slash, repo-relative, no-leading-`./` form so
 * "scripts/foo.js", "./scripts/foo.js" and "C:\\repo\\scripts\\foo.js" (with rootDir) compare equal.
 * Pure. @returns {string}
 */
export function normalizeEntry(p, rootDir = '') {
  if (!p) return '';
  let s = String(p).replace(/\\/g, '/').trim();
  if (rootDir) {
    const r = String(rootDir).replace(/\\/g, '/').replace(/\/+$/, '');
    if (r && s.startsWith(r + '/')) s = s.slice(r.length + 1);
  }
  s = s.replace(/^\.\//, '').replace(/^\/+/, '');
  return s;
}

/**
 * Extract the script entry-point a shell command runs, if any: `node scripts/x.cjs --flag`,
 * `node ${CLAUDE_PROJECT_DIR}/scripts/x.cjs`. Returns the normalized path or null. Pure.
 */
export function extractNodeEntry(command) {
  if (!command) return null;
  // node [flags] <path.(js|mjs|cjs)>  — tolerate ${VAR}/ prefixes and quotes.
  const m = String(command).match(/node\s+(?:--[\w-]+(?:=\S+)?\s+)*["']?(?:\$\{[^}]+\}\/|\.\/)?([^\s"';&|]+\.(?:c|m)?js)\b/);
  return m ? normalizeEntry(m[1]) : null;
}

/** Build a map of npm scriptName → normalized entry-point from a package.json scripts object. Pure. */
export function indexNpmScripts(pkgScripts = {}) {
  const byName = {};
  for (const [name, cmd] of Object.entries(pkgScripts || {})) {
    const entry = extractNodeEntry(cmd);
    if (entry) byName[name] = { entry, command: cmd };
  }
  return byName;
}

/**
 * NPM_SCRIPT matcher: does any package.json script invoke this entry-point? Pure.
 * @returns {Array<{type, source_file, evidence}>}
 */
export function matchNpmScriptRefs(scriptPath, pkgScripts = {}, sourceFile = 'package.json') {
  const target = normalizeEntry(scriptPath);
  const idx = indexNpmScripts(pkgScripts);
  const out = [];
  for (const [name, { entry, command }] of Object.entries(idx)) {
    if (entry === target) {
      out.push({
        type: TRIGGER_TYPES.NPM_SCRIPT,
        source_file: sourceFile,
        evidence: { script_name: name, command, extracted_entry: entry },
      });
    }
  }
  return out;
}

/**
 * GHA_WORKFLOW matcher: does a workflow's `run:` step invoke this script (directly via
 * `node path` or indirectly via `npm run <name>` that maps to it), AND is the workflow
 * actually scheduled (`on: schedule: cron:`)? A scheduled-but-flag-gated workflow still
 * counts as INVOKED (the cron fires the script; the flag gates behaviour inside) — the flag
 * is reported, not used to deny invocation. Archived/dormant (no schedule) → not invoked. Pure.
 *
 * @param {string} scriptPath
 * @param {{file:string, content:string}} workflow
 * @param {Object} npmScriptIndex - output of indexNpmScripts (to resolve `npm run x`)
 * @returns {{type, source_file, evidence}|null}
 */
export function matchGhaWorkflowRef(scriptPath, workflow, npmScriptIndex = {}) {
  if (!workflow || !workflow.content) return null;
  const target = normalizeEntry(scriptPath);
  const file = normalizeEntry(workflow.file);
  if (file.includes('/archived/') || file.includes('/archive/')) return null;
  const content = workflow.content;

  // Collect every run: command (single-line and the first line of block scalars).
  const runLines = [];
  const re = /\brun:\s*(?:[|>][+-]?\s*)?(.+)/g;
  let m;
  while ((m = re.exec(content)) !== null) runLines.push(m[1].trim());

  let runLine = null;
  for (const line of runLines) {
    const nodeEntry = extractNodeEntry(line);
    if (nodeEntry === target) { runLine = line; break; }
    // `npm run <name>` indirection.
    const npm = line.match(/npm\s+run\s+([\w:.-]+)/);
    if (npm && npmScriptIndex[npm[1]] && npmScriptIndex[npm[1]].entry === target) { runLine = line; break; }
  }
  if (!runLine) return null;

  const scheduled = /^\s*on:|[\s{]on:/.test(content) && /\bschedule:/.test(content) && /\bcron:\s*['"]?([^'"\n]+)/.test(content);
  const cronMatch = content.match(/\bcron:\s*['"]?([^'"\n]+)/);
  const flagMatch = runLine.match(/\b([A-Z][A-Z0-9_]{4,})\b(?=.*(?:enable|true|gate))/i)
    || content.match(/if:\s*[^\n]*vars\.([A-Z0-9_]+)/);

  return {
    type: TRIGGER_TYPES.GHA_WORKFLOW,
    source_file: workflow.file,
    evidence: {
      run_line: runLine,
      scheduled: !!scheduled,
      cron: scheduled && cronMatch ? cronMatch[1].trim() : null,
      flag_gate: flagMatch ? flagMatch[1] : null,
    },
  };
}

/**
 * CLAUDE_HOOK matcher: is this script wired as a hook command in .claude/settings.json?
 * `settings` is the parsed JSON object. Walks every hooks.<Event>[].hooks[].command. Pure.
 * @returns {Array<{type, source_file, evidence}>}
 */
export function matchHookRefs(scriptPath, settings = {}, sourceFile = '.claude/settings.json') {
  const target = normalizeEntry(scriptPath);
  const hooks = settings && settings.hooks;
  if (!hooks || typeof hooks !== 'object') return [];
  const out = [];
  for (const [eventName, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      const inner = group && Array.isArray(group.hooks) ? group.hooks : [];
      for (const h of inner) {
        const entry = extractNodeEntry(h && h.command);
        if (entry === target) {
          out.push({
            type: TRIGGER_TYPES.CLAUDE_HOOK,
            source_file: sourceFile,
            evidence: { hook_event: eventName, matcher: group.matcher || null, command: h.command },
          });
        }
      }
    }
  }
  return out;
}

/**
 * LOOP_CONTRACT_REGISTRY matcher: a registry entry declares this script as a task entrypoint
 * AND (registration != invocation) a scheduled workflow actually wires that entrypoint. Only
 * then is_invoked=true. `loopContracts` is the LOOP_CONTRACTS array; `wiredEntrypoints` is the
 * set/array of entrypoints proven live by a scheduled GHA workflow (from matchGhaWorkflowRef). Pure.
 * @returns {{type, source_file, evidence}|null}
 */
export function matchLoopContractRef(scriptPath, loopContracts = [], wiredEntrypoints = [], sourceFile = 'lib/loops/loop-contract-registry.js') {
  const target = normalizeEntry(scriptPath);
  const wired = new Set((wiredEntrypoints || []).map((e) => normalizeEntry(e)));
  for (const c of loopContracts || []) {
    const tasks = (c && Array.isArray(c.tasks)) ? c.tasks : [];
    const entryTask = tasks.find((t) => t && t.file && normalizeEntry(t.file) === target);
    if (!entryTask) continue;
    const flagTask = tasks.find((t) => t && t.task === 'flag' && t.key);
    const isWired = wired.has(target);
    return {
      type: TRIGGER_TYPES.LOOP_CONTRACT_REGISTRY,
      source_file: sourceFile,
      evidence: {
        loop_id: c.id || null,
        declared_cadence: (c.timeline && c.timeline.cadence) || null,
        declared_entrypoint: target,
        is_invoked: isWired, // registry alone is DATA-ONLY; needs a live wired workflow
        flag_gate: flagTask ? flagTask.key : null,
      },
    };
  }
  return null;
}

/**
 * PARENT_SCRIPT_SHELL matcher: does another script shell this entry-point via
 * execSync('node scripts/x')/spawnSync('node', ['scripts/x', ...])/a literal arg path? Pure.
 * @param {{file:string, content:string}} parent
 * @returns {{type, source_file, evidence}|null}
 */
export function matchParentShellRef(scriptPath, parent) {
  if (!parent || !parent.content) return null;
  const target = normalizeEntry(scriptPath);
  if (normalizeEntry(parent.file) === target) return null; // don't self-reference
  const content = parent.content;
  // execSync('node scripts/x.cjs ...')  OR  spawnSync('node', ['scripts/x.cjs', ...])
  // OR a literal '...scripts/x.cjs' arg passed to a child_process call.
  const base = target.split('/').pop();
  if (!content.includes(base)) return null;
  const callRe = /\b(execSync|execFileSync|exec|spawnSync|spawn|fork)\s*\(/g;
  let m;
  while ((m = callRe.exec(content)) !== null) {
    // Examine a window after the call site for a literal reference to the target path.
    const window = content.slice(m.index, m.index + 400);
    const litRe = new RegExp(`["'\`](?:\\$\\{[^}]+\\}/|\\./)?([^"'\`]*${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})["'\`]`);
    const lit = window.match(litRe);
    if (lit && normalizeEntry(lit[1]) === target) {
      return {
        type: TRIGGER_TYPES.PARENT_SCRIPT_SHELL,
        source_file: parent.file,
        evidence: { invocation_call: m[1], child_script: target },
      };
    }
  }
  return null;
}

const EXCLUDED_RE = /(^|\/)(one-off|archive|archived|__tests__|node_modules)(\/|$)|(^|\/)_[^/]*$|\.(test|spec)\.[cm]?js$/i;

/** Is this entry-point excluded by convention (one-off/archive/test)? Pure. */
export function isExcludedEntry(scriptPath) {
  return EXCLUDED_RE.test(normalizeEntry(scriptPath));
}

/**
 * PURE assembler: given a script path and pre-loaded trigger sources, compute the invocation
 * verdict. No I/O — callers inject `sources` (see loadTriggerSources for the live wiring).
 *
 * @param {string} scriptPath
 * @param {{
 *   pkgScripts?: Object,
 *   workflows?: Array<{file,content}>,
 *   settings?: Object,
 *   loopContracts?: Array,
 *   parentScripts?: Array<{file,content}>,
 *   rootDir?: string,
 * }} sources
 * @returns {{invoked:boolean, triggers:Array, excluded:boolean, warnings:string[]}}
 */
export function detectInvocationPath(scriptPath, sources = {}) {
  const warnings = [];
  const target = normalizeEntry(scriptPath, sources.rootDir);
  if (!target) return { invoked: false, triggers: [], excluded: false, warnings: ['empty scriptPath'] };

  const npmIndex = indexNpmScripts(sources.pkgScripts || {});
  const triggers = [];

  // NPM scripts
  triggers.push(...matchNpmScriptRefs(target, sources.pkgScripts || {}));

  // GHA workflows (also yields the set of entrypoints proven live, for loop-contract wiring)
  const wiredEntrypoints = [];
  for (const wf of sources.workflows || []) {
    const t = matchGhaWorkflowRef(target, wf, npmIndex);
    if (t) {
      triggers.push(t);
      if (t.evidence.scheduled) wiredEntrypoints.push(target);
    }
  }

  // Hooks
  triggers.push(...matchHookRefs(target, sources.settings || {}));

  // Loop-contract registry (needs a live wired workflow to count as invoked)
  const lc = matchLoopContractRef(target, sources.loopContracts || [], wiredEntrypoints);
  if (lc) triggers.push(lc);

  // Parent-script shelling
  for (const ps of sources.parentScripts || []) {
    const t = matchParentShellRef(target, ps);
    if (t) triggers.push(t);
  }

  // INVOCATION verdict: a trigger counts as live unless it is a registry-only entry whose
  // workflow isn't wired, or a GHA run-ref in an UN-scheduled (dispatch-only) workflow.
  const liveTriggers = triggers.filter((t) => {
    if (t.type === TRIGGER_TYPES.LOOP_CONTRACT_REGISTRY) return t.evidence.is_invoked === true;
    if (t.type === TRIGGER_TYPES.GHA_WORKFLOW) return t.evidence.scheduled === true;
    return true; // npm script, hook, parent-shell are live references by their nature
  });

  return {
    invoked: liveTriggers.length > 0,
    triggers,
    excluded: isExcludedEntry(target),
    warnings,
  };
}

// ───────────────────────── I/O boundary (the only impure part) ─────────────────────────

function safeRead(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function listFiles(dir, exts, acc = [], depth = 0) {
  if (depth > 8) return acc;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(full, exts, acc, depth + 1);
    else if (exts.some((x) => e.name.endsWith(x))) acc.push(full);
  }
  return acc;
}

/**
 * Load the live trigger sources for a repo. This is the sole I/O; the pure assembler does the
 * rest. `includeParentShell` (default true) scans `scriptDirs` for execSync/spawnSync refs —
 * disable it for a fast metadata-only query. @returns {Promise<sources>}
 */
export async function loadTriggerSources(rootDir = process.cwd(), { includeParentShell = true, scriptDirs = ['scripts', 'lib'] } = {}) {
  const root = rootDir.replace(/\\/g, '/').replace(/\/+$/, '');

  let pkgScripts = {};
  try { pkgScripts = JSON.parse(safeRead(path.join(root, 'package.json')) || '{}').scripts || {}; } catch { /* none */ }

  let settings = {};
  try { settings = JSON.parse(safeRead(path.join(root, '.claude', 'settings.json')) || '{}'); } catch { /* none */ }

  const wfDir = path.join(root, '.github', 'workflows');
  const workflows = listFiles(wfDir, ['.yml', '.yaml'])
    .map((f) => ({ file: path.relative(root, f).replace(/\\/g, '/'), content: safeRead(f) || '' }));

  let loopContracts = [];
  try {
    const mod = await import('file://' + path.join(root, 'lib', 'loops', 'loop-contract-registry.js').replace(/\\/g, '/'));
    loopContracts = mod.LOOP_CONTRACTS || mod.default?.LOOP_CONTRACTS || mod.default || [];
    if (!Array.isArray(loopContracts)) loopContracts = [];
  } catch { /* registry optional */ }

  let parentScripts = [];
  if (includeParentShell) {
    for (const d of scriptDirs) {
      const files = listFiles(path.join(root, d), ['.js', '.cjs', '.mjs']);
      for (const f of files) {
        const content = safeRead(f);
        if (content && /\b(execSync|execFileSync|spawnSync|spawn|fork|exec)\s*\(/.test(content)) {
          parentScripts.push({ file: path.relative(root, f).replace(/\\/g, '/'), content });
        }
      }
    }
  }

  return { pkgScripts, settings, workflows, loopContracts, parentScripts, rootDir: root };
}

/**
 * Convenience: load the repo's trigger sources and run the detector. The live entry point the
 * classifier (-B) and gate (-C) consume. @returns {Promise<verdict>}
 */
export async function detectInvocationPathFromRepo(scriptPath, rootDir = process.cwd(), opts = {}) {
  const sources = await loadTriggerSources(rootDir, opts);
  return detectInvocationPath(scriptPath, sources);
}
