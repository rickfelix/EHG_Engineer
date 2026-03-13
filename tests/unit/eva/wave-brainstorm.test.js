import { describe, it, expect } from 'vitest';

// Test the enrichment attachment logic used in promoteWaveToSDs
// (inline replica since the actual function requires supabase)

function buildEnrichedDescription(waveTitle, sourceType, enrichment, brainstormResults, itemIndex) {
  const descParts = [`Promoted from roadmap wave "${waveTitle}" (source: ${sourceType})`];
  if (enrichment.enrichment_summary) {
    descParts.push(`\n\n## Enrichment Context\n${enrichment.enrichment_summary}`);
  }
  if (enrichment.chairman_intent) {
    descParts.push(`\n**Chairman Intent:** ${enrichment.chairman_intent}`);
  }
  if (enrichment.chairman_notes) {
    descParts.push(`**Chairman Notes:** ${enrichment.chairman_notes}`);
  }
  if (brainstormResults) {
    const rec = (brainstormResults.recommendations || []).find(r => r.item_index === itemIndex);
    if (rec) {
      descParts.push(`\n## Wave Brainstorm Assessment\n**Wave Theme:** ${brainstormResults.wave_theme || 'N/A'}`);
      descParts.push(`**Action:** ${rec.action}`);
      descParts.push(`**Rationale:** ${rec.rationale}`);
    }
  }
  return descParts.join('\n');
}

function buildSDMetadata(waveId, enrichment, brainstormResults) {
  const sdMetadata = { source_wave_id: waveId };
  if (enrichment.enrichment_summary) sdMetadata.enrichment_summary = enrichment.enrichment_summary;
  if (enrichment.chairman_intent) sdMetadata.chairman_intent = enrichment.chairman_intent;
  if (enrichment.chairman_notes) sdMetadata.chairman_notes = enrichment.chairman_notes;
  if (brainstormResults) {
    sdMetadata.wave_brainstorm_context = {
      wave_theme: brainstormResults.wave_theme,
      strategic_summary: brainstormResults.strategic_summary,
      risk_flags: brainstormResults.risk_flags,
    };
  }
  return sdMetadata;
}

describe('wave brainstorm and enhanced promotion', () => {
  describe('buildEnrichedDescription', () => {
    it('includes base promotion info without enrichment', () => {
      const result = buildEnrichedDescription('Wave 1', 'todoist', {}, null, 1);
      expect(result).toContain('Promoted from roadmap wave "Wave 1"');
      expect(result).toContain('source: todoist');
      expect(result).not.toContain('Enrichment Context');
    });

    it('includes enrichment summary when present', () => {
      const enrichment = { enrichment_summary: 'A helpful AI summary of the item' };
      const result = buildEnrichedDescription('Wave 1', 'todoist', enrichment, null, 1);
      expect(result).toContain('## Enrichment Context');
      expect(result).toContain('A helpful AI summary of the item');
    });

    it('includes chairman intent and notes', () => {
      const enrichment = {
        chairman_intent: 'Build',
        chairman_notes: 'Priority for Q2',
      };
      const result = buildEnrichedDescription('Wave 1', 'classified', enrichment, null, 1);
      expect(result).toContain('**Chairman Intent:** Build');
      expect(result).toContain('**Chairman Notes:** Priority for Q2');
    });

    it('includes brainstorm recommendation for matching item', () => {
      const brainstorm = {
        wave_theme: 'Infrastructure automation',
        strategic_summary: 'High value wave',
        recommendations: [
          { item_index: 1, action: 'promote', rationale: 'Implement first due to dependencies' },
          { item_index: 2, action: 'defer', rationale: 'Can wait' },
        ],
      };
      const result = buildEnrichedDescription('Wave 1', 'todoist', {}, brainstorm, 1);
      expect(result).toContain('## Wave Brainstorm Assessment');
      expect(result).toContain('**Wave Theme:** Infrastructure automation');
      expect(result).toContain('**Action:** promote');
      expect(result).toContain('Implement first due to dependencies');
    });

    it('omits brainstorm section when no matching recommendation', () => {
      const brainstorm = {
        wave_theme: 'Theme',
        recommendations: [{ item_index: 5, action: 'defer', rationale: 'Unrelated' }],
      };
      const result = buildEnrichedDescription('Wave 1', 'todoist', {}, brainstorm, 1);
      expect(result).not.toContain('Wave Brainstorm Assessment');
    });

    it('combines all sections: enrichment + chairman + brainstorm', () => {
      const enrichment = {
        enrichment_summary: 'Summary text',
        chairman_intent: 'Research',
        chairman_notes: 'Needs investigation',
      };
      const brainstorm = {
        wave_theme: 'Research wave',
        recommendations: [
          { item_index: 1, action: 'promote', rationale: 'Start with literature review' },
        ],
      };
      const result = buildEnrichedDescription('Research Wave', 'youtube', enrichment, brainstorm, 1);
      expect(result).toContain('Enrichment Context');
      expect(result).toContain('Chairman Intent');
      expect(result).toContain('Chairman Notes');
      expect(result).toContain('Wave Brainstorm Assessment');
    });
  });

  describe('buildSDMetadata', () => {
    it('always includes source_wave_id', () => {
      const result = buildSDMetadata('wave-123', {}, null);
      expect(result.source_wave_id).toBe('wave-123');
    });

    it('includes enrichment fields when present', () => {
      const result = buildSDMetadata('wave-123', {
        enrichment_summary: 'Summary',
        chairman_intent: 'Build',
        chairman_notes: 'Notes',
      }, null);
      expect(result.enrichment_summary).toBe('Summary');
      expect(result.chairman_intent).toBe('Build');
      expect(result.chairman_notes).toBe('Notes');
      expect(result.wave_brainstorm_context).toBeUndefined();
    });

    it('includes brainstorm context when present', () => {
      const brainstorm = {
        wave_theme: 'Automation',
        strategic_summary: 'High priority',
        risk_flags: ['dependency risk'],
        recommendations: [],
      };
      const result = buildSDMetadata('wave-123', {}, brainstorm);
      expect(result.wave_brainstorm_context).toEqual({
        wave_theme: 'Automation',
        strategic_summary: 'High priority',
        risk_flags: ['dependency risk'],
      });
    });

    it('includes both enrichment and brainstorm', () => {
      const result = buildSDMetadata('wave-123',
        { enrichment_summary: 'Sum', chairman_intent: 'Build' },
        { wave_theme: 'Theme', strategic_summary: 'Summary', risk_flags: [] }
      );
      expect(result.enrichment_summary).toBe('Sum');
      expect(result.chairman_intent).toBe('Build');
      expect(result.wave_brainstorm_context.wave_theme).toBe('Theme');
    });
  });
});
