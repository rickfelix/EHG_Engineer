import { describe, it, expect } from 'vitest';
import { deriveSdFieldsFromRoadmapItem } from '../../lib/sourcing-engine/register-first.js';

// SD-LEO-INFRA-PROMOTION-THIN-STUB-FIX-001: the deriver must stop producing title===description===scope
// stubs (the belt_corpus_quarantine root cause) and instead return distinct, honest, enrichment-flagged fields.

const titleOnly = {
  id: 'rwi-1',
  title: 'stale-session-sweep coordination-cleanup deletes UNREAD coordinator->worker messages',
  source_type: 'brainstorm',
  source_id: 'src-1',
  item_disposition: 'pending',
};

describe('deriveSdFieldsFromRoadmapItem (thin-stub fix)', () => {
  it('returns description distinct from the title (no longer a clone)', () => {
    const f = deriveSdFieldsFromRoadmapItem(titleOnly);
    expect(f.description).not.toBe(f.title);
    expect(f.description).toContain(titleOnly.title); // verbatim title preserved inside
    expect(f.description.length).toBeGreaterThan(f.title.length);
  });

  it('returns scope distinct from both title and description', () => {
    const f = deriveSdFieldsFromRoadmapItem(titleOnly);
    expect(f.scope).not.toBe(f.title);
    expect(f.scope).not.toBe(f.description);
  });

  it('populates a non-empty strategic_intent (was empty)', () => {
    const f = deriveSdFieldsFromRoadmapItem(titleOnly);
    expect(typeof f.strategic_intent).toBe('string');
    expect(f.strategic_intent.length).toBeGreaterThan(0);
  });

  it('flags a title-only (thin) item via metadata.needs_enrichment', () => {
    const f = deriveSdFieldsFromRoadmapItem(titleOnly);
    expect(f.metadata.needs_enrichment).toEqual(expect.arrayContaining(['description', 'scope']));
  });

  it('preserves the full title (does not re-truncate)', () => {
    const f = deriveSdFieldsFromRoadmapItem(titleOnly);
    expect(f.title).toBe(titleOnly.title);
  });

  it('a from-roadmap-item promotion is NOT bare-shell (description !== title)', () => {
    const f = deriveSdFieldsFromRoadmapItem(titleOnly);
    // mirror isBareShell: description empty or strictly equal to title
    const isBareShell = !f.description || f.description.trim() === f.title.trim();
    expect(isBareShell).toBe(false);
  });

  it('honors richer metadata when present (no forced enrichment flag)', () => {
    const rich = {
      ...titleOnly,
      metadata: { description: 'A full, distinct description from the source doc.', scope: 'A real scope.', strategic_intent: 'A real intent.' },
    };
    const f = deriveSdFieldsFromRoadmapItem(rich);
    expect(f.description).toBe('A full, distinct description from the source doc.');
    expect(f.scope).toBe('A real scope.');
    expect(f.strategic_intent).toBe('A real intent.');
    expect(f.metadata.needs_enrichment).toBeUndefined(); // not thin -> not flagged
  });

  it('merges existing needs_enrichment without duplicates', () => {
    const withExisting = { ...titleOnly, metadata: { needs_enrichment: ['dependencies'] } };
    const f = deriveSdFieldsFromRoadmapItem(withExisting);
    expect(f.metadata.needs_enrichment).toEqual(expect.arrayContaining(['dependencies', 'description', 'scope']));
    // no dupes
    expect(new Set(f.metadata.needs_enrichment).size).toBe(f.metadata.needs_enrichment.length);
  });

  it('still returns title/type/metadata.source for back-compat', () => {
    const f = deriveSdFieldsFromRoadmapItem(titleOnly);
    expect(f.title).toBeTruthy();
    expect(f.type).toBe('feature');
    expect(f.metadata.source).toBe('roadmap_item');
    expect(f.metadata.source_id).toBe('rwi-1');
  });
});
