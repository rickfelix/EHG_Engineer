-- v2-based payload for PRD generation
-- Points to existing strategic_directives_v2 and sd_backlog_map tables
-- Created: 2025-01-10

CREATE OR REPLACE VIEW v_prd_sd_payload AS
SELECT
  sd.id                  AS sd_id,
  sd.sequence_rank,
  sd.title               AS sd_title,
  sd.category            AS page_category,
  sd.metadata->>'page_title' AS page_title,  -- Extract from metadata
  sd.rolled_triage,
  (SELECT COUNT(*) FROM sd_backlog_map m WHERE m.sd_id = sd.id AND m.present_in_latest_import = true) AS total_items,
  sd.h_count, 
  sd.m_count, 
  sd.l_count, 
  sd.future_count,
  sd.must_have_count, 
  sd.wish_list_count, 
  sd.must_have_pct,
  sd.readiness, 
  sd.must_have_density, 
  sd.new_module_pct,
  sd.import_run_id,
  sd.metadata AS sd_extras,
  COALESCE(
    json_agg(
      jsonb_build_object(
        'backlog_id',       m.backlog_id,
        'backlog_title',    m.backlog_title,
        'description_raw',  m.description_raw,
        'item_description', m.item_description,
        'my_comments',      m.my_comments,
        'priority',         m.priority,
        'stage_number',     m.stage_number,
        'phase',            m.phase,
        'new_module',       m.new_module,
        'extras',           m.extras
      )
      ORDER BY m.stage_number NULLS LAST, m.backlog_id
    ) FILTER (WHERE m.backlog_id IS NOT NULL),
    '[]'::json
  ) AS items
FROM strategic_directives_v2 sd
LEFT JOIN sd_backlog_map m ON m.sd_id = sd.id AND m.present_in_latest_import = true
WHERE sd.present_in_latest_import = true
GROUP BY sd.id;

-- Grant permissions
GRANT SELECT ON v_prd_sd_payload TO authenticated;