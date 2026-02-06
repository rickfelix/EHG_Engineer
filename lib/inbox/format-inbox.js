/**
 * Unified Inbox Formatter
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-D
 *
 * Formats the unified inbox result for terminal/CLI output.
 * Supports concise (default) and verbose modes per FR-6.
 */

import { LIFECYCLE_SECTIONS } from './unified-inbox-builder.js';

const SECTION_LABELS = {
  NEW: 'NEW',
  ON_THE_SHELF: 'ON THE SHELF',
  PENDING_SDS: 'PENDING SDs',
  IN_PROGRESS: 'IN PROGRESS',
  COMPLETED: 'COMPLETED'
};

const TYPE_BADGES = {
  feedback: 'FB',
  pattern: 'PAT',
  audit: 'AUD',
  sd: 'SD'
};

function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1d ago';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.substring(0, max - 1) + '\u2026' : str;
}

function getIdentifier(item) {
  if (item.item_type === 'sd') return item.metadata?.sd_key || item.source_ref.pk;
  if (item.item_type === 'pattern') return item.source_ref.pk;
  if (item.item_type === 'feedback') return item.source_ref.pk.substring(0, 8);
  if (item.item_type === 'audit') return item.source_ref.pk.substring(0, 8);
  return item.item_id;
}

/**
 * Format unified inbox for text output (terminal)
 */
function formatText(result, options = {}) {
  const { verbose = false } = options;
  const lines = [];

  lines.push('');
  lines.push('========================================================');
  lines.push('  UNIFIED INBOX');
  lines.push('========================================================');
  lines.push('');
  lines.push(`  Sources: ${result.counts.by_source.feedback} feedback, ${result.counts.by_source.patterns} patterns, ${result.counts.by_source.audit} audit, ${result.counts.by_source.sds} SDs`);
  lines.push(`  Total items: ${result.counts.total} (${result.counts.linked} linked to SDs)`);
  lines.push('');

  for (const section of LIFECYCLE_SECTIONS) {
    const items = result.sections[section];
    const label = SECTION_LABELS[section];
    const count = items.length;

    lines.push(`--- ${label} (${count}) ${'—'.repeat(Math.max(0, 48 - label.length - String(count).length))}`);

    if (count === 0) {
      lines.push('    (none)');
    } else {
      for (const item of items) {
        const badge = TYPE_BADGES[item.item_type] || '??';
        const id = getIdentifier(item);
        const title = truncate(item.title, verbose ? 80 : 55);
        const updated = formatDate(item.updated_at);

        lines.push(`  [${badge}] ${title} - ${updated} - ${id}`);

        // Show linked items for SDs in verbose mode
        if (verbose && item.item_type === 'sd' && item.linked_items && item.linked_items.length > 0) {
          lines.push(`        ${item.linked_items.length} linked item(s):`);
          for (const linked of item.linked_items) {
            const lBadge = TYPE_BADGES[linked.item_type] || '??';
            const lTitle = truncate(linked.title, 60);
            lines.push(`          [${lBadge}] ${lTitle}`);
          }
        }

        // Show extra metadata in verbose mode
        if (verbose) {
          const extras = [];
          if (item.source_ref) extras.push(`src: ${item.source_ref.table}`);
          if (item.created_at) extras.push(`created: ${formatDate(item.created_at)}`);
          if (item.assigned_sd_id) extras.push(`sd: ${item.assigned_sd_id}`);
          if (extras.length > 0) {
            lines.push(`        ${extras.join(' | ')}`);
          }
        }
      }
    }
    lines.push('');
  }

  lines.push('========================================================');
  lines.push(`  Generated: ${result.metadata.generated_at}`);
  lines.push('========================================================');

  return lines.join('\n');
}

/**
 * Format unified inbox as JSON (for tooling, FR-5)
 */
function formatJSON(result) {
  const sections = LIFECYCLE_SECTIONS.map(section => ({
    section,
    label: SECTION_LABELS[section],
    count: result.sections[section].length,
    items: result.sections[section]
  }));

  return JSON.stringify({
    sections,
    counts: result.counts,
    metadata: result.metadata
  }, null, 2);
}

export { formatText, formatJSON, SECTION_LABELS, TYPE_BADGES };
