/**
 * Unit tests for the YouTube transcript fallback (FR-1 of
 * SD-LEO-INFRA-YOUTUBE-STRATEGY-EXTRACTION-001).
 *
 * All network I/O is mocked via a stubbed global.fetch. The contract under test:
 *  - pure helpers (pickTranscriptTrack / parseTimedTextJson3) select + flatten correctly
 *  - fetchTranscript is fail-open (null, never throws) and chains player->timedtext
 *  - analyzeTranscriptContent is fail-open and gated on an API key
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchTranscript,
  analyzeTranscriptContent,
  analyzeWithFallback,
  pickTranscriptTrack,
  parseTimedTextJson3,
} from '../../../lib/integrations/youtube/transcript-fallback.js';

const VID = 'abcdefghijk'; // 11 chars

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

describe('pickTranscriptTrack (pure)', () => {
  it('returns null for empty/invalid input', () => {
    expect(pickTranscriptTrack(null)).toBe(null);
    expect(pickTranscriptTrack([])).toBe(null);
    expect(pickTranscriptTrack([{ languageCode: 'en' }])).toBe(null); // no baseUrl
  });

  it('prefers a manual English track over an English ASR track', () => {
    const tracks = [
      { baseUrl: 'u-asr', languageCode: 'en', kind: 'asr' },
      { baseUrl: 'u-manual', languageCode: 'en' },
    ];
    expect(pickTranscriptTrack(tracks, 'en').baseUrl).toBe('u-manual');
  });

  it('falls back to English ASR when no manual English track exists', () => {
    const tracks = [
      { baseUrl: 'u-asr', languageCode: 'en', vssId: 'a.en' },
      { baseUrl: 'u-fr', languageCode: 'fr' },
    ];
    expect(pickTranscriptTrack(tracks, 'en').baseUrl).toBe('u-asr');
  });

  it('falls back to a non-ASR track in any language, then the first track', () => {
    expect(pickTranscriptTrack([{ baseUrl: 'u-de', languageCode: 'de' }], 'en').baseUrl).toBe('u-de');
    expect(pickTranscriptTrack([{ baseUrl: 'u-asr', languageCode: 'de', kind: 'asr' }], 'en').baseUrl).toBe('u-asr');
  });
});

describe('parseTimedTextJson3 (pure)', () => {
  it('flattens events/segs into a single trimmed string', () => {
    const json3 = { events: [{ segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] }, { segs: [{ utf8: ' again' }] }] };
    expect(parseTimedTextJson3(json3)).toBe('Hello world again');
  });

  it('returns empty string for missing/empty payloads', () => {
    expect(parseTimedTextJson3(null)).toBe('');
    expect(parseTimedTextJson3({})).toBe('');
    expect(parseTimedTextJson3({ events: [{}] })).toBe('');
  });
});

describe('fetchTranscript', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns null for an invalid videoId without any fetch', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await fetchTranscript('short')).toBe(null);
    expect(await fetchTranscript(null)).toBe(null);
    expect(f).not.toHaveBeenCalled();
  });

  it('chains innertube player -> timedtext and returns the transcript text', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: 'https://yt/timedtext?x=1', languageCode: 'en' }] } },
      }))
      .mockResolvedValueOnce(jsonResponse({ events: [{ segs: [{ utf8: 'pricing ' }, { utf8: 'framework' }] }] }));
    vi.stubGlobal('fetch', f);
    const out = await fetchTranscript(VID);
    expect(out).toBe('pricing framework');
    expect(f).toHaveBeenCalledTimes(2);
    // second call requested json3 format
    expect(f.mock.calls[1][0]).toContain('fmt=json3');
  });

  it('returns null (fail-open) when no caption tracks exist', async () => {
    const f = vi.fn().mockResolvedValueOnce(jsonResponse({ captions: {} }));
    vi.stubGlobal('fetch', f);
    expect(await fetchTranscript(VID)).toBe(null);
  });

  it('returns null (fail-open) when the player endpoint errors', async () => {
    const f = vi.fn().mockResolvedValueOnce(jsonResponse({}, false, 403));
    vi.stubGlobal('fetch', f);
    expect(await fetchTranscript(VID)).toBe(null);
  });

  it('never throws even if fetch rejects', async () => {
    const f = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', f);
    await expect(fetchTranscript(VID)).resolves.toBe(null);
  });
});

describe('analyzeTranscriptContent', () => {
  const ORIG = process.env.GEMINI_API_KEY;
  beforeEach(() => { process.env.GEMINI_API_KEY = 'test-key'; });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIG === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = ORIG;
  });

  it('returns null for an empty transcript without calling the API', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await analyzeTranscriptContent('')).toBe(null);
    expect(await analyzeTranscriptContent('   ')).toBe(null);
    expect(f).not.toHaveBeenCalled();
  });

  it('returns null when no API key is set', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await analyzeTranscriptContent('some transcript')).toBe(null);
    expect(f).not.toHaveBeenCalled();
  });

  it('returns the Gemini summary text on success', async () => {
    const f = vi.fn().mockResolvedValueOnce(jsonResponse({
      candidates: [{ content: { parts: [{ text: 'Key framework: value-based pricing.' }] } }],
    }));
    vi.stubGlobal('fetch', f);
    const out = await analyzeTranscriptContent('a long transcript about pricing', { chairmanIntent: 'pricing' });
    expect(out).toBe('Key framework: value-based pricing.');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('returns null (fail-open) on a Gemini API error', async () => {
    const f = vi.fn().mockResolvedValueOnce(jsonResponse({ error: 'quota' }, false, 429));
    vi.stubGlobal('fetch', f);
    expect(await analyzeTranscriptContent('transcript')).toBe(null);
  });

  it('clips an over-long transcript to maxTranscriptChars', async () => {
    let sentBody = null;
    const f = vi.fn().mockImplementation(async (_url, init) => { sentBody = JSON.parse(init.body); return jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }); });
    vi.stubGlobal('fetch', f);
    const huge = 'x'.repeat(500);
    await analyzeTranscriptContent(huge, { maxTranscriptChars: 100 });
    const promptText = sentBody.contents[0].parts[0].text;
    expect(promptText).toContain('[transcript truncated]');
  });
});

describe('analyzeWithFallback (native<->transcript decision, FR-2)', () => {
  // Inject stubs so no real network/module call happens.
  const deps = (over = {}) => ({
    _analyzeVideoContent: vi.fn().mockResolvedValue(null),
    _fetchTranscript: vi.fn().mockResolvedValue(null),
    _analyzeTranscriptContent: vi.fn().mockResolvedValue(null),
    ...over,
  });

  it('short video: native success -> method=native, transcript never attempted', async () => {
    const d = deps({ _analyzeVideoContent: vi.fn().mockResolvedValue('native summary') });
    const out = await analyzeWithFallback(VID, { metadata: { durationSeconds: 600 }, ...d });
    expect(out).toEqual({ summary: 'native summary', method: 'native' });
    expect(d._fetchTranscript).not.toHaveBeenCalled();
  });

  it('short video: native null -> transcript fallback used', async () => {
    const d = deps({ _fetchTranscript: vi.fn().mockResolvedValue('the transcript'), _analyzeTranscriptContent: vi.fn().mockResolvedValue('t summary') });
    const out = await analyzeWithFallback(VID, { metadata: { durationSeconds: 600 }, ...d });
    expect(out).toEqual({ summary: 't summary', method: 'transcript_fallback' });
    expect(d._analyzeVideoContent).toHaveBeenCalledTimes(1);
  });

  it('short video: both fail -> failed_other', async () => {
    const out = await analyzeWithFallback(VID, { metadata: { durationSeconds: 600 }, ...deps() });
    expect(out).toEqual({ summary: null, method: 'failed_other' });
  });

  it('long video: transcript tried FIRST (native not called) -> transcript_fallback', async () => {
    const d = deps({ _fetchTranscript: vi.fn().mockResolvedValue('long transcript'), _analyzeTranscriptContent: vi.fn().mockResolvedValue('long summary') });
    const out = await analyzeWithFallback(VID, { metadata: { durationSeconds: 4000 }, longVideoThresholdSeconds: 2700, ...d });
    expect(out).toEqual({ summary: 'long summary', method: 'transcript_fallback' });
    expect(d._analyzeVideoContent).not.toHaveBeenCalled();
  });

  it('long video: no transcript -> last-ditch native success -> method=native', async () => {
    const d = deps({ _analyzeVideoContent: vi.fn().mockResolvedValue('native rescue') });
    const out = await analyzeWithFallback(VID, { metadata: { durationSeconds: 4000 }, longVideoThresholdSeconds: 2700, ...d });
    expect(out).toEqual({ summary: 'native rescue', method: 'native' });
  });

  it('long video: transcript + native both fail -> failed_long (KEEP for retry)', async () => {
    const out = await analyzeWithFallback(VID, { metadata: { durationSeconds: 4000 }, longVideoThresholdSeconds: 2700, ...deps() });
    expect(out).toEqual({ summary: null, method: 'failed_long' });
  });
});
