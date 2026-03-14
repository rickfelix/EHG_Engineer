import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scanSubscriptions } from '../subscription-scanner.js';

const SAMPLE_ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <title>Channel Name</title>
  <entry>
    <yt:videoId>abc123</yt:videoId>
    <title>Test Video 1</title>
    <published>PUBLISH_DATE_1</published>
  </entry>
  <entry>
    <yt:videoId>def456</yt:videoId>
    <title>Test Video 2</title>
    <published>PUBLISH_DATE_2</published>
  </entry>
  <entry>
    <yt:videoId>old789</yt:videoId>
    <title>Old Video</title>
    <published>2024-01-01T00:00:00+00:00</published>
  </entry>
</feed>`;

function makeFeed(recentCount) {
  const now = new Date();
  let feed = SAMPLE_ATOM_FEED;
  feed = feed.replace('PUBLISH_DATE_1', recentCount >= 1 ? now.toISOString() : '2024-01-01T00:00:00+00:00');
  feed = feed.replace('PUBLISH_DATE_2', recentCount >= 2 ? new Date(now - 3600000).toISOString() : '2024-01-01T00:00:00+00:00');
  return feed;
}

describe('subscription-scanner', () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses Atom feed and extracts recent videos', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      text: async () => makeFeed(2)
    });

    const channels = [{ channel_id: 'UC123', channel_name: 'Test Channel' }];
    const videos = await scanSubscriptions(channels);

    expect(videos.length).toBe(2);
    expect(videos[0]).toMatchObject({
      video_id: 'abc123',
      title: 'Test Video 1',
      channel_id: 'UC123',
      channel_name: 'Test Channel'
    });
    expect(videos[0].video_url).toContain('abc123');
  });

  it('filters out old videos beyond hoursBack window', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      text: async () => makeFeed(1)
    });

    const channels = [{ channel_id: 'UC123', channel_name: 'Test Channel' }];
    const videos = await scanSubscriptions(channels, { hoursBack: 24 });

    expect(videos.length).toBe(1);
    expect(videos[0].video_id).toBe('abc123');
  });

  it('handles HTTP errors gracefully', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 404 });

    const channels = [{ channel_id: 'UC404', channel_name: 'Missing Channel' }];
    const videos = await scanSubscriptions(channels);

    expect(videos).toEqual([]);
  });

  it('handles network errors gracefully', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'));

    const channels = [{ channel_id: 'UC123', channel_name: 'Bad Channel' }];
    const videos = await scanSubscriptions(channels);

    expect(videos).toEqual([]);
  });

  it('processes multiple channels in parallel', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      text: async () => makeFeed(1)
    });

    const channels = [
      { channel_id: 'UC1', channel_name: 'Channel 1' },
      { channel_id: 'UC2', channel_name: 'Channel 2' },
      { channel_id: 'UC3', channel_name: 'Channel 3' }
    ];

    const videos = await scanSubscriptions(channels);

    expect(videos.length).toBe(3);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('respects limit option', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      text: async () => makeFeed(2)
    });

    const channels = [
      { channel_id: 'UC1', channel_name: 'Channel 1' },
      { channel_id: 'UC2', channel_name: 'Channel 2' }
    ];

    const videos = await scanSubscriptions(channels, { limit: 2 });
    expect(videos.length).toBe(2);
  });

  it('handles empty feed (no entries)', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      text: async () => '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Empty</title></feed>'
    });

    const channels = [{ channel_id: 'UC123', channel_name: 'Empty Channel' }];
    const videos = await scanSubscriptions(channels);

    expect(videos).toEqual([]);
  });
});
