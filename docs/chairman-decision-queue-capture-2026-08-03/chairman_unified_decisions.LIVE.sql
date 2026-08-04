 SELECT id,
    decision_type,
    title,
    priority,
    status,
    venture_id,
    stage,
    gate_type,
    recommendation,
    response_deadline,
    created_at,
    decided_at,
    decided_by,
    requestor_name,
    venture_name,
    details,
    blocking
   FROM chairman_all_decision_signals
  WHERE (details ->> 'source_decision_type'::text) IS DISTINCT FROM 'session_question'::text AND NOT (decision_type = 'flag_review'::text AND (COALESCE(details ->> 'category'::text, ''::text) = ANY (ARRAY['harness_backlog'::text, 'fleet_dormancy'::text, 'process_enforcement'::text]))) AND (venture_id IS NULL OR NOT (venture_id IN ( SELECT ventures.id
           FROM ventures
          WHERE COALESCE(ventures.is_demo, false) = true OR ventures.name::text ~ '^(__e2e_|__citest_|canonical-source-test-|Test Venture for)'::text)));