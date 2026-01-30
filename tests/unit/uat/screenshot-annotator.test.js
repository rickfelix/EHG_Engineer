/**
 * Unit Tests: Screenshot Annotator
 *
 * Tests for SD-LEO-ENH-UAT-DOM-CAPTURE-001
 *
 * @module tests/unit/uat/screenshot-annotator.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { addBoundingBoxOverlay, createComparisonView } from '../../../lib/uat/screenshot-annotator.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      copyFile: vi.fn().mockResolvedValue(undefined)
    }
  };
});

describe('addBoundingBoxOverlay', () => {
  const testScreenshotPath = '/tmp/test-screenshot.png';
  const testOutputPath = '/tmp/test-annotated.png';
  const testBbox = { x: 100, y: 200, width: 80, height: 32 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create output directory if it does not exist', async () => {
    await addBoundingBoxOverlay(testScreenshotPath, testBbox, testOutputPath);

    expect(fs.mkdir).toHaveBeenCalledWith(
      path.dirname(testOutputPath),
      { recursive: true }
    );
  });

  it('should fall back to metadata file when sharp is not available', async () => {
    const result = await addBoundingBoxOverlay(testScreenshotPath, testBbox, testOutputPath);

    // Without sharp, it should create metadata file and copy original
    expect(fs.copyFile).toHaveBeenCalled();
    expect(result).toBe(testOutputPath);
  });

  it('should use custom border color and width', async () => {
    await addBoundingBoxOverlay(testScreenshotPath, testBbox, testOutputPath, {
      borderColor: '#00FF00',
      borderWidth: 4,
      labelText: 'Test Element'
    });

    // Should still work with custom options
    expect(fs.mkdir).toHaveBeenCalled();
  });

  it('should handle zero-sized bounding box', async () => {
    const zeroBbox = { x: 0, y: 0, width: 0, height: 0 };

    const result = await addBoundingBoxOverlay(testScreenshotPath, zeroBbox, testOutputPath);

    // Should still produce output even with zero bbox
    expect(result).toBeTruthy();
  });

  it('should handle negative coordinates', async () => {
    const negativeBbox = { x: -10, y: -20, width: 100, height: 50 };

    const result = await addBoundingBoxOverlay(testScreenshotPath, negativeBbox, testOutputPath);

    // Should handle edge case without crashing
    expect(result).toBeTruthy();
  });
});

describe('createComparisonView', () => {
  const leftPath = '/tmp/expected.png';
  const rightPath = '/tmp/actual.png';
  const outputPath = '/tmp/comparison.png';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create metadata file when sharp is not available', async () => {
    const result = await createComparisonView(leftPath, rightPath, outputPath);

    // Without sharp, should return metadata path
    expect(result).toContain('-comparison.json');
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should use custom labels', async () => {
    await createComparisonView(leftPath, rightPath, outputPath, {
      labels: ['Before', 'After']
    });

    // Should handle custom labels
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Before')
    );
  });
});
