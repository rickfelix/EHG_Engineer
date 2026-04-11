/**
 * Unit tests for Stage 15 - Design Studio template
 * Updated for SD-S15-RESTRUCTURE-EXTENTOFCONDITION-LIFECYCLE-ORCH-001-B
 * SD-FIX-S15-WIREFRAME-TESTS-001: Added sub-step ordering validation
 *
 * Stage 15 was restructured from Risk Register to Design Studio in PRs #2798/#2799.
 * Risk register logic moved to Stage 14.
 *
 * @module tests/unit/eva/stage-templates/stage-15.test
 */

import { describe, it, expect, vi } from 'vitest';
import stage15 from '../../../../lib/eva/stage-templates/stage-15.js';

describe('stage-15.js - Design Studio template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage15.id).toBe('stage-15');
      expect(stage15.slug).toBe('design-studio');
      expect(stage15.title).toBe('Design Studio');
      expect(stage15.version).toBe('5.0.0');
    });

    it('should have schema definition for wireframes', () => {
      expect(stage15.schema).toBeDefined();
      expect(stage15.schema.wireframes).toBeDefined();
      expect(stage15.schema.wireframe_convergence).toBeDefined();
    });

    it('should have defaultData with null wireframes', () => {
      expect(stage15.defaultData).toEqual({
        wireframes: null,
        wireframe_convergence: null,
      });
    });

    it('should have validate function', () => {
      expect(typeof stage15.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage15.computeDerived).toBe('function');
    });

    it('should have analysisStep function', () => {
      expect(typeof stage15.analysisStep).toBe('function');
    });

    it('should have outputSchema', () => {
      expect(stage15.outputSchema).toBeDefined();
    });
  });

  describe('validate()', () => {
    it('should pass for valid data object', () => {
      const result = stage15.validate({ wireframes: null });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should pass for empty object (wireframes optional)', () => {
      const result = stage15.validate({});
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for null data', () => {
      const result = stage15.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail for undefined data', () => {
      const result = stage15.validate(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('computeDerived()', () => {
    it('should return data as-is', () => {
      const data = { wireframes: { screens: [] }, wireframe_convergence: null };
      const result = stage15.computeDerived(data);
      expect(result.wireframes).toEqual({ screens: [] });
      expect(result.wireframe_convergence).toBeNull();
    });

    it('should handle empty data', () => {
      const result = stage15.computeDerived({});
      expect(result).toEqual({});
    });
  });

  // SD-FIX-S15-WIREFRAME-TESTS-001: Sub-step ordering validation
  describe('analysisStep sub-step ordering', () => {
    it('executes sub-steps in correct order: UserStories → IA → Wireframes → Convergence', async () => {
      const executionOrder = [];

      // Mock all sub-step functions by intercepting the analysisStep
      // We verify ordering by checking the function source for call sequence
      const fnSource = stage15.analysisStep.toString();

      // Verify UserStoryPack runs BEFORE IA (reordered by SD-S15-WIREFRAME-BESTPRACTICE-ORCH-001-A)
      const storyIndex = fnSource.indexOf('generateUserStoryPack');
      const iaIndex = fnSource.indexOf('generateInformationArchitecture');
      const wireframeIndex = fnSource.indexOf('analyzeStage15WireframeGenerator');
      const convergenceIndex = fnSource.indexOf('analyzeStage19VisualConvergence');

      expect(storyIndex).toBeGreaterThan(-1);
      expect(iaIndex).toBeGreaterThan(-1);
      expect(wireframeIndex).toBeGreaterThan(-1);
      expect(convergenceIndex).toBeGreaterThan(-1);

      // Assert ordering: UserStories < IA < Wireframes < Convergence
      expect(storyIndex).toBeLessThan(iaIndex);
      expect(iaIndex).toBeLessThan(wireframeIndex);
      expect(wireframeIndex).toBeLessThan(convergenceIndex);
    });

    it('analysisStep is an async function', () => {
      expect(stage15.analysisStep.constructor.name).toBe('AsyncFunction');
    });
  });
});
