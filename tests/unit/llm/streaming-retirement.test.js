/**
 * Guards for SD-LEO-INFRA-LLM-ADAPTER-STREAMING-ABSENT-001 — a DELETION plus its safety case.
 *
 * *** A DELETION HAS AN INVERTED RISK PROFILE AND THE FIRST DRAFT OF THESE TESTS MISSED IT. ***
 * Most assertions about a deletion are assertions about ABSENCE, and an absence assertion passes
 * when the implementer deleted the wrong thing, deleted too much, or deleted nothing. PLAN review
 * measured the gap: deleting the wrong function or nothing at all turns the absence check red, but
 * deleting the MODULE or a sibling export would have left every scenario green, because the only
 * test importing this module is vacuous (it imports inside `.catch(() => null)` and puts every
 * assertion inside an `if`).
 *
 * So the guards here are deliberately positive wherever they can be: an export-set equality rather
 * than a name absence, an existence-and-parse rather than an inertness check, and a streaming test
 * that can actually go red.
 *
 * NOTHING HERE IMPORTS eva-chat-service.js. It builds a service-role Supabase client at import time
 * (:29). The module is read as TEXT and parsed, which is also strictly stronger than grep: a parse
 * distinguishes a real export from a mention in a comment — the exact ambiguity that put a
 * non-exported symbol into an acceptance criterion during PLAN.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { parse } from 'acorn';
import { EventEmitter } from 'node:events';

const REPO = join(import.meta.dirname, '..', '..', '..');
const EVA = join(REPO, 'lib', 'integrations', 'eva-chat-service.js');
const FIXTURE = join(REPO, 'tests', 'fixtures', 'llm-call-shapes', 'dead-factory-messages-stream.fixture.js');
const DOC = join(REPO, 'docs', 'architecture', 'llm-stream-watchdog.md');

const parseModule = (src) => parse(src, { ecmaVersion: 'latest', sourceType: 'module' });

/** Exported names, from the AST. Not a grep — a comment naming an export does not count. */
function exportedNames(src) {
  const names = new Set();
  for (const node of parseModule(src).body) {
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        if (node.declaration.id) names.add(node.declaration.id.name);
        for (const d of node.declaration.declarations || []) names.add(d.id.name);
      }
      for (const s of node.specifiers || []) names.add(s.exported.name);
    }
    // M19/M20 killed here. The first walker handled only ExportNamedDeclaration, so adding
    // `export default` or `export * from` to the module was invisible to an export-set EQUALITY --
    // the guard would have reported the set unchanged while the module's surface had grown.
    if (node.type === 'ExportDefaultDeclaration') names.add('default');
    if (node.type === 'ExportAllDeclaration') names.add(node.exported ? node.exported.name : '*');
  }
  return names;
}

describe('the deletion removed exactly one thing', () => {
  it('streamMessage is gone from the module', () => {
    expect(exportedNames(readFileSync(EVA, 'utf8')).has('streamMessage')).toBe(false);
  });

  /**
   * THE OVER-DELETION GUARD — the scenario the first draft lacked entirely.
   * An equality, not a subset: deleting a sibling export must fail here. Measured before the
   * deletion, the module exported six names plus streamMessage.
   */
  it('every other export survived — asserted as an EQUALITY, so deleting a sibling fails', () => {
    expect([...exportedNames(readFileSync(EVA, 'utf8'))].sort()).toEqual([
      'EVA_BASE_PROMPT', 'buildSystemPrompt', 'createConversation',
      'getMessages', 'listConversations', 'sendMessage',
    ]);
  });

  it('the module still parses — a deletion that broke syntax would pass a grep', () => {
    expect(() => parseModule(readFileSync(EVA, 'utf8'))).not.toThrow();
  });

  it('no source file CALLS or DEFINES streamMessage', () => {
    /**
     * Matches the CALL AND DEFINITION FORMS, never the bare name. Two earlier spellings of this
     * check failed for the same reason twice: a name-only grep matches the retirement comment that
     * documents the deletion, and the module header that describes the old defect. A check that
     * cannot tell code from the prose narrating code reports on the wrong text — which is precisely
     * the class this SD keeps finding.
     *
     * Also SCOPED to source: two repo-wide hits are GENERATED audit artifacts carrying bare
     * exemption notes, so an unscoped assertion is unsatisfiable even after a correct deletion.
     */
    const out = execSync(
      'git grep -nE "(function|const|await)[[:space:]]+streamMessage|streamMessage[[:space:]]*\\(|\\{[[:space:]]*streamMessage[[:space:]]*\\}" -- lib scripts server src || true',
      { cwd: REPO, encoding: 'utf8' },
    ).trim();
    expect(out).toBe('');
  });
});

describe('the retirement provenance is real, not pasted', () => {
  /**
   * REFERENTIAL INTEGRITY, NOT A LITERAL GREP. A test that greps for four tokens the implementer
   * was told to write is paste-satisfiable, and is worse than no test because it launders a review
   * criterion into a green check. These assertions fail for a wrong-but-plausible commit id.
   */
  const SHA = 'f85cd2a7c92';

  /**
   * *** THESE THREE NEED GIT HISTORY, AND CI DOES NOT HAVE IT. FOUND BY CI, NOT BY REASONING. ***
   * They went red on the first PR run with `fatal: Not a valid object name f85cd2a7c92`, because
   * actions/checkout@v4 defaults to fetch-depth 1 and the cited commit is from 2026-06-02. The
   * assertions were right about the repository and wrong about their environment — I asked whether
   * they REACH the layer they judge, and never whether that layer EXISTS where they run.
   *
   * Not "fixed" by loosening: they are gated on history being present, so they run in full clones
   * (local, and any workflow using fetch-depth 0) and are reported as SKIPPED in CI rather than
   * silently passing. A skip is visible in the run output; a loosened assertion is not.
   *
   * WHAT GUARDS THE MERGE IN CI, since these do not: the shallow-safe consequence test below — the
   * route file is absent at HEAD — plus the deliberately-weak token check. Stated plainly so nobody
   * reads a green CI run as meaning the provenance was verified there.
   *
   * The shared unit-tier workflow is deliberately NOT changed to fetch full history: it runs on
   * every PR in this repo and unshallowing it would cost the whole fleet time to serve one SD.
   */
  const isShallow = (() => {
    try {
      return execSync('git rev-parse --is-shallow-repository', { cwd: REPO, encoding: 'utf8' }).trim() === 'true';
    } catch { return true; }
  })();

  it('SHALLOW-SAFE: the route that was the only caller is absent at HEAD', () => {
    // The CONSEQUENCE of the retirement, checkable without history. This is what actually guards
    // the merge in CI. If the route ever comes back, the deleted function's provenance block is
    // describing a world that no longer holds and this reddens.
    const tracked = execSync('git ls-files server/routes/eva-chat.js', { cwd: REPO, encoding: 'utf8' }).trim();
    expect(tracked).toBe('');
    expect(existsSync(join(REPO, 'server', 'routes', 'eva-chat.js'))).toBe(false);
  });

  it.skipIf(isShallow)('the cited deletion commit exists and is an ancestor of HEAD', () => {
    // `git cat-file -e <sha>^{commit}` needs the braces quoted under sh; `-t` avoids the issue and
    // asserts the OBJECT TYPE, which is strictly more than existence — a tag or blob would fail.
    const type = execSync(`git cat-file -t ${SHA}`, { cwd: REPO, encoding: 'utf8' }).trim();
    expect(type).toBe('commit');
    expect(() => execSync(`git merge-base --is-ancestor ${SHA} HEAD`, { cwd: REPO, stdio: 'pipe' })).not.toThrow();
  });

  it.skipIf(isShallow)('its committer date is the date the record claims', () => {
    const date = execSync(`git show -s --format=%cs ${SHA}`, { cwd: REPO, encoding: 'utf8' }).trim();
    expect(date).toBe('2026-06-02');
  });

  it.skipIf(isShallow)('it really did delete the route that was the only caller', () => {
    const files = execSync(`git show --name-status --format= ${SHA}`, { cwd: REPO, encoding: 'utf8' });
    expect(files).toMatch(/^D\s+server\/routes\/eva-chat\.js$/m);
  });

  it('the deletion site carries the provenance a future sweeper needs', () => {
    // Deliberately weak and labelled as such: this checks the record is PRESENT. Whether it is
    // comprehensible enough to stop a fourth rediscovery is review-only and no test claims it.
    const src = readFileSync(EVA, 'utf8');
    expect(src).toContain(SHA);
    expect(src).toContain('cff73055');
    expect(src).toContain('QF-20260602-028');
  });
});

describe('the preserved specimen', () => {
  it('EXISTS and PARSES — asserted together, because "is inert" alone passes when it is missing', () => {
    expect(existsSync(FIXTURE)).toBe(true);
    expect(() => parseModule(readFileSync(FIXTURE, 'utf8'))).not.toThrow();
  });

  it('preserves BOTH halves of the diagnostic pair, asserted on the AST not the text', () => {
    /**
     * *** THIS ASSERTION WAS SUBSTRING-BASED AND A FALSIFIER PROVED IT VACUOUS. ***
     * Deleting the receiver-construction LINE from the specimen left the suite GREEN, because
     * `createLLMClient` still appeared in the fixture's own docblock explaining what made the call
     * dead. That is the FOURTH time in this SD that a check matched the prose narrating code rather
     * than the code — the same shape as the doc-citation check, the streamMessage grep, and the
     * fixture-import check. Comments are invisible to a parser, so the AST is the only surface
     * where "the code contains X" means what it says.
     *
     * Both halves must survive: a raw `new Anthropic()` client has a real `.messages.stream`, so
     * the call form ALONE is not the defect. The diagnostic pair is (call form x receiver origin),
     * and a specimen carrying only the call would encode the blindness the sibling rule exists to
     * remove.
     */
    const ast = parseModule(readFileSync(FIXTURE, 'utf8'));

    let hasFactoryImport = false;   // receiver origin
    let hasStreamCall = false;      // call form
    let hasTextHandler = false;     // the incremental-delivery intent
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'ImportExpression' && n.source?.value?.includes('client-factory')) hasFactoryImport = true;
      if (n.type === 'CallExpression') {
        const c = n.callee;
        if (c?.type === 'MemberExpression' && c.property?.name === 'stream'
            && c.object?.type === 'MemberExpression' && c.object.property?.name === 'messages') hasStreamCall = true;
        if (c?.type === 'MemberExpression' && c.property?.name === 'on' && n.arguments?.[0]?.value === 'text') hasTextHandler = true;
      }
      for (const k of Object.keys(n)) {
        const v = n[k];
        if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object' && v.type) walk(v);
      }
    };
    walk(ast);

    expect(hasFactoryImport, 'receiver origin (dynamic import of client-factory) is missing from the CODE').toBe(true);
    expect(hasStreamCall, 'call form (.messages.stream) is missing from the CODE').toBe(true);
    expect(hasTextHandler, "the .on('text') incremental-delivery intent is missing from the CODE").toBe(true);

    /**
     * *** AND THEY MUST BE COUPLED. *** A mutation that kept the factory import but switched the
     * .messages.stream receiver to a raw `new Anthropic()` client survived the previous version:
     * both halves were present, and the specimen still demonstrated nothing, because a raw SDK
     * client HAS a real .messages.stream. Presence of two halves is not the same as one linked
     * pair, and the pair is the entire diagnostic.
     */
    /**
     * *** AND THIS COUPLING CHECK ITSELF MATCHED THE DOCBLOCK ON ITS FIRST RUN. ***
     * The raw-SDK half was written as `expect(src).not.toMatch(/new Anthropic\(/)` and failed
     * immediately — against the fixture's own comment explaining that "a raw `new Anthropic()`
     * client has a real .messages.stream". That is the FIFTH time in this SD a check read the prose
     * instead of the code, and it happened inside the fix for the fourth. The lesson is not "be
     * careful": it is that a substring check over a file containing prose about code is the wrong
     * instrument, every time, and the AST is the right one.
     */
    let rawSdkConstruction = false;
    let streamReceiver = null;
    let factoryBinding = null;
    const walk2 = (n) => {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'NewExpression' && n.callee?.name === 'Anthropic') rawSdkConstruction = true;
      // `const <name> = await createLLMClient(...)`
      if (n.type === 'VariableDeclarator' && n.init?.type === 'AwaitExpression'
          && n.init.argument?.type === 'CallExpression'
          && n.init.argument.callee?.name === 'createLLMClient') factoryBinding = n.id?.name ?? null;
      if (n.type === 'CallExpression' && n.callee?.type === 'MemberExpression'
          && n.callee.property?.name === 'stream'
          && n.callee.object?.type === 'MemberExpression'
          && n.callee.object.property?.name === 'messages') {
        streamReceiver = n.callee.object.object?.name ?? null;
      }
      for (const k of Object.keys(n)) {
        const v = n[k];
        if (Array.isArray(v)) v.forEach(walk2); else if (v && typeof v === 'object' && v.type) walk2(v);
      }
    };
    walk2(ast);

    expect(factoryBinding, 'no binding is assigned from the factory call').not.toBeNull();
    expect(streamReceiver, 'the .messages.stream receiver is not the factory-derived binding')
      .toBe(factoryBinding);
    expect(rawSdkConstruction, 'a raw SDK client was constructed — the specimen no longer shows a FACTORY receiver')
      .toBe(false);
  });

  it('is labelled so a future sweeper stops rather than files it', () => {
    const src = readFileSync(FIXTURE, 'utf8');
    expect(src).toMatch(/PRESERVED SPECIMEN/);
    expect(src).toMatch(/DO NOT FILE IT/);
    expect(src).toMatch(/SD-LEO-INFRA-LLM-ADAPTER-STREAMING-ABSENT-001/);
  });

  it('is inert: not collected by the unit project and not imported by production', () => {
    expect(FIXTURE.endsWith('.test.js')).toBe(false);
    // IMPORT forms only. The retirement comment in eva-chat-service.js deliberately NAMES the
    // fixture path so a reader can find the specimen — a name-only grep flagged that as an import,
    // which would have punished the pointer this SD exists to leave behind.
    const importers = execSync(
      'git grep -nE "(import|require|from)[^\\n]*dead-factory-messages-stream" -- lib scripts server src || true',
      { cwd: REPO, encoding: 'utf8' },
    ).trim();
    expect(importers).toBe('');
  });
});

describe('every pointer in the watchdog doc resolves', () => {
  /**
   * Scoped to TABLE ROWS. A citation in a table is a pointer the reader is meant to follow; a
   * citation inside prose describing a PAST error is a historical reference, and a check that
   * cannot tell them apart would flag the very sentences that document the correction — the same
   * trap as a source pin matching the comment that narrates the code.
   */
  const rows = readFileSync(DOC, 'utf8').split('\n').filter((l) => l.trim().startsWith('|'));
  const citations = rows.flatMap((l) => [...l.matchAll(/`([\w./-]+\.(?:js|mjs|cjs)):(\d+)`/g)].map((m) => ({ path: m[1], line: Number(m[2]) })));

  it('found citations to check — a zero-row sweep would pass vacuously', () => {
    expect(citations.length).toBeGreaterThanOrEqual(3);
  });

  it.each(citations)('$path:$line resolves AND the cited line is the streaming call', ({ path, line }) => {
    /**
     * M09c killed here. The first version checked existence and line count only, so repointing a
     * citation from :110 to :1 stayed GREEN -- a citation can be badly wrong while still being
     * in-range. That is precisely the staleness class this SD found three times in this document
     * (two rows citing lines 862 and 1055 of a 184-line file), so a check that cannot detect
     * in-range drift is not a check on the thing that went wrong.
     */
    const full = join(REPO, path);
    expect(existsSync(full), `${path} does not exist`).toBe(true);
    const lines = readFileSync(full, 'utf8').split('\n');
    expect(lines.length, `${path} has ${lines.length} lines, citation points at ${line}`).toBeGreaterThanOrEqual(line);

    // Every citation in this table names a live {stream: true} caller. Anchor on that, with a small
    // window for ordinary edits above the call rather than a brittle exact-line match.
    const window = lines.slice(Math.max(0, line - 4), line + 3).join('\n');
    expect(window, `${path}:${line} does not point at a streaming call`).toMatch(/stream:\s*true/);
  });

  it('no table row still points at the deleted function', () => {
    expect(rows.join('\n')).not.toMatch(/eva-chat-service\.js:\d+/);
  });
});

describe('THE HELD NEGATIVE — the streaming path this SD promises not to break', () => {
  /**
   * *** THE FIRST VERSION OF THIS SAFETY CASE WAS THEATRE, MEASURED FOUR WAYS. ***
   * It said "the diff does not touch the live callers and the suites stay green". But
   * _completeWithStreaming has zero tests; both stage-17 suites vi.mock the client factory to
   * `{complete: mockComplete}` with zero occurrences of "stream"; scripts/prd/llm-generator.js has
   * no test at all; and the one test that builds a real adapter spies `messages.create` and never
   * `.stream`. NO TEST IN THIS REPO COULD GO RED IF THE STREAMING PATH BROKE.
   *
   * A held negative that cannot fail is worse than none, because it reads as protection. This is
   * the positive control that closes it — it drives the real _completeWithStreaming against the
   * same EventEmitter double shape the watchdog suite already uses.
   *
   * *** WHAT IT DOES NOT COVER, because the first draft of this docblock overstated it. *** Review
   * mutated four things that this control leaves GREEN: removing the watchdog from the race,
   * removing the wall-clock race, removing stream.abort() on timeout, and breaking complete()'s
   * routing into _completeWithStreaming. So "closes a hole where no test could go red" is true for
   * the TRANSPORT CALL and false for the three timeout behaviours the retirement block advertises
   * as the surviving streaming story. Those remain untested; saying so is better than leaving a
   * claim of coverage that does not exist.
   */
  const makeMockStream = () => {
    const ee = new EventEmitter();
    let resolveFinal;
    const finalPromise = new Promise((res) => { resolveFinal = res; });
    return {
      on: ee.on.bind(ee), off: ee.off.bind(ee), emit: ee.emit.bind(ee),
      finalMessage: () => finalPromise,
      abort() { this.aborted = true; },
      aborted: false,
      _resolveFinal: (v) => resolveFinal(v),
    };
  };

  it('_completeWithStreaming resolves through the real streaming path', async () => {
    const { AnthropicAdapter } = await import('../../../lib/sub-agents/vetting/provider-adapters.js');
    const adapter = new AnthropicAdapter({ apiKey: 'test-key-not-used' });

    const mock = makeMockStream();
    let requested = null;
    adapter.client = { messages: { stream: (params) => { requested = params; return mock; } } };

    const promise = adapter._completeWithStreaming(
      { model: 'claude-sonnet-4-5', max_tokens: 16, messages: [{ role: 'user', content: 'hi' }] },
      { timeout: 5000, stallTimeout: 5000 },
    );
    mock.emit('text', 'hello ');
    mock.emit('text', 'world');
    mock._resolveFinal({ content: [{ type: 'text', text: 'hello world' }] });

    const result = await promise;
    // It really went through .messages.stream, not some other path.
    expect(requested).toMatchObject({ model: 'claude-sonnet-4-5' });
    expect(JSON.stringify(result)).toContain('hello world');
  });

  it('the three live {stream:true} callers still request streaming', () => {
    // Cheap structural corroboration that the deletion did not disturb them. Not a substitute for
    // the control above — this would pass if _completeWithStreaming were broken.
    for (const [file, line] of [
      ['lib/eva/stage-17/archetype-generator.js', 110],
      ['lib/eva/stage-17/refinement.js', 107],
      ['scripts/prd/llm-generator.js', 104],
    ]) {
      const lines = readFileSync(join(REPO, file), 'utf8').split('\n');
      expect(lines.length, `${file} shrank past its cited caller`).toBeGreaterThanOrEqual(line);
      expect(lines.join('\n'), `${file} no longer requests streaming`).toMatch(/stream:\s*true/);
    }
  });
});
