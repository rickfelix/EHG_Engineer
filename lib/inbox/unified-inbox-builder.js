/**
 * Unified Inbox Builder
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-D
 *
 * Aggregates feedback, issue_patterns, audit_findings, SDs, and quick_fixes
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

function mapIntakeLifecycle(status, feedbackId) {
  if (status === 'archived') return 'COMPLETED';
  if (feedbackId) return 'PENDING_SDS';
  return 'NEW';
}

function mapQuickFixLifecycle(status) {
  switch (status) {
    case 'open': return 'NEW';
    case 'in_progress': return 'IN_PROGRESS';
    case 'escalated': return 'PENDING_SDS';
    case 'completed':
    case 'cancelled':
    case 'closed': return 'COMPLETED';
    default: return 'NEW';
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

function normalizeQuickFix(row) {
  return {
    item_id: `qf-${row.id}`,
    item_type: 'quick_fix',
    title: row.title || row.id,
    lifecycle_status: mapQuickFixLifecycle(row.status),
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
    source_ref: { table: 'quick_fixes', pk: row.id },
    assigned_sd_id: row.escalated_to_sd_id || null,
    linked_items: null,
    priority: row.severity || null,
    metadata: {
      status: row.status,
      severity: row.severity,
      tier: row.tier,
      estimated_loc: row.estimated_loc,
      actual_loc: row.actual_loc,
      claiming_session_id: row.claiming_session_id,
      target_application: row.target_application,
      escalated_to_sd_id: row.escalated_to_sd_id
    }
  };
}

function normalizeIntake(row) {
  return {
    item_id: `intake-${row.id}`,
    item_type: 'intake',
    title: row.title || (row.description ? row.description.substring(0, 80) : 'Untitled intake'),
    lifecycle_status: mapIntakeLifecycle(row.status, row.feedback_id),
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
    source_ref: { table: row._source_table, pk: row.id },
    assigned_sd_id: null,
    linked_items: null,
    priority: null,
    metadata: {
      target_application: row.target_application || null,
      target_aspects: row.target_aspects || null,
      chairman_intent: row.chairman_intent || null,
      classification_confidence: row.classification_confidence || null,
      source_table: row._source_table,
      extracted_youtube_id: row.extracted_youtube_id || null
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

async function loadIntake(supabase) {
  const columns = 'id, title, description, status, feedback_id, target_application, target_aspects, chairman_intent, classification_confidence, extracted_youtube_id, created_at, updated_at';
  const youtubeColumns = 'id, title, description, status, feedback_id, target_application, target_aspects, chairman_intent, classification_confidence, created_at, updated_at';

  const [todoistResult, youtubeResult] = await Promise.all([
    supabase.from('eva_todoist_intake').select(columns).not('target_application', 'is', null),
    supabase.from('eva_youtube_intake').select(youtubeColumns).not('target_application', 'is', null)
  ]);

  if (todoistResult.error) throw new Error(`Failed to load eva_todoist_intake: ${todoistResult.error.message}`);
  if (youtubeResult.error) throw new Error(`Failed to load eva_youtube_intake: ${youtubeResult.error.message}`);

  const todoistRows = (todoistResult.data || []).map(r => ({ ...r, _source_table: 'eva_todoist_intake' }));
  const youtubeRows = (youtubeResult.data || []).map(r => ({ ...r, _source_table: 'eva_youtube_intake' }));

  return [...todoistRows, ...youtubeRows];
}

async function loadQuickFixes(supabase) {
  try {
    const { data, error } = await supabase
      .from('quick_fixes')
      .select('id, title, status, severity, tier, estimated_loc, actual_loc, claiming_session_id, target_application, escalated_to_sd_id, created_at, updated_at');
    if (error) {
      if (error.message.includes('Could not find the table') || error.code === 'PGRST204') {
        return [];
      }
      throw error;
    }
    return data || [];
  } catch {
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

/**
 * Cross-link dedup: Todoist items with extracted_youtube_id nest matching YouTube items.
 * Standalone YouTube items (no cross-ref) remain as top-level.
 */
function normalizeAndDedupIntake(intakeItems) {
  const todoistItems = intakeItems.filter(i => i.source_ref.table === 'eva_todoist_intake');
  const youtubeItems = intakeItems.filter(i => i.source_ref.table === 'eva_youtube_intake');

  // Build lookup: youtube video id → youtube intake item
  const youtubeById = new Map();
  for (const yt of youtubeItems) {
    youtubeById.set(yt.source_ref.pk, yt);
  }

  const linkedYoutubeIds = new Set();

  // Link Todoist items to their YouTube cross-refs
  for (const todoist of todoistItems) {
    const ytId = todoist.metadata.extracted_youtube_id;
    if (ytId) {
      // Find YouTube intake row by matching extracted_youtube_id to youtube item ids
      for (const [pk, ytItem] of youtubeById) {
        // Match by checking if the youtube_video_id or id corresponds
        if (pk === ytId || ytItem.item_id === `intake-${ytId}`) {
          todoist.linked_items = todoist.linked_items || [];
          todoist.linked_items.push({
            item_type: 'intake',
            item_id: ytItem.item_id,
            title: ytItem.title,
            source_ref: ytItem.source_ref,
            created_at: ytItem.created_at
          });
          linkedYoutubeIds.add(pk);
        }
      }
    }
  }

  // Standalone YouTube items (not cross-linked)
  const standaloneYoutube = youtubeItems.filter(yt => !linkedYoutubeIds.has(yt.source_ref.pk));

  return [...todoistItems, ...standaloneYoutube];
}

function applyDeduplication(feedbackItems, patternItems, auditItems, sdItems, intakeItems = []) {
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
  const linkedCount = { feedback: 0, pattern: 0, audit: 0, intake: 0, quick_fix: 0 };

  // Process non-SD items: link to SD or keep as top-level
  for (const item of [...feedbackItems, ...patternItems, ...auditItems, ...intakeItems]) {
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
  const [feedbackRows, patternRows, auditRows, sdRows, intakeRows, quickFixRows] = await Promise.all([
    loadFeedback(supabase),
    loadPatterns(supabase),
    loadAuditFindings(supabase),
    loadSDs(supabase, { includeCompleted, completedDaysBack, excludeChildSDs }),
    loadIntake(supabase),
    loadQuickFixes(supabase)
  ]);

  // 2. Normalize
  const feedbackItems = feedbackRows.map(normalizeFeedback);
  const patternItems = patternRows.map(normalizePattern);
  const auditItems = auditRows.map(normalizeAudit);
  const sdItems = sdRows.map(normalizeSD);
  const intakeItems = normalizeAndDedupIntake(intakeRows.map(normalizeIntake));
  const quickFixItems = quickFixRows.map(normalizeQuickFix);

  // 3. Smart deduplication
  const { topLevelItems, linkedCount } = applyDeduplication(
    feedbackItems, patternItems, auditItems, sdItems, [...intakeItems, ...quickFixItems]
  );

  // 4. Group by lifecycle
  const sections = groupByLifecycle(topLevelItems);

  // 5. Sort within each section
  for (const section of LIFECYCLE_SECTIONS) {
    sections[section] = sortItems(sections[section]);
  }

  const totalTopLevel = Object.values(sections).reduce((sum, arr) => sum + arr.length, 0);
  const totalLinked = linkedCount.feedback + linkedCount.pattern + linkedCount.audit + linkedCount.intake + (linkedCount.quick_fix || 0);

  return {
    sections,
    counts: {
      total: totalTopLevel,
      by_source: {
        feedback: feedbackItems.length,
        patterns: patternItems.length,
        audit: auditItems.length,
        sds: sdItems.length,
        intake: intakeItems.length,
        quick_fixes: quickFixItems.length
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
  mapIntakeLifecycle,
  mapQuickFixLifecycle,
  normalizeFeedback,
  normalizePattern,
  normalizeAudit,
  normalizeSD,
  normalizeIntake,
  normalizeQuickFix,
  normalizeAndDedupIntake,
  loadIntake,
  loadQuickFixes,
  applyDeduplication,
  groupByLifecycle,
  sortItems
};
