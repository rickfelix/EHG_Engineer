import { describe, test, expect } from 'vitest';
import { diffModels } from '../../../lib/gemini-scan/diff-known-models.js';

describe('diffModels', () => {
  test('identical fetched vs known produces an empty diff', () => {
    const known = [{ id: 'gemini-2.5-flash', displayName: 'Flash', description: 'd' }];
    const fetched = [{ id: 'gemini-2.5-flash', displayName: 'Flash', description: 'd' }];
    expect(diffModels(fetched, known)).toEqual({ newModels: [], changedModels: [] });
  });

  test('a model absent from known is reported as new', () => {
    const known = [];
    const fetched = [{ id: 'gemini-4.0-flash', displayName: 'Four', description: 'd' }];
    const { newModels, changedModels } = diffModels(fetched, known);
    expect(newModels).toEqual(fetched);
    expect(changedModels).toEqual([]);
  });

  test('a model whose description changed is reported as changed, not new', () => {
    const known = [{ id: 'gemini-2.5-flash', displayName: 'Flash', description: 'old' }];
    const fetched = [{ id: 'gemini-2.5-flash', displayName: 'Flash', description: 'new' }];
    const { newModels, changedModels } = diffModels(fetched, known);
    expect(newModels).toEqual([]);
    expect(changedModels).toHaveLength(1);
    expect(changedModels[0].priorDescription).toBe('old');
  });
});
