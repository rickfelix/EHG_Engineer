/**
 * Fleet-wide transitive hook spawn-target guard
 * SD-FDBK-INFRA-FLEET-WIDE-TRANSITIVE-001 (resolves feedback 9be5ac02; RCA acde2541 / PAT-HOOK-ARCHIVE-ORPHAN-001)
 *
 * The "layer with teeth" that QF-20260604-729's SETTINGS-4 lacks. SETTINGS-4 only
 * validates the directly-wired hook COMMAND files in .claude/settings.json. This
 * analyzer validates the script files those hooks fork INTERNALLY (the transitive
 * spawn targets) — the exact archive-orphan class that silently broke
 * scripts/auto-learning-capture.js.
 *
 * Pure static analyzer (acorn AST — no hook code is executed). Detects every
 * Node-fork call (spawn family AND execSync/exec `node "<path>"` shell-string
 * forms) reachable from a wired hook, resolves the script-path target across the
 * fleet's mixed bases (__dirname / PROJECT_DIR / local ROOT const / computed
 * vars) by in-file assignment tracing, and asserts each resolvable target EXISTS
 * or is protected by a proximate fs.existsSync guard bound to the SAME forked
 * variable. Unresolvable-and-unguarded forks and unanalyzable constructs are
 * reported fail-loud — never silently dropped.
 *
 * Design corrections from prospective sub-agent review (LEAD VALIDATION + PLAN TESTING):
 *  - B1: whole call-expressions are parsed via AST, so `execSync(` split across
 *    lines from its `node "..."` string is detected (sites 4 & 5).
 *  - B2: path.join/path.resolve over literal segments + a known base is evaluated;
 *    a runtime variable in the path position defers to the guard / unanalyzable.
 *  - B3: a guard counts only when fs.existsSync() tests the SAME identifier that is
 *    forked (an unrelated existsSync elsewhere does not mark a site guarded).
 *  - MUST-ADD-1: `regexVar.exec()` / `str.match()` are ignored — a fork call's
 *    callee must resolve to a child_process binding.
 */

import * as acorn from 'acorn';
import fs from 'node:fs';
import path from 'node:path';
import repoPaths from '../repo-paths.cjs';

const { ENGINEER_ROOT } = repoPaths;

/** child_process methods that fork a process. */
export const FORK_METHODS = new Set([
  'spawn', 'spawnSync', 'fork', 'exec', 'execSync', 'execFile', 'execFileSync',
]);
/** Methods whose FIRST argument is the command/executable (script is in argv[1]). */
const ARGV_METHODS = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync']);
/** fork(modulePath, args) — first argument IS the script. */
const FIRST_ARG_SCRIPT_METHODS = new Set(['fork']);
/** exec/execSync — first argument is a shell command STRING. */
const SHELL_STRING_METHODS = new Set(['exec', 'execSync']);

/** External binaries that are out of scope (not repo node scripts). */
export const EXTERNAL_BINARIES = new Set([
  'git', 'gh', 'npm', 'npx', 'yarn', 'pnpm', 'powershell', 'powershell.exe',
  'pwsh', 'wmic', 'ps', 'bash', 'sh', 'cmd', 'cmd.exe', 'docker', 'code', 'echo',
]);

const norm = (p) => String(p).replace(/\\/g, '/');

function parse(source) {
  // .cjs hooks are CommonJS ('script'); several .js hooks are ESM ('module').
  // Try script first (the common case), fall back to module for import/export files.
  const opts = {
    ecmaVersion: 'latest',
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    allowHashBang: true,
    locations: true,
  };
  try {
    return acorn.parse(source, { ...opts, sourceType: 'script' });
  } catch (scriptErr) {
    try {
      return acorn.parse(source, { ...opts, sourceType: 'module' });
    } catch {
      throw scriptErr;
    }
  }
}

/** Recursively walk an ESTree node, invoking cb(node, fnStack) for every node. */
function walk(node, cb, fnStack = []) {
  if (!node || typeof node.type !== 'string') return;
  cb(node, fnStack);
  const pushed = node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression';
  const nextStack = pushed ? [...fnStack, node] : fnStack;
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) if (c && typeof c.type === 'string') walk(c, cb, nextStack);
    } else if (child && typeof child.type === 'string') {
      walk(child, cb, nextStack);
    }
  }
}

function isRequireOf(node, moduleName) {
  return node && node.type === 'CallExpression' && node.callee.type === 'Identifier'
    && node.callee.name === 'require' && node.arguments.length === 1
    && node.arguments[0].type === 'Literal'
    && (node.arguments[0].value === moduleName || node.arguments[0].value === `node:${moduleName}`);
}

/** Collect child_process bindings, variable declarators, existsSync guards. */
function collectBindings(ast) {
  const cpModuleNames = new Set();      // const cp = require('child_process')
  const forkBindings = new Map();       // localName -> method (destructured)
  const declarators = new Map();        // varName -> init node (first seen)
  const existsGuards = [];              // { argName, fn }

  walk(ast, (node, fnStack) => {
    const fn = fnStack[fnStack.length - 1] || null;

    if (node.type === 'VariableDeclarator' && node.id) {
      // const { spawn } = require('child_process')  (or renamed)
      if (node.id.type === 'ObjectPattern' && isRequireOf(node.init, 'child_process')) {
        for (const prop of node.id.properties) {
          if (prop.type === 'Property' && prop.key.type === 'Identifier' && prop.value.type === 'Identifier') {
            if (FORK_METHODS.has(prop.key.name)) forkBindings.set(prop.value.name, prop.key.name);
          }
        }
      } else if (node.id.type === 'Identifier' && isRequireOf(node.init, 'child_process')) {
        cpModuleNames.add(node.id.name);            // const cp = require('child_process')
      } else if (node.id.type === 'Identifier' && node.init) {
        if (!declarators.has(node.id.name)) declarators.set(node.id.name, node.init);
      }
    }

    // fs.existsSync(X) or existsSync(X) — record the tested identifier + scope
    if (node.type === 'CallExpression') {
      const callee = node.callee;
      const isExists = (callee.type === 'MemberExpression' && callee.property.type === 'Identifier' && callee.property.name === 'existsSync')
        || (callee.type === 'Identifier' && callee.name === 'existsSync');
      if (isExists && node.arguments.length >= 1 && node.arguments[0].type === 'Identifier') {
        existsGuards.push({ argName: node.arguments[0].name, fn });
      }
    }
  });

  return { cpModuleNames, forkBindings, declarators, existsGuards };
}

/** Resolve a "base" expression (__dirname / repo-root convention / local const) to an absolute dir. */
function resolveBase(node, filePath, repoRoot, declarators, seen = new Set()) {
  if (!node) return null;
  if (node.type === 'Identifier') {
    if (node.name === '__dirname') return path.dirname(filePath);
    if (node.name === 'ENGINEER_ROOT' || /^(REPO_ROOT|PROJECT_ROOT)$/.test(node.name)) return repoRoot;
    if (seen.has(node.name)) return null;
    seen.add(node.name);
    const init = declarators.get(node.name);
    if (init) return resolveBaseFromInit(init, filePath, repoRoot, declarators, seen);
    return null;
  }
  return resolveBaseFromInit(node, filePath, repoRoot, declarators, seen);
}

function resolveBaseFromInit(init, filePath, repoRoot, declarators, seen) {
  // PROJECT_DIR convention: process.env.CLAUDE_PROJECT_DIR || detectProjectDir()
  if (init.type === 'LogicalExpression' && init.operator === '||' && isProjectDirEnv(init.left)) return repoRoot;
  if (isProjectDirEnv(init)) return repoRoot;
  // path.resolve/join(__dirname, '..', ...) → compute
  const composed = resolvePathCall(init, filePath, repoRoot, declarators, seen);
  if (composed) return composed;
  return null;
}

function isProjectDirEnv(node) {
  return node && node.type === 'MemberExpression'
    && node.object.type === 'MemberExpression'
    && node.object.object.type === 'Identifier' && node.object.object.name === 'process'
    && node.object.property.type === 'Identifier' && node.object.property.name === 'env'
    && node.property.type === 'Identifier' && node.property.name === 'CLAUDE_PROJECT_DIR';
}

function litString(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis.length === 1) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

/** Resolve a path.join(...) / path.resolve(...) expression to an absolute path, or null. */
function resolvePathCall(node, filePath, repoRoot, declarators, seen = new Set()) {
  if (!node || node.type !== 'CallExpression') return null;
  const callee = node.callee;
  if (callee.type !== 'MemberExpression' || callee.object.type !== 'Identifier'
    || callee.object.name !== 'path' || callee.property.type !== 'Identifier') return null;
  const method = callee.property.name;
  if (method !== 'join' && method !== 'resolve') return null;

  const segments = [];
  for (let i = 0; i < node.arguments.length; i++) {
    const arg = node.arguments[i];
    if (i === 0) {
      const base = resolveBase(arg, filePath, repoRoot, declarators, seen) ?? litString(arg);
      if (!base) return null;
      segments.push(base);
    } else {
      const s = litString(arg);
      if (s == null) return null;          // a runtime variable segment → not statically resolvable
      segments.push(s);
    }
  }
  return method === 'resolve' ? path.resolve(...segments) : path.join(...segments);
}

/**
 * Resolve a script-path expression (the fork target) to { abs } or
 * { unresolved: reason }. Traces identifiers to their in-file assignment.
 */
function resolveScriptPath(node, filePath, repoRoot, declarators, seen = new Set()) {
  if (!node) return { unresolved: 'no target expression' };
  // path.join/resolve(...)
  const viaCall = resolvePathCall(node, filePath, repoRoot, declarators, seen);
  if (viaCall) return { abs: viaCall };
  // string literal (treat as repo-root-relative if not absolute)
  const lit = litString(node);
  if (lit != null) return { abs: path.isAbsolute(lit) ? lit : path.join(repoRoot, lit) };
  // identifier → trace assignment
  if (node.type === 'Identifier') {
    if (seen.has(node.name)) return { unresolved: `cyclic var ${node.name}` };
    seen.add(node.name);
    const init = declarators.get(node.name);
    if (!init) return { unresolved: `unresolved var ${node.name}` };
    return resolveScriptPath(init, filePath, repoRoot, declarators, seen);
  }
  return { unresolved: `non-static target (${node.type})` };
}

/** Is this argument node the node interpreter (literal 'node' or process.execPath)? */
function isNodeExecutable(node) {
  if (!node) return false;
  if (node.type === 'Literal' && node.value === 'node') return true;
  if (node.type === 'MemberExpression' && node.object.type === 'Identifier'
    && node.object.name === 'process' && node.property.type === 'Identifier'
    && node.property.name === 'execPath') return true;
  return false;
}

function externalLiteralCommand(node) {
  const s = litString(node);
  if (s == null) return null;
  const first = s.trim().split(/\s+/)[0];
  const base = norm(first).split('/').pop();
  return EXTERNAL_BINARIES.has(base) || EXTERNAL_BINARIES.has(first) ? (base || first) : null;
}

/**
 * Extract node-fork targets from an exec/execSync shell command argument.
 * Handles string literals and template literals (`node "${path.join(...)}"`),
 * splitting on shell separators to catch multi-target commands.
 */
function extractExecNodeTargets(cmdNode) {
  const chunks = [];
  if (cmdNode.type === 'Literal' && typeof cmdNode.value === 'string') {
    chunks.push({ text: cmdNode.value });
  } else if (cmdNode.type === 'TemplateLiteral') {
    for (let i = 0; i < cmdNode.quasis.length; i++) {
      chunks.push({ text: cmdNode.quasis[i].value.cooked ?? '' });
      if (i < cmdNode.expressions.length) chunks.push({ expr: cmdNode.expressions[i] });
    }
  } else {
    return [{ indeterminate: `non-literal command (${cmdNode.type})` }];
  }

  const targets = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (!c.text) continue;
    // Find "node" tokens; the following token (literal word OR next expression) is the script.
    const re = /(?:^|[\s;&|])"?node"?\s+("?)/g;
    let m;
    while ((m = re.exec(c.text)) !== null) {
      const rest = c.text.slice(m.index + m[0].length);
      const word = rest.match(/^[^\s;&|"']+/);
      if (word && word[0]) {
        targets.push({ kind: 'literal', value: word[0] });
      } else if (i + 1 < chunks.length && chunks[i + 1].expr) {
        targets.push({ kind: 'expr', node: chunks[i + 1].expr });
      } else {
        targets.push({ indeterminate: 'node followed by unparseable target' });
      }
    }
  }
  return targets;
}

/** Does a proximate existsSync guard bind to `varName` within the fork's function scope? */
function isGuarded(varName, forkFn, existsGuards) {
  if (!varName) return false;
  return existsGuards.some((g) => g.argName === varName && (g.fn === forkFn || g.fn === null));
}

/**
 * Analyze a single hook's source text. Pure: parses + classifies (no IO except
 * fs.existsSync on resolved targets).
 * @returns {{ sites: Array, unanalyzable: Array, indeterminate: Array, parseError: string|null }}
 */
export function analyzeSource(source, { filePath, repoRoot = ENGINEER_ROOT } = {}) {
  const out = { sites: [], unanalyzable: [], indeterminate: [], parseError: null };
  let ast;
  try {
    ast = parse(source);
  } catch (e) {
    out.parseError = e.message;
    out.unanalyzable.push({ filePath: norm(filePath), reason: `parse error: ${e.message}` });
    return out;
  }
  const { cpModuleNames, forkBindings, declarators, existsGuards } = collectBindings(ast);
  const ctx = { filePath, repoRoot, declarators, existsGuards, out };

  walk(ast, (node, fnStack) => {
    if (node.type !== 'CallExpression') return;
    const callee = node.callee;
    let method = null;
    if (callee.type === 'Identifier' && forkBindings.has(callee.name)) {
      method = forkBindings.get(callee.name);
    } else if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
      && FORK_METHODS.has(callee.property.name)) {
      const obj = callee.object;                    // cp.spawn(...) / require('child_process').spawn(...)
      if ((obj.type === 'Identifier' && cpModuleNames.has(obj.name)) || isRequireOf(obj, 'child_process')) {
        method = callee.property.name;
      }
    }
    if (!method) return;                            // not a child_process fork (ignores regexVar.exec — MUST-ADD-1)

    const fn = fnStack[fnStack.length - 1] || null;
    const line = node.loc ? node.loc.start.line : 0;
    const base = { filePath: norm(filePath), line, method };

    if (SHELL_STRING_METHODS.has(method)) {
      const cmd = node.arguments[0];
      if (!cmd) return;
      if (externalLiteralCommand(cmd)) return;       // external literal binary → out of scope
      // A variable command (e.g. a gitExec(cmd) wrapper) can't be proven to fork
      // node — report soft (visible, non-failing), not hard unanalyzable.
      if (cmd.type !== 'Literal' && cmd.type !== 'TemplateLiteral') {
        out.indeterminate.push({ ...base, reason: `non-literal exec command (${cmd.type})` });
        return;
      }
      const targets = extractExecNodeTargets(cmd);
      if (targets.length === 0) return;              // literal/template with no `node` token → not a node fork
      for (const t of targets) {
        if (t.indeterminate) { out.unanalyzable.push({ ...base, reason: t.indeterminate }); continue; }
        const targetNode = t.kind === 'expr' ? t.node : { type: 'Literal', value: t.value };
        classifyTarget({ ...base, family: 'exec' }, targetNode, fn, ctx);
      }
      return;
    }

    // spawn family / fork
    let scriptNode, scriptVarName = null;
    if (FIRST_ARG_SCRIPT_METHODS.has(method)) {
      scriptNode = node.arguments[0];
    } else if (ARGV_METHODS.has(method)) {
      const cmdArg = node.arguments[0];
      if (!isNodeExecutable(cmdArg)) {
        if (externalLiteralCommand(cmdArg)) return;  // external binary
        if (cmdArg && cmdArg.type !== 'Literal') out.indeterminate.push({ ...base, reason: `non-node/non-literal command (${cmdArg.type})` });
        return;
      }
      const argv = node.arguments[1];
      if (!argv || argv.type !== 'ArrayExpression' || argv.elements.length === 0) {
        out.unanalyzable.push({ ...base, reason: 'node fork with no static argv[0]' });
        return;
      }
      scriptNode = argv.elements[0];
    } else {
      return;
    }
    if (scriptNode && scriptNode.type === 'Identifier') scriptVarName = scriptNode.name;
    classifyTarget({ ...base, family: 'spawn' }, scriptNode, fn, { ...ctx, scriptVarName });
  });

  return out;
}

function classifyTarget(base, targetNode, fn, ctx) {
  const { filePath, repoRoot, declarators, existsGuards, out } = ctx;
  const guardVar = ctx.scriptVarName || (targetNode && targetNode.type === 'Identifier' ? targetNode.name : null);
  const guarded = isGuarded(guardVar, fn, existsGuards);

  const res = resolveScriptPath(targetNode, filePath, repoRoot, declarators);
  if (res.abs) {
    const exists = fs.existsSync(res.abs);
    const site = { ...base, target: norm(path.relative(repoRoot, res.abs)) || norm(res.abs), guarded, resolved: true, exists };
    if (exists) site.verdict = 'PASS';
    else if (guarded) { site.verdict = 'PASS'; site.note = 'resolvable-but-absent, existsSync-guarded'; }
    else { site.verdict = 'FAIL'; site.note = 'orphaned spawn target (missing, unguarded)'; }
    out.sites.push(site);
  } else {
    // Unresolvable base/expression → teeth: must be guarded.
    const site = { ...base, target: null, guarded, resolved: false, reason: res.unresolved };
    if (guarded) { site.verdict = 'PASS'; site.note = `unresolvable base, existsSync-guarded (${res.unresolved})`; }
    else { site.verdict = 'FAIL'; site.note = `unresolvable-and-unguarded fork (${res.unresolved})`; }
    out.sites.push(site);
  }
}

/** Read + analyze a hook file by absolute path. */
export function analyzeHookFile(absPath, { repoRoot = ENGINEER_ROOT } = {}) {
  let source;
  try {
    source = fs.readFileSync(absPath, 'utf8');
  } catch (e) {
    return { sites: [], unanalyzable: [{ filePath: norm(absPath), reason: `read error: ${e.message}` }], indeterminate: [], parseError: null };
  }
  return analyzeSource(source, { filePath: absPath, repoRoot });
}

/** Mirror SETTINGS-4: extract ${CLAUDE_PROJECT_DIR}/<file> references from settings.json commands. */
export function enumerateWiredHooks(settingsPath, repoRoot = ENGINEER_ROOT) {
  const j = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const cmds = [];
  for (const arr of Object.values(j.hooks || {})) {
    for (const group of arr) for (const hk of (group.hooks || [])) if (hk.command) cmds.push(hk.command);
  }
  if (j.statusLine && j.statusLine.command) cmds.push(j.statusLine.command);
  const files = new Set();
  for (const c of cmds) {
    const m = c.match(/\$\{?CLAUDE_PROJECT_DIR\}?[\\/]+([^\s"']+)/);
    if (m) files.add(m[1]);
  }
  return [...files]
    .filter((rel) => /\.(c?js|mjs)$/.test(rel))   // PowerShell hooks are out of scope (not JS-parseable)
    .map((rel) => path.resolve(repoRoot, rel));
}

/** First-party (repo) local-require closure for one hook file (1 level). Excludes node_modules. */
export function buildRequireClosure(absPath, repoRoot = ENGINEER_ROOT) {
  let ast;
  try {
    ast = parse(fs.readFileSync(absPath, 'utf8'));
  } catch {
    return { files: [], dynamic: [] };
  }
  const files = new Set();
  const dynamic = [];
  walk(ast, (node) => {
    if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier' || node.callee.name !== 'require') return;
    const arg = node.arguments[0];
    if (!arg) return;
    const spec = litString(arg);
    if (spec == null) { dynamic.push({ filePath: norm(absPath), line: node.loc ? node.loc.start.line : 0 }); return; }
    if (!spec.startsWith('./') && !spec.startsWith('../')) return;     // bare specifier → node_modules / builtin
    const resolved = resolveRequire(path.resolve(path.dirname(absPath), spec));
    // first-party only: must resolve to a repo file under repoRoot, never node_modules.
    if (resolved && norm(resolved).startsWith(`${norm(repoRoot)}/`) && !norm(resolved).includes('/node_modules/')) {
      files.add(resolved);
    }
  });
  return { files: [...files], dynamic };
}

function resolveRequire(base) {
  const candidates = [base, `${base}.js`, `${base}.cjs`, `${base}.mjs`, path.join(base, 'index.js'), path.join(base, 'index.cjs')];
  for (const c of candidates) {
    try { if (fs.statSync(c).isFile()) return c; } catch { /* next */ }
  }
  return null;
}

/**
 * Analyze the whole wired fleet: every wired JS hook + its first-party require
 * closure. Returns aggregated buckets and a boolean `ok`.
 */
export function analyzeFleet({ settingsPath, repoRoot = ENGINEER_ROOT } = {}) {
  const resolvedSettings = settingsPath || path.join(repoRoot, '.claude', 'settings.json');
  const hooks = enumerateWiredHooks(resolvedSettings, repoRoot);
  const analyzed = new Set();
  const all = { sites: [], unanalyzable: [], indeterminate: [], dynamicRequires: [] };

  const analyzeOne = (absPath) => {
    const r = analyzeHookFile(absPath, { repoRoot });
    all.sites.push(...r.sites);
    all.unanalyzable.push(...r.unanalyzable);
    all.indeterminate.push(...r.indeterminate);
  };

  for (const h of hooks) {
    const key = norm(h);
    if (analyzed.has(key)) continue;
    analyzed.add(key);
    if (!fs.existsSync(h)) {
      all.unanalyzable.push({ filePath: key, reason: 'wired hook file missing (SETTINGS-4 territory)' });
      continue;
    }
    analyzeOne(h);
    const closure = buildRequireClosure(h, repoRoot);
    all.dynamicRequires.push(...closure.dynamic);
    for (const f of closure.files) {
      const ck = norm(f);
      if (analyzed.has(ck)) continue;
      analyzed.add(ck);
      analyzeOne(f);
    }
  }

  const failures = all.sites.filter((s) => s.verdict === 'FAIL');
  all.ok = failures.length === 0 && all.unanalyzable.length === 0;
  all.failures = failures;
  all.hookCount = hooks.length;
  return all;
}
