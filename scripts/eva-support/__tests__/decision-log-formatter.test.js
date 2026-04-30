import { describe, it, expect } from 'vitest';
import {
  buildEntry,
  serialize,
  parse,
  validate,
  renderMarkdown,
  ENVELOPE_VERSION,
  FENCE_LANG,
} from '../decision-log-formatter.js';

const baseInput = {
  task_id: 't-1',
  sequence: 1,
  flow: 'research',
  eva_reply: 'Investigate the Stripe webhook retry behavior first.',
  operator_input: 'Why is the webhook dropping?',
  model: 'claude-opus-4-7',
  tokens_in: 100,
  tokens_out: 50,
  references: ['https://stripe.com/docs/webhooks'],
};

describe('decision-log-formatter — buildEntry', () => {
  it('builds a valid v1.0 entry from valid input', () => {
    const e = buildEntry(baseInput);
    expect(e.schema_version).toBe(ENVELOPE_VERSION);
    expect(e.task_id).toBe('t-1');
    expect(e.sequence).toBe(1);
    expect(e.flow).toBe('research');
    expect(e.override_reason).toBeNull();
    expect(e.references).toEqual(['https://stripe.com/docs/webhooks']);
    expect(typeof e.timestamp).toBe('string');
  });

  it('truncates summaries over 500 chars with an ellipsis', () => {
    const longReply = 'a'.repeat(600);
    const e = buildEntry({ ...baseInput, eva_reply: longReply });
    expect(e.eva_reply_summary.length).toBe(500);
    expect(e.eva_reply_summary.endsWith('…')).toBe(true);
  });

  it('rejects missing task_id', () => {
    expect(() => buildEntry({ ...baseInput, task_id: '' })).toThrow(/task_id/);
  });

  it('rejects non-positive sequence', () => {
    expect(() => buildEntry({ ...baseInput, sequence: 0 })).toThrow(/sequence/);
  });

  it('rejects unknown flow', () => {
    expect(() => buildEntry({ ...baseInput, flow: 'bogus' })).toThrow(/flow must be one of/);
  });

  it('rejects missing model', () => {
    expect(() => buildEntry({ ...baseInput, model: '' })).toThrow(/model/);
  });

  it('preserves an override_reason when supplied', () => {
    const e = buildEntry({ ...baseInput, override_reason: 'time-boxed, just pick one' });
    expect(e.override_reason).toBe('time-boxed, just pick one');
  });
});

describe('decision-log-formatter — validate', () => {
  it('returns valid=true for a freshly built entry', () => {
    const e = buildEntry(baseInput);
    expect(validate(e)).toEqual({ valid: true, errors: [] });
  });

  it('flags wrong schema_version', () => {
    const e = { ...buildEntry(baseInput), schema_version: '0.9' };
    const r = validate(e);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/schema_version/);
  });

  it('flags non-object input', () => {
    expect(validate(null).valid).toBe(false);
    expect(validate('string').valid).toBe(false);
  });

  it('flags missing required fields', () => {
    const r = validate({ schema_version: ENVELOPE_VERSION });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('decision-log-formatter — serialize/parse round-trip', () => {
  it('serializes into a comment containing the fenced JSON', () => {
    const e = buildEntry(baseInput);
    const body = serialize(e);
    expect(body).toContain('EVA #1 — research');
    expect(body).toContain('```' + FENCE_LANG);
    expect(body).toContain('```');
  });

  it('serialize→parse round-trips losslessly', () => {
    const e = buildEntry(baseInput);
    const body = serialize(e);
    const parsed = parse(body);
    expect(parsed).toEqual(e);
  });

  it('parse returns null for a comment without the fenced block', () => {
    expect(parse('just a regular comment')).toBeNull();
  });

  it('parse returns null for a malformed JSON block', () => {
    const body = '```' + FENCE_LANG + '\n{invalid json\n```';
    expect(parse(body)).toBeNull();
  });

  it('parse returns null for non-string input', () => {
    expect(parse(null)).toBeNull();
    expect(parse(123)).toBeNull();
  });

  it('serialized header marks Override entries with [OVERRIDE: ...]', () => {
    const e = buildEntry({ ...baseInput, override_reason: 'time-boxed' });
    const body = serialize(e);
    expect(body).toContain('[OVERRIDE: time-boxed]');
  });
});

describe('decision-log-formatter — renderMarkdown', () => {
  it('returns the no-entries message for an empty list', () => {
    expect(renderMarkdown([])).toBe('No decision log entries on this subtask');
  });

  it('returns the no-entries message for a non-array', () => {
    expect(renderMarkdown(null)).toBe('No decision log entries on this subtask');
  });

  it('renders entries chronologically by sequence', () => {
    const e3 = buildEntry({ ...baseInput, sequence: 3, eva_reply: 'three' });
    const e1 = buildEntry({ ...baseInput, sequence: 1, eva_reply: 'one' });
    const e2 = buildEntry({ ...baseInput, sequence: 2, eva_reply: 'two', override_reason: 'just do it' });
    const md = renderMarkdown([e3, e1, e2]);
    expect(md.indexOf('one')).toBeLessThan(md.indexOf('two'));
    expect(md.indexOf('two')).toBeLessThan(md.indexOf('three'));
  });

  it('marks override entries visually with **[OVERRIDE]**', () => {
    const e = buildEntry({ ...baseInput, override_reason: 'force' });
    const md = renderMarkdown([e]);
    expect(md).toContain('**[OVERRIDE]**');
    expect(md).toContain('force');
  });

  it('includes references when present', () => {
    const e = buildEntry({ ...baseInput, references: ['https://example.com', 'src/foo.js'] });
    const md = renderMarkdown([e]);
    expect(md).toContain('https://example.com');
    expect(md).toContain('src/foo.js');
  });
});
