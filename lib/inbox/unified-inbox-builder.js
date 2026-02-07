/**
 * Unified Inbox Builder
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-D
 *
 * Aggregates feedback, issue_patterns, audit_findings, and SDs
 * into a single normalized list with lifecycle grouping and
 * smart deduplication.
 */

const LIFECYCLE_SECTIONS = ['NEW', 'ON_THE_SHELF', 'PENDING_SDS', 'IN_PROGRESS', 'COMPLETED'];

// ---------------------------------------------------------------------------
// Lifecycle mapping (pure functions per FR-4)
// ---------------------------------------------------------------------------

function mapFeedbackLifecycle(status) {
  switch (status) {
    case 'new': return 'NEW';
    case 'backlog': return 'ON_THE_SHELF';
    case 'resolved': return 'COMPLETED';
    default: return 'NEW';
  }
}

function mapPatternLifecycle(status) {
  switch (status) {
    case 'active': return 'NEW';
    case 'resolved': return 'COMPLETED';
    default: return 'NEW';
  }
}

function mapAuditLifecycle(status) {
  switch (status) {
    case 'open':
    case 'new': return 'NEW';
    case 'in_progress': return 'IN_PROGRESS';
    case 'resolved':
    case 'closed': return 'COMPLETED';
    default: return 'NEW';
  }
}

function mapSDLifecycle(status) {
  switch (status) {
    case 'draft':
    case 'planning': return 'PENDING_SDS';
    case 'in_progress': return 'IN_PROGRESS';
    case 'completed':
    case 'cancelled': return 'COMPLETED';
    default: return 'PENDING_SDS';
  }
}

// ---------------------------------------------------------------------------
// Normalizers — convert raw DB rows to UnifiedInboxItem shape
// ---------------------------------------------------------------------------

function normalizeFeedback(row) {
  return {
    item_id: `feedback-${row.id}`,
    item_type: 'feedback',
    title: row.title || (row.description ? row.description.substring(0, 80) : 'Untitled feedback'),
    lifecycle_status: mapFeedbackLifecycle(row.status),
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
    source_ref: { table: 'feedback', pk: row.id },
    // GAP-006: Check strategic_directive_id FK first, then resolution_sd_id
    assigned_sd_id: row.strategic_directive_id || row.resolution_sd_id || null,
    linked_items: null,
    priority: row.priority || null,
    // SD-FDBK-ENH-ADD-QUALITY-SCORING-001: Quality score for display
    rubric_score: row.rubric_score ?? null,
    metadata: {
      type: row.type,
      category: row.category,
      severity: row.severity,
      status: row.status,
      sd_id: row.sd_id,
      resolution_sd_id: row.resolution_sd_id,
      strategic_directive_id: row.strategic_directive_id
    }
  };
}

function normalizePattern(row) {
  return {
    item_id: `pattern-${row.pattern_id}`,
    item_type: 'pattern',
    title: row.issue_summary || 'Untitled pattern',
    lifecycle_status: mapPatternLifecycle(row.status),
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
    source_ref: { table: 'issue_patterns', pk: row.pattern_id },
    assigned_sd_id: row.assigned_sd_id || null,
    linked_items: null,
    priority: row.severity || null,
    metadata: {
      category: row.category,
      severity: row.severity,
      occurrence_count: row.occurrence_count,
      trend: row.trend,
      status: row.status
    }
  };
}

function normalizeAudit(row) {
  return {
    item_id: `audit-${row.id}`,
    item_type: 'audit',
    title: row.title || row.finding || 'Untitled audit finding',
    lifecycle_status: mapAuditLifecycle(row.status),
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
    source_ref: { table: 'audit_findings', pk: row.id },
    assigned_sd_id: row.assigned_sd_id || null,
    linked_items: null,
    priority: row.severity || null,
    metadata: {
      category: row.category,
      severity: row.severity,
      status: row.status
    }
  };
}

function normalizeSD(row) {
  return {
    item_id: `sd-${row.sd_key}`,
    item_type: 'sd',
    title: row.title || row.sd_key,
    lifecycle_status: mapSDLifecycle(row.status),
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
    source_ref: { table: 'strategic_directives_v2', pk: row.sd_key },
    assigned_sd_id: null,
    linked_items: [],
    priority: row.priority || null,
    metadata: {
      sd_key: row.sd_key,
      sd_type: row.sd_type,
      status: row.status,
      current_phase: row.current_phase,
      is_working_on: row.is_working_on,
      parent_sd_id: row.parent_sd_id,
      uuid: row.id
    }
  };
}

// ---------------------------------------------------------------------------
// Data loaders
// ---------------------------------------------------------------------------

async function loadFeedback(supabase) {
  const { data, error } = await supabase
    .from('feedback')
    .select('id, type, title, description, status, priority, category, severity, sd_id, resolution_sd_id, strategic_directive_id, rubric_score, created_at, updated_at');
  if (error) throw new Error(`Failed to load feedback: ${error.message}`);
  return data || [];
}

async function loadPatterns(supabase) {
  const { data, error } = await supabase
    .from('issue_patterns')
    .select('id, pattern_id, category, severity, issue_summary, occurrence_count, trend, status, assigned_sd_id, created_at, updated_at');
  if (error) throw new Error(`Failed to load issue_patterns: ${error.message}`);
  return data || [];
}

async function loadAuditFindings(supabase) {
  try {
    const { data, error } = await supabase
      .from('audit_findings')
      .select('id, title, finding, status, severity, category, assigned_sd_id, created_at, updated_at');
    if (error) {
      // Table may not exist — not a fatal error
      if (error.message.includes('Could not find the table') || error.code === 'PGRST204') {
        return [];
      }
      throw error;
    }
    return data || [];
  } catch {
    // Graceful degradation if table doesn't exist
    return [];
  }
}

async function loadSDs(supabase, options = {}) {
  const { includeCompleted = true, completedDaysBack = 7, excludeChildSDs = true } = options;
  const sdColumns = 'id, sd_key, title, sd_type, status, current_phase, priority, created_at, updated_at, is_working_on, parent_sd_id';

  // Load non-terminal SDs (draft, planning, in_progress)
  let activeQuery = supabase
    .from('strategic_directives_v2')
    .select(sdColumns)
    .in('status', ['draft', 'planning', 'in_progress']);
  if (excludeChildSDs) activeQuery = activeQuery.is('parent_sd_id', null);

  const { data: activeSDs, error: activeErr } = await activeQuery;
  if (activeErr) throw new Error(`Failed to load active SDs: ${activeErr.message}`);

  let completedSDs = [];
  if (includeCompleted) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - completedDaysBack);
    let completedQuery = supabase
      .from('strategic_directives_v2')
      .select(sdColumns)
      .in('status', ['completed', 'cancelled'])
      .gte('updated_at', cutoff.toISOString());
    if (excludeChildSDs) completedQuery = completedQuery.is('parent_sd_id', null);

    const { data, error } = await completedQuery;
    if (error) throw new Error(`Failed to load completed SDs: ${error.message}`);
    completedSDs = data || [];
  }

  return [...(activeSDs || []), ...completedSDs];
}

// ---------------------------------------------------------------------------
// Smart deduplication (FR-3)
// ---------------------------------------------------------------------------

function applyDeduplication(feedbackItems, patternItems, auditItems, sdItems) {
  // Build lookup: sd_key → SD item, uuid → SD item
  const sdByKey = new Map();
  const sdByUuid = new Map();
  for (const sd of sdItems) {
    sdByKey.set(sd.metadata.sd_key, sd);
    if (sd.metadata.uuid) sdByUuid.set(sd.metadata.uuid, sd);
  }

  // Resolve assigned_sd_id to an SD item (handles both sd_key and UUID)
  function findLinkedSD(assignedSdId) {
    if (!assignedSdId) return null;
    return sdByKey.get(assignedSdId) || sdByUuid.get(assignedSdId) || null;
  }

  const topLevel = [];
  const linkedCount = { feedback: 0, pattern: 0, audit: 0 };

  // Process non-SD items: link to SD or keep as top-level
  for (const item of [...feedbackItems, ...patternItems, ...auditItems]) {
    const linkedSD = findLinkedSD(item.assigned_sd_id);
    if (linkedSD) {
      linkedSD.linked_items.push({
        item_type: item.item_type,
        item_id: item.item_id,
        title: item.title,
        source_ref: item.source_ref,
        created_at: item.created_at
      });
      linkedCount[item.item_type]++;
    } else {
      topLevel.push(item);
    }
  }

  // Sort linked_items by created_at asc within each SD
  for (const sd of sdItems) {
    if (sd.linked_items.length > 0) {
      sd.linked_items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
  }

  // Add all SDs as top-level
  topLevel.push(...sdItems);

  return { topLevelItems: topLevel, linkedCount };
}

// ---------------------------------------------------------------------------
// Grouping and sorting
// ---------------------------------------------------------------------------

function groupByLifecycle(items) {
  const sections = {};
  for (const section of LIFECYCLE_SECTIONS) {
    sections[section] = [];
  }
  for (const item of items) {
    const section = sections[item.lifecycle_status];
    if (section) {
      section.push(item);
    } else {
      // Fallback to NEW for unknown lifecycle
      sections.NEW.push(item);
    }
  }
  return sections;
}

function sortItems(items) {
  return items.sort((a, b) => {
    // Primary: updated_at desc
    const dateA = new Date(a.updated_at || 0);
    const dateB = new Date(b.updated_at || 0);
    if (dateA.getTime() !== dateB.getTime()) return dateB - dateA;
    // Tie-breaker: item_type + item_id
    const keyA = `${a.item_type}-${a.item_id}`;
    const keyB = `${b.item_type}-${b.item_id}`;
    return keyA.localeCompare(keyB);
  });
}

// ---------------------------------------------------------------------------
// Main builder entry point
// ---------------------------------------------------------------------------

async function buildUnifiedInbox(supabase, options = {}) {
  const {
    includeCompleted = true,
    completedDaysBack = 7,
    excludeChildSDs = true
  } = options;

  // 1. Load all sources in parallel
  const [feedbackRows, patternRows, auditRows, sdRows] = await Promise.all([
    loadFeedback(supabase),
    loadPatterns(supabase),
    loadAuditFindings(supabase),
    loadSDs(supabase, { includeCompleted, completedDaysBack, excludeChildSDs })
  ]);

  // 2. Normalize
  const feedbackItems = feedbackRows.map(normalizeFeedback);
  const patternItems = patternRows.map(normalizePattern);
  const auditItems = auditRows.map(normalizeAudit);
  const sdItems = sdRows.map(normalizeSD);

  // 3. Smart deduplication
  const { topLevelItems, linkedCount } = applyDeduplication(
    feedbackItems, patternItems, auditItems, sdItems
  );

  // 4. Group by lifecycle
  const sections = groupByLifecycle(topLevelItems);

  // 5. Sort within each section
  for (const section of LIFECYCLE_SECTIONS) {
    sections[section] = sortItems(sections[section]);
  }

  const totalTopLevel = Object.values(sections).reduce((sum, arr) => sum + arr.length, 0);
  const totalLinked = linkedCount.feedback + linkedCount.pattern + linkedCount.audit;

  return {
    sections,
    counts: {
      total: totalTopLevel,
      by_source: {
        feedback: feedbackItems.length,
        patterns: patternItems.length,
        audit: auditItems.length,
        sds: sdItems.length
      },
      linked: totalLinked,
      by_section: Object.fromEntries(
        LIFECYCLE_SECTIONS.map(s => [s, sections[s].length])
      )
    },
    metadata: {
      generated_at: new Date().toISOString(),
      options: { includeCompleted, completedDaysBack, excludeChildSDs }
    }
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  buildUnifiedInbox,
  LIFECYCLE_SECTIONS,
  // Export internals for unit testing
  mapFeedbackLifecycle,
  mapPatternLifecycle,
  mapAuditLifecycle,
  mapSDLifecycle,
  normalizeFeedback,
  normalizePattern,
  normalizeAudit,
  normalizeSD,
  applyDeduplication,
  groupByLifecycle,
  sortItems
};
