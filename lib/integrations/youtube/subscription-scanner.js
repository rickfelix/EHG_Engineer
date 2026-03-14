import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

/**
 * Scan YouTube channel RSS feeds for new videos published in the last 24 hours.
 * Uses Atom RSS feeds (zero API quota).
 *
 * @param {Array<{channel_id: string, channel_name: string}>} channels
 * @param {Object} [options]
 * @param {number} [options.hoursBack=24] - How far back to check for new videos
 * @param {number} [options.limit] - Max videos to return (for testing)
 * @returns {Promise<Array<{video_id: string, title: string, channel_id: string, channel_name: string, video_url: string, published_at: string}>>}
 */
export async function scanSubscriptions(channels, options = {}) {
  const { hoursBack = 24, limit } = options;
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const results = [];

  const scanPromises = channels.map(async (channel) => {
    try {
      const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channel_id}`;
      const response = await fetch(feedUrl, { signal: AbortSignal.timeout(10000) });

      if (!response.ok) {
        console.error(`[RSS] ${channel.channel_name}: HTTP ${response.status}`);
        return [];
      }

      const xml = await response.text();
      const parsed = parser.parse(xml);
      const entries = parsed?.feed?.entry;

      if (!entries) return [];

      const videoEntries = Array.isArray(entries) ? entries : [entries];

      return videoEntries
        .filter(entry => {
          const publishedAt = new Date(entry.published);
          return publishedAt >= cutoff;
        })
        .map(entry => ({
          video_id: entry['yt:videoId'],
          title: entry.title,
          channel_id: channel.channel_id,
          channel_name: channel.channel_name,
          video_url: `https://www.youtube.com/watch?v=${entry['yt:videoId']}`,
          published_at: entry.published
        }));
    } catch (err) {
      console.error(`[RSS] ${channel.channel_name}: ${err.message}`);
      return [];
    }
  });

  const channelResults = await Promise.all(scanPromises);
  for (const videos of channelResults) {
    results.push(...videos);
  }

  if (limit) return results.slice(0, limit);
  return results;
}
