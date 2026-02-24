import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for Marketing Asset Generator.
 * SD: SD-LEO-FDBK-FEAT-VIDEO-EMPHASIZES-CEO-002
 */

vi.mock('../../llm/client-factory.js', () => ({
  getFastClient: vi.fn()
}));

import { generateLandingPage, generateAdCopy } from '../marketing-asset-generator.js';
import { getFastClient } from '../../llm/client-factory.js';

describe('generateLandingPage', () => {
  let mockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = { complete: vi.fn() };
    getFastClient.mockResolvedValue(mockClient);
  });

  it('returns LLM-generated HTML when available', async () => {
    const mockHtml = '<!DOCTYPE html><html lang="en"><head><title>Test</title></head><body><h1>Test</h1></body></html>';
    mockClient.complete.mockResolvedValue(mockHtml);

    const result = await generateLandingPage({ title: 'My Campaign' });
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<html');
  });

  it('passes campaign parameters to LLM prompt', async () => {
    mockClient.complete.mockResolvedValue('<!DOCTYPE html><html><body></body></html>');

    await generateLandingPage({
      title: 'Launch Event',
      description: 'Join our webinar',
      ctaText: 'Register Now',
      stage: 'selling_event'
    });

    const prompt = mockClient.complete.mock.calls[0][1];
    expect(prompt).toContain('Launch Event');
    expect(prompt).toContain('Join our webinar');
    expect(prompt).toContain('Register Now');
    expect(prompt).toContain('selling_event');
  });

  it('returns fallback HTML when LLM fails', async () => {
    getFastClient.mockRejectedValue(new Error('API unavailable'));

    const result = await generateLandingPage({ title: 'Fallback Test', ctaText: 'Click Here' });
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('Fallback Test');
    expect(result).toContain('Click Here');
  });

  it('returns fallback when LLM returns non-HTML', async () => {
    mockClient.complete.mockResolvedValue('Sorry, I cannot generate HTML right now.');

    const result = await generateLandingPage({ title: 'Non-HTML Response' });
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('Non-HTML Response');
  });

  it('fallback HTML is mobile-responsive', async () => {
    getFastClient.mockRejectedValue(new Error('API unavailable'));

    const result = await generateLandingPage({ title: 'Mobile Test' });
    expect(result).toContain('viewport');
    expect(result).toContain('@media');
  });

  it('fallback HTML has self-contained styles', async () => {
    getFastClient.mockRejectedValue(new Error('API unavailable'));

    const result = await generateLandingPage({ title: 'Style Test' });
    expect(result).toContain('<style>');
    expect(result).not.toContain('stylesheet');
  });

  it('escapes HTML in parameters to prevent XSS', async () => {
    getFastClient.mockRejectedValue(new Error('API unavailable'));

    const result = await generateLandingPage({ title: '<script>alert("xss")</script>' });
    expect(result).not.toContain('<script>alert');
    expect(result).toContain('&lt;script&gt;');
  });

  it('uses default values when parameters are missing', async () => {
    getFastClient.mockRejectedValue(new Error('API unavailable'));

    const result = await generateLandingPage({});
    expect(result).toContain('Your Next Step');
    expect(result).toContain('Get Started');
  });
});

describe('generateAdCopy', () => {
  let mockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = { complete: vi.fn() };
    getFastClient.mockResolvedValue(mockClient);
  });

  it('returns LLM-generated ad copy variants', async () => {
    const mockResponse = JSON.stringify([
      { headline: 'Boost Your Revenue', body: 'Start today with our proven system.' },
      { headline: 'Traffic That Converts', body: 'Drive qualified leads to your offer.' },
      { headline: 'Scale Your Business', body: 'From zero to hero in 30 days.' }
    ]);
    mockClient.complete.mockResolvedValue(mockResponse);

    const result = await generateAdCopy({ product: 'Marketing Suite' });
    expect(result).toHaveLength(3);
    expect(result[0].headline).toBe('Boost Your Revenue');
    expect(result[0].body).toContain('proven system');
  });

  it('returns at least 3 variants', async () => {
    const mockResponse = JSON.stringify([
      { headline: 'A', body: 'A body' },
      { headline: 'B', body: 'B body' },
      { headline: 'C', body: 'C body' }
    ]);
    mockClient.complete.mockResolvedValue(mockResponse);

    const result = await generateAdCopy({ product: 'Test' });
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('each variant has headline and body', async () => {
    const mockResponse = JSON.stringify([
      { headline: 'H1', body: 'B1' },
      { headline: 'H2', body: 'B2' },
      { headline: 'H3', body: 'B3' }
    ]);
    mockClient.complete.mockResolvedValue(mockResponse);

    const result = await generateAdCopy({ product: 'Widget' });
    result.forEach(variant => {
      expect(variant).toHaveProperty('headline');
      expect(variant).toHaveProperty('body');
      expect(typeof variant.headline).toBe('string');
      expect(typeof variant.body).toBe('string');
    });
  });

  it('returns fallback ad copy when LLM fails', async () => {
    getFastClient.mockRejectedValue(new Error('API unavailable'));

    const result = await generateAdCopy({ product: 'My Product', benefit: 'save time' });
    expect(result).toHaveLength(3);
    expect(result[0].headline).toContain('My Product');
    expect(result[0].body).toContain('save time');
  });

  it('returns fallback when LLM returns invalid JSON', async () => {
    mockClient.complete.mockResolvedValue('This is not JSON');

    const result = await generateAdCopy({ product: 'Fallback Product' });
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveProperty('headline');
    expect(result[0]).toHaveProperty('body');
  });

  it('passes product details to LLM prompt', async () => {
    mockClient.complete.mockResolvedValue(JSON.stringify([
      { headline: 'A', body: 'B' },
      { headline: 'C', body: 'D' },
      { headline: 'E', body: 'F' }
    ]));

    await generateAdCopy({
      product: 'EHG Platform',
      benefit: 'automate your business',
      audience: 'startup founders',
      stage: 'traffic'
    });

    const prompt = mockClient.complete.mock.calls[0][1];
    expect(prompt).toContain('EHG Platform');
    expect(prompt).toContain('automate your business');
    expect(prompt).toContain('startup founders');
    expect(prompt).toContain('traffic');
  });

  it('strips markdown code fences from LLM response', async () => {
    mockClient.complete.mockResolvedValue('```json\n[{"headline":"H","body":"B"},{"headline":"H2","body":"B2"},{"headline":"H3","body":"B3"}]\n```');

    const result = await generateAdCopy({ product: 'Test' });
    expect(result).toHaveLength(3);
    expect(result[0].headline).toBe('H');
  });

  it('returns fallback when LLM returns incomplete variants', async () => {
    mockClient.complete.mockResolvedValue(JSON.stringify([
      { headline: 'Only one' }
    ]));

    const result = await generateAdCopy({ product: 'Test' });
    expect(result).toHaveLength(3);
    // Should be fallback since response was incomplete
    expect(result[0]).toHaveProperty('body');
  });

  it('requests more variants when params.variants > 3', async () => {
    mockClient.complete.mockResolvedValue(JSON.stringify([
      { headline: 'A', body: 'B' },
      { headline: 'C', body: 'D' },
      { headline: 'E', body: 'F' },
      { headline: 'G', body: 'H' },
      { headline: 'I', body: 'J' }
    ]));

    await generateAdCopy({ product: 'Test', variants: 5 });
    const prompt = mockClient.complete.mock.calls[0][1];
    expect(prompt).toContain('5 ad copy variants');
  });
});
