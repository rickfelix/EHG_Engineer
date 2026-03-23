/**
 * Tests for SRIP Artifact Synthesizer
 * SD: SD-MAN-INFRA-SRIP-AUTO-SYNTHESIZER-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapArtifactsToDna, inferPrimaryColor } from '../../../lib/eva/services/srip-artifact-synthesizer.js';

describe('srip-artifact-synthesizer', () => {
  describe('mapArtifactsToDna', () => {
    it('maps full artifact set to dna_json', () => {
      const artifacts = {
        1: {
          description: 'An AI-powered fitness coaching app that personalizes workout plans',
          valueProp: 'Personalized AI coaching for everyone',
          archetype: 'Hero',
          ventureType: 'health',
          targetMarket: 'Health-conscious adults 25-45',
        },
        3: { overallScore: 72, decision: 'GO' },
        4: {
          competitors: [
            { name: 'FitBod', url: 'https://fitbod.me' },
            { name: 'Noom', url: 'https://noom.com' },
          ],
        },
        5: { year1: { revenue: 50000 }, revenueStreams: ['subscriptions'] },
        8: {
          customerSegments: { items: ['Busy professionals', 'Fitness beginners', 'Athletes'] },
          valuePropositions: { items: ['AI-personalized workout plans'] },
          channels: { items: ['App Store', 'Social Media', 'Influencer partnerships'] },
          customerRelationships: { items: ['Automated coaching', 'Community forum'] },
        },
      };

      const dna = mapArtifactsToDna(artifacts);

      // design_tokens
      expect(dna.design_tokens.colors.primary).toBe('#1a56db'); // Hero archetype = trust blue (archetype > ventureType)
      expect(dna.design_tokens.typography.font_family).toContain('sans-serif');

      // copy_patterns
      expect(dna.copy_patterns.tone).toContain('Hero');
      expect(dna.copy_patterns.headings).toContain('Personalized AI coaching for everyone');
      expect(dna.copy_patterns.ctas.length).toBeGreaterThan(0);
      expect(dna.copy_patterns.word_count).toBeGreaterThan(0);

      // macro_architecture
      expect(dna.macro_architecture.page_flow).toBe('multi-section'); // 3 segments
      expect(dna.macro_architecture.responsive_approach).toBe('mobile-first');

      // component_behaviors
      expect(dna.component_behaviors.components.length).toBeGreaterThanOrEqual(2);
      const types = dna.component_behaviors.components.map(c => c.type);
      expect(types).toContain('form'); // customerRelationships present
      expect(types).toContain('card_grid'); // competitors present

      // tech_stack
      expect(dna.tech_stack.framework).toBe('react');

      // metadata
      expect(dna._source).toBe('artifact_synthesis');
      expect(dna._stage_sources).toEqual(expect.arrayContaining([1, 3, 4, 5, 8]));
    });

    it('maps partial artifacts (only stage 1)', () => {
      const artifacts = {
        1: {
          description: 'A simple budgeting app',
          valueProp: 'Budget smarter',
        },
      };

      const dna = mapArtifactsToDna(artifacts);

      expect(dna.copy_patterns.headings).toContain('Budget smarter');
      expect(dna.copy_patterns.ctas).toContain('Get Started'); // Default B2C
      expect(dna.component_behaviors.components.length).toBe(0); // No stage 4/8 data
      expect(dna._stage_sources).toEqual([1]);
    });

    it('detects B2B ventures from customer segments', () => {
      const artifacts = {
        1: { description: 'Enterprise SaaS platform' },
        8: {
          customerSegments: { items: ['Enterprise IT teams', 'B2B SaaS companies'] },
        },
      };

      const dna = mapArtifactsToDna(artifacts);

      expect(dna.copy_patterns.ctas).toContain('Contact Sales');
      expect(dna.design_tokens.typography.font_family).toBe('Inter, sans-serif');
    });
  });

  describe('inferPrimaryColor', () => {
    it('returns trust blue for Hero archetype', () => {
      expect(inferPrimaryColor('Hero', '')).toBe('#1a56db');
    });

    it('returns creative purple for Creator archetype', () => {
      expect(inferPrimaryColor('Creator', '')).toBe('#7c3aed');
    });

    it('returns growth green for health ventures', () => {
      expect(inferPrimaryColor('', 'health')).toBe('#059669');
    });

    it('returns trust blue for fintech ventures', () => {
      expect(inferPrimaryColor('', 'fintech')).toBe('#1a56db');
    });

    it('returns default blue when no match', () => {
      expect(inferPrimaryColor('', '')).toBe('#1a56db');
    });

    it('prioritizes archetype over venture type', () => {
      expect(inferPrimaryColor('Creator', 'fintech')).toBe('#7c3aed');
    });
  });
});
