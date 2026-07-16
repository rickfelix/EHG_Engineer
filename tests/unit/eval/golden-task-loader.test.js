import { describe, it, expect } from 'vitest';
import { buildSuite, GoldenTask } from '../../../lib/eval/golden-task-loader.mjs';

// TS-1 (redaction) + TS-7 (contamination sweep on serialized surfaces).
// Sentinels are fabricated — no sealed content appears in this repo.
const KEY_SENTINEL = 'FAKE-ANSWER-KEY-SENTINEL-93f1';
const TEXT_SENTINEL = 'FAKE-TASK-TEXT-SENTINEL-77ab';

const rows = [
  {
    id: 'row-1',
    metadata: {
      record_kind: 'answer_key',
      task_id: 'FAKE-R2-01',
      shape: 'R2-negative-space',
      task_text: `Some long prompt ${TEXT_SENTINEL}`,
      answer_key: `The graded key ${KEY_SENTINEL}`,
      content_hash: 'abc123',
    },
  },
  {
    id: 'row-2',
    metadata: {
      record_kind: 'sealed_run', // runs are not tasks; must be ignored
      task_id: 'FAKE-R2-01',
      shape: 'R2-negative-space',
      task_text: `run copy ${TEXT_SENTINEL}`,
      fable5_answer: 'answer body',
      content_hash: 'abc123',
    },
  },
];

describe('golden-task-loader redaction contract', () => {
  it('builds tasks from answer_key rows only, keys retrievable in memory', () => {
    const suite = buildSuite(rows);
    expect(suite.size).toBe(1);
    expect(suite.tasks[0]).toBeInstanceOf(GoldenTask);
    expect(suite.tasks[0].taskText).toContain(TEXT_SENTINEL);
    expect(suite.getKey('FAKE-R2-01').answer_key).toContain(KEY_SENTINEL);
    expect(suite.getKey('MISSING')).toBeNull();
  });

  it('JSON.stringify of the suite and tasks leaks neither key nor task text', () => {
    const suite = buildSuite(rows);
    const surfaces = [
      JSON.stringify(suite),
      JSON.stringify(suite.tasks),
      JSON.stringify(suite.tasks[0]),
      JSON.stringify({ nested: { deep: suite } }),
    ];
    for (const s of surfaces) {
      expect(s).not.toContain(KEY_SENTINEL);
      expect(s).not.toContain(TEXT_SENTINEL);
    }
    // Safe fields ARE present so the object is still useful in logs.
    expect(JSON.stringify(suite.tasks[0])).toContain('FAKE-R2-01');
    expect(JSON.stringify(suite.tasks[0])).toContain('abc123');
  });

  it('own-property enumeration exposes no secret fields', () => {
    const suite = buildSuite(rows);
    const task = suite.tasks[0];
    const dumped = JSON.stringify(Object.entries(task));
    expect(dumped).not.toContain(KEY_SENTINEL);
    expect(dumped).not.toContain(TEXT_SENTINEL);
    expect(Object.keys(task)).not.toContain('task_text');
    expect(Object.keys(task)).not.toContain('answer_key');
  });
});
