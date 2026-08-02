/**
 * QF-20260802-207 — tests for the shared truncation predicate and its two consumers.
 *
 * THE CASE THAT MATTERS IS THE ONE THAT SHIPPED BROKEN FOR A WEEK: finishReason='STOP' with an
 * unparseable JSON body. Both existing guards keyed on 'MAX_TOKENS' and were blind to it, so
 * venture 50763b6a sat failed at stage 5 from 2026-07-26 with three byte-identical failures.
 *
 * Fixtures use the REAL observed shape (finishReason STOP, ~997 output tokens, JSON cut mid-object)
 * rather than synthetic well-formed objects — a fixture that cannot reproduce the bug cannot
 * falsify the fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isTruncatedResponse, looksLikeUnterminatedJson, SUCCESS_FINISH, EXPLICIT_TRUNCATION_FINISH } from './truncation-detect.js';
import { parseJSON } from '../eva/utils/parse-json.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The observed stage-5 failure: JSON cut off mid-object, reported as a clean STOP. */
const STAGE5_TRUNCATED = {
  content: '{"revenueModel": {"tiers": [{"name": "Starter", "priceUsd": 12}, {"name": "Pro", "priceUsd": 49}], "opex": {"hosting": 340, "llm',
  finishReason: 'STOP',
  usage: { outputTokens: 997 },
};

describe('THE REGRESSION: STOP-truncation must be visible', () => {
  it('classifies STOP + unparseable JSON as truncated', () => {
    expect(isTruncatedResponse(STAGE5_TRUNCATED)).toBe(true);
  });

  it('parseJSON names TRUNCATION, not the generic parse failure', () => {
    // The old message — "Failed to parse LLM response as JSON" — sent three investigations at the
    // prompt instead of the ceiling. Naming the cause is the deliverable.
    expect(() => parseJSON(STAGE5_TRUNCATED)).toThrow(/TREAT AS TRUNCATION/);
    expect(() => parseJSON(STAGE5_TRUNCATED)).toThrow(/STOP, not MAX_TOKENS/);
  });

  it('still classifies the explicit MAX_TOKENS case (no regression)', () => {
    expect(isTruncatedResponse({ content: 'x', finishReason: 'MAX_TOKENS' })).toBe(true);
    expect(EXPLICIT_TRUNCATION_FINISH.has('MAX_TOKENS')).toBe(true);
  });
});

describe('OPPOSITE POLARITY — a healthy response must never be reclassified', () => {
  it('STOP + valid JSON is not truncated', () => {
    expect(isTruncatedResponse({ content: '{"ok": true}', finishReason: 'STOP' })).toBe(false);
  });

  it('STOP + prose is not truncated (this client also serves non-JSON callers)', () => {
    expect(isTruncatedResponse({ content: 'The layout looks correct.', finishReason: 'STOP' })).toBe(false);
  });

  it('valid JSON still parses through parseJSON unchanged', () => {
    expect(parseJSON({ content: '{"a": 1}', finishReason: 'STOP' })).toEqual({ a: 1 });
  });

  it('fenced JSON still parses (fence-stripping preserved)', () => {
    expect(parseJSON({ content: '```json\n{"a": 2}\n```', finishReason: 'STOP' })).toEqual({ a: 2 });
  });

  it('a non-JSON body is left alone by the shape probe', () => {
    expect(looksLikeUnterminatedJson('just some text')).toBe(false);
    expect(looksLikeUnterminatedJson('')).toBe(false);
    expect(looksLikeUnterminatedJson(null)).toBe(false);
  });
});

describe('ABNORMAL finishReason stays its own class — do not conflate', () => {
  it('SAFETY is not reported as a ceiling truncation', () => {
    // parse-json already names these separately; folding them into truncation would misdirect
    // exactly the way the generic parse message did.
    expect(isTruncatedResponse({ content: '{"a"', finishReason: 'SAFETY' })).toBe(false);
  });

  it('parseJSON still names an abnormal finish distinctly', () => {
    expect(() => parseJSON({ content: '{"a"', finishReason: 'SAFETY' })).toThrow(/abnormally terminated/);
  });
});

describe('THE CACHE BAN — a truncated response must never be replayed', () => {
  const factory = readFileSync(resolve(REPO_ROOT, 'lib/llm/client-factory.js'), 'utf8');
  const code = factory.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('the cache guard uses the shared predicate, not a bare MAX_TOKENS compare', () => {
    // Assert on CODE, not text — the file's comments quote the old check verbatim while explaining
    // why it was insufficient, so a raw substring match reads its own explanation. That mistake was
    // made twice earlier in this session.
    expect(code).toMatch(/!isTruncatedResponse\(result\)/);
    expect(code).not.toMatch(/result\.finishReason\s*!==\s*'MAX_TOKENS'/);
  });

  it('client-factory imports the shared predicate', () => {
    expect(code).toMatch(/import \{ isTruncatedResponse \} from '\.\/truncation-detect\.js'/);
  });
});

describe('THE CEILING — one mapping, not two', () => {
  const mm = readFileSync(resolve(REPO_ROOT, 'lib/ai/multimodal-client.js'), 'utf8');
  const code = mm.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('multimodal-client no longer defaults to the 1000 ceiling that truncated stage 5', () => {
    expect(code).not.toMatch(/maxTokens:\s*config\.maxTokens\s*\|\|\s*1000/);
    expect(code).toMatch(/purposeOutputCeiling\(config\.purpose\)/);
  });

  it('its purpose ceiling matches the vetting adapter exactly (16384 / 4096)', () => {
    // Same numbers as lib/sub-agents/vetting/provider-adapters.js:599. Two ceilings for one question
    // is how the original purpose-threading fix ended up half-covering.
    expect(code).toMatch(/content-generation'\s*\?\s*16384\s*:\s*4096/);
  });

  it('SUCCESS_FINISH is single-sourced, not redefined in parse-json', () => {
    const pj = readFileSync(resolve(REPO_ROOT, 'lib/eva/utils/parse-json.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Assert the PROPERTY (single-sourcing), not the exact import spelling. The first version of
    // this pinned the literal string and broke the moment a second symbol was added to the same
    // import — a test that fails on a harmless refactor teaches people to edit tests reflexively.
    expect(pj).toMatch(/import \{[^}]*\bSUCCESS_FINISH\b[^}]*\} from '\.\.\/\.\.\/llm\/truncation-detect\.js'/);
    expect(pj).not.toMatch(/const SUCCESS_FINISH\s*=\s*new Set/);
    expect(SUCCESS_FINISH.has('STOP')).toBe(true);
  });
});
