import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  pairScreensToWireframes,
  scoreWireframeFidelity,
  setAnthropicClientLoader,
  setSupabaseClientLoader,
} from '../../lib/eva/qa/stitch-wireframe-qa.js';

// ---------------------------------------------------------------------------
// Pairing tests
// ---------------------------------------------------------------------------

describe('pairScreensToWireframes', () => {
  it('pairs screens to wireframes by exact name match', () => {
    const screens = [
      { screen_id: 'Home', base64: 'abc' },
      { screen_id: 'About', base64: 'def' },
    ];
    const wireframes = [
      { name: 'About', content: 'about wireframe' },
      { name: 'Home', content: 'home wireframe' },
    ];

    const pairs = pairScreensToWireframes(screens, wireframes);

    expect(pairs).toHaveLength(2);
    expect(pairs[0].screen_name).toBe('Home');
    expect(pairs[0].wireframe_name).toBe('Home');
    expect(pairs[1].screen_name).toBe('About');
    expect(pairs[1].wireframe_name).toBe('About');
  });

  it('falls back to index pairing when names mismatch', () => {
    const screens = [
      { screen_id: 'screen_1', base64: 'abc' },
      { screen_id: 'screen_2', base64: 'def' },
    ];
    const wireframes = [
      { name: 'Home', content: 'home' },
      { name: 'About', content: 'about' },
    ];

    const pairs = pairScreensToWireframes(screens, wireframes);

    expect(pairs).toHaveLength(2);
    expect(pairs[0].wireframe_name).toBe('Home');
    expect(pairs[1].wireframe_name).toBe('About');
  });

  it('handles more screens than wireframes', () => {
    const screens = [
      { screen_id: 'A', base64: 'a' },
      { screen_id: 'B', base64: 'b' },
      { screen_id: 'C', base64: 'c' },
    ];
    const wireframes = [
      { name: 'A', content: 'wf-a' },
      { name: 'B', content: 'wf-b' },
    ];

    const pairs = pairScreensToWireframes(screens, wireframes);

    expect(pairs).toHaveLength(3);
    expect(pairs[0].wireframe).not.toBeNull();
    expect(pairs[1].wireframe).not.toBeNull();
    expect(pairs[2].wireframe).toBeNull();
  });

  it('handles more wireframes than screens', () => {
    const screens = [{ screen_id: 'Home', base64: 'a' }];
    const wireframes = [
      { name: 'Home', content: 'wf1' },
      { name: 'About', content: 'wf2' },
      { name: 'Contact', content: 'wf3' },
    ];

    const pairs = pairScreensToWireframes(screens, wireframes);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].wireframe_name).toBe('Home');
  });
});

// ---------------------------------------------------------------------------
// scoreWireframeFidelity tests
// ---------------------------------------------------------------------------

describe('scoreWireframeFidelity', () => {
  beforeEach(() => {
    setAnthropicClientLoader(null);
    setSupabaseClientLoader(null);
  });

  it('returns degraded when ANTHROPIC_API_KEY missing', async () => {
    const origKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    setAnthropicClientLoader(() => null);

    const result = await scoreWireframeFidelity('v1', 'p1');

    expect(result.status).toBe('vision_api_unavailable');
    expect(result.overall_score).toBeNull();
    expect(result.screens).toEqual([]);

    if (origKey) process.env.ANTHROPIC_API_KEY = origKey;
  });

  it('scores 7 screens with mock vision API', async () => {
    const mockResponse = {
      content: [{
        text: JSON.stringify({
          component_presence: 85,
          layout_fidelity: 90,
          navigation_accuracy: 80,
          screen_purpose_match: 95,
          missing_elements: ['search bar'],
          notes: 'Good fidelity overall',
        }),
      }],
    };

    const mockClient = { messages: { create: vi.fn().mockResolvedValue(mockResponse) } };
    setAnthropicClientLoader(() => mockClient);

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
    setSupabaseClientLoader(() => mockSupabase);

    const screens = Array.from({ length: 7 }, (_, i) => ({
      screen_id: `screen_${i}`,
      base64: `base64data${i}`,
    }));
    const wireframes = Array.from({ length: 7 }, (_, i) => ({
      name: `screen_${i}`,
      content: `wireframe spec for screen ${i}`,
    }));

    const result = await scoreWireframeFidelity('v1', 'p1', {
      png_files_base64: screens,
      wireframes,
    });

    expect(result.status).toBe('completed');
    expect(result.screens).toHaveLength(7);
    expect(result.overall_score).toBe(88); // avg of 85+90+80+95 = 87.5 rounded
    expect(result.screens[0].dimensions.component_presence).toBe(85);
    expect(result.screens[0].missing_elements).toContain('search bar');
    expect(mockClient.messages.create).toHaveBeenCalledTimes(7);
  });

  it('handles per-screen download failure gracefully', async () => {
    const mockResponse = {
      content: [{ text: JSON.stringify({
        component_presence: 80, layout_fidelity: 80,
        navigation_accuracy: 80, screen_purpose_match: 80,
        missing_elements: [], notes: 'ok',
      }) }],
    };

    const mockClient = { messages: { create: vi.fn().mockResolvedValue(mockResponse) } };
    setAnthropicClientLoader(() => mockClient);

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
    setSupabaseClientLoader(() => mockSupabase);

    const screens = [
      { screen_id: 'good', base64: 'valid_data' },
      { screen_id: 'bad', base64: null }, // no image data
    ];
    const wireframes = [
      { name: 'good', content: 'wf1' },
      { name: 'bad', content: 'wf2' },
    ];

    const result = await scoreWireframeFidelity('v1', 'p1', {
      png_files_base64: screens,
      wireframes,
    });

    expect(result.status).toBe('completed');
    expect(result.screens[0].status).toBe('scored');
    expect(result.screens[1].status).toBe('download_failed');
    expect(result.overall_score).toBe(80); // only scored screen counts
  });
});
