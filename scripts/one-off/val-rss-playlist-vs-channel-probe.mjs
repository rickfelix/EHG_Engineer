// LIVE probe: is the playlist_id RSS variant equivalent to the proven channel_id variant?
const CH = 'UC_x5XG1OV2P6uZZ5FSM9Ttw';            // Google Developers channel (public)
const PL = 'UU_x5XG1OV2P6uZZ5FSM9Ttw';            // its uploads playlist (public, >15 items)
const probes = [
  ['channel_id (PROVEN precedent, subscription-scanner.js:25)', `https://www.youtube.com/feeds/videos.xml?channel_id=${CH}`],
  ['playlist_id (UNPROVEN variant the plan proposes)',            `https://www.youtube.com/feeds/videos.xml?playlist_id=${PL}`],
];
for (const [label, url] of probes) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const body = r.ok ? await r.text() : '';
    const entries = (body.match(/<entry>/g) || []).length;
    const hasVideoId = /<yt:videoId>/.test(body);
    const hasPlaylistItemId = /playlistItem|<yt:playlistItemId>/i.test(body);
    const hasDuration = /<yt:duration|duration/i.test(body);
    console.log(`\n[${label}]`);
    console.log(`  HTTP ${r.status} ${r.statusText}  bytes=${body.length}`);
    console.log(`  <entry> count = ${entries}`);
    console.log(`  has yt:videoId=${hasVideoId}  has playlistItemId=${hasPlaylistItemId}  has duration=${hasDuration}`);
    if (!r.ok) console.log('  body head:', body.slice(0,200));
  } catch (e) {
    console.log(`\n[${label}]\n  FETCH FAILED: ${e.message}`);
  }
}
