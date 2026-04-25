const PREFIX_RE = /^([a-z]+(?:_[a-z]+){0,2})_/;
const MIN_GROUP_SIZE = 3;

export function clusterByPrefix(entries, { minGroupSize = MIN_GROUP_SIZE } = {}) {
  const buckets = new Map();
  const noPrefix = [];

  for (const entry of entries) {
    const m = entry.filename.match(PREFIX_RE);
    if (!m) { noPrefix.push(entry); continue; }
    const prefix = m[1];
    if (!buckets.has(prefix)) buckets.set(prefix, []);
    buckets.get(prefix).push(entry);
  }

  const topics = [];
  const standalone = [...noPrefix];

  for (const [prefix, members] of [...buckets.entries()].sort()) {
    if (members.length >= minGroupSize) {
      topics.push({ prefix, members: members.slice().sort((a, b) => a.filename.localeCompare(b.filename)) });
    } else {
      standalone.push(...members);
    }
  }

  standalone.sort((a, b) => a.filename.localeCompare(b.filename));
  return { topics, standalone };
}

export function buildTopicFilename(prefix) {
  return `topic_${prefix}.md`;
}

export function buildTopicContent(prefix, members) {
  const title = `Topic: ${prefix.replace(/_/g, ' ')}`;
  const description = `${members.length} related memories grouped from ${prefix}_*`;
  const lines = [
    '---',
    `name: ${title}`,
    `description: ${description}`,
    'type: topic',
    '---',
    '',
    `# ${title}`,
    '',
    `Auto-generated topic clustering ${members.length} memories under prefix \`${prefix}_*\`.`,
    '',
    '## Members',
    '',
    ...members.map(m => {
      const memTitle = m.parsed.name || m.filename.replace(/\.md$/, '');
      return `- [${memTitle}](${m.filename})`;
    }),
    '',
  ];
  return lines.join('\n');
}
