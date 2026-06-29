/**
 * SD-LEO-INFRA-S15-WIREFRAME-LLM-UNPARSEABLE-001
 *
 * FR-2.2: repairJSON recovers UNESCAPED inner double-quotes (the likely S15 wireframe cause) without
 *         regressing the known-good corpus.
 * FR-2.3: a non-STOP finishReason is classified as an abnormal-termination (truncation-class) cause.
 * FR-1:   parse-failure errors carry full diagnostics (finishReason, outputTokens, contentLength, HEAD+TAIL).
 * FR-3/FR-4: source-level assertions that stage-15 fails fast on the boundary-mandatory artifact and the
 *         arch-plan insert resolves/guards vision_id.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseJSON } from '../../../../lib/eva/utils/parse-json.js';

const root = (p) => resolve(dirname(fileURLToPath(import.meta.url)), '../../../..', p);

// ── FR-2.2: unescaped inner quotes ───────────────────────────────────────────
describe('FR-2.2: repairJSON recovers unescaped inner double-quotes', () => {
  it('recovers a single inner unescaped quote pair in a value', () => {
    const r = parseJSON('{"desc": "a "quoted" word here"}');
    expect(r.desc).toBe('a "quoted" word here');
  });

  it('recovers an inner quote followed immediately by other text', () => {
    const r = parseJSON('{"label": "click "Save" now"}');
    expect(r.label).toBe('click "Save" now');
  });

  it('recovers inside a nested array of objects (wireframe-shaped)', () => {
    const raw = '{"screens":[{"name":"Home","note":"the "primary" CTA"}]}';
    const r = parseJSON(raw);
    expect(r.screens[0].name).toBe('Home');
    expect(r.screens[0].note).toBe('the "primary" CTA');
  });
});

// ── FR-2.2 regression: the known-good corpus must still parse ─────────────────
describe('FR-2.2 regression: known-good corpus unaffected', () => {
  const corpus = [
    ['plain object', '{"a":1,"b":"two","c":true,"d":null}'],
    ['empty strings', '{"a":"","b":""}'],
    ['adjacent array strings', '{"arr":["x","y","z"]}'],
    ['empty key', '{"":"v"}'],
    ['nested', '{"o":{"p":{"q":[1,2,3]}}}'],
    ['markdown-fenced', '```json\n{"x":42}\n```'],
    ['trailing comma', '{"a":1,"b":2,}'],
    ['smart quotes', '{“key”:“value”}'],
    ['url value with colon', '{"href":"https://example.com/x"}'],
  ];
  for (const [name, input] of corpus) {
    it(`parses: ${name}`, () => {
      expect(() => parseJSON(input)).not.toThrow();
    });
  }

  it('literal newline inside a string still repairs', () => {
    const r = parseJSON('{"text":"line1\nline2"}');
    expect(r.text).toContain('line1');
    expect(r.text).toContain('line2');
  });

  it('a url value followed by a structural delimiter keeps the colon', () => {
    const r = parseJSON('{"href":"https://example.com","n":1}');
    expect(r.href).toBe('https://example.com');
    expect(r.n).toBe(1);
  });
});

// ── FR-2.3: non-STOP finishReason classification ─────────────────────────────
describe('FR-2.3: non-STOP finishReason is a truncation-class cause', () => {
  it('MAX_TOKENS => token-ceiling message', () => {
    expect(() => parseJSON({ content: 'not json {', finishReason: 'MAX_TOKENS' }))
      .toThrow(/truncated at token ceiling/);
  });
  it('SAFETY (non-STOP) => abnormally terminated message', () => {
    expect(() => parseJSON({ content: 'not json {', finishReason: 'SAFETY' }))
      .toThrow(/abnormally terminated.*finishReason=SAFETY/);
  });
  it('RECITATION (non-STOP) => abnormally terminated', () => {
    expect(() => parseJSON({ content: '{bad', finishReason: 'RECITATION' }))
      .toThrow(/abnormally terminated/);
  });
  it('STOP (success) on unparseable => generic parse-failure, NOT abnormal', () => {
    expect(() => parseJSON({ content: 'not json {', finishReason: 'STOP' }))
      .toThrow(/Failed to parse LLM response as JSON/);
  });
});

// ── FR-1: rich diagnostics on parse failure ──────────────────────────────────
describe('FR-1: parse-failure error carries full diagnostics', () => {
  it('includes finishReason, outputTokens, and contentLength', () => {
    const resp = { content: 'not valid json at all {{{', finishReason: 'STOP', usage: { outputTokens: 123 } };
    expect(() => parseJSON(resp)).toThrow(/finishReason=STOP/);
    expect(() => parseJSON(resp)).toThrow(/outputTokens=123/);
    expect(() => parseJSON(resp)).toThrow(/contentLength=/);
  });
  it('includes a TAIL section for long unparseable bodies', () => {
    const long = '{' + 'x'.repeat(800); // >600 chars, unparseable
    expect(() => parseJSON({ content: long, finishReason: 'STOP' })).toThrow(/TAIL:/);
  });
});

// ── FR-3 / FR-4: source assertions ───────────────────────────────────────────
describe('FR-3: stage-15 fails fast on the boundary-mandatory wireframe artifact', () => {
  const src = readFileSync(root('lib/eva/stage-templates/stage-15.js'), 'utf8');
  it('throws (no silent non-fatal proceed) after the last wireframe retry', () => {
    // the last-attempt branch must throw with the real cause, not just warn "non-fatal"
    expect(src).toMatch(/boundary-mandatory wireframe_screens/);
    expect(src).toMatch(/throw new Error\(`\[Stage15\] Wireframe generation failed \(boundary-mandatory/);
  });
});

describe('FR-4: arch-plan insert resolves vision_id and skips when vision=none', () => {
  const src = readFileSync(root('lib/eva/artifact-persistence-service.js'), 'utf8');
  it('resolves the venture vision document and sets vision_id on insert', () => {
    expect(src).toMatch(/from\('eva_vision_documents'\)/);
    expect(src).toMatch(/vision_id: visionId/);
  });
  it('skips the insert when no vision document exists (vision=none)', () => {
    expect(src).toMatch(/insert skipped.*vision=none/);
  });
});
