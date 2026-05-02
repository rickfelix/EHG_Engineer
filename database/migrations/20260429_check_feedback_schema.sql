-- Schema introspection only (read-only, no writes)
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'feedback'
   AND column_name IN ('id','status','category','resolution_notes','resolved_at','metadata')
 ORDER BY column_name;

SELECT
  (SELECT COUNT(*) FROM feedback WHERE category = 'harness_backlog' AND status = 'new')      AS pre_new,
  (SELECT COUNT(*) FROM feedback WHERE category = 'harness_backlog' AND status = 'resolved') AS pre_resolved,
  (SELECT COUNT(*) FROM feedback WHERE id IN (
     '09b016f6-890e-41d9-8ea5-d7f2757eec90',
     '5ed830dc-3391-41aa-a062-2349a5e34458',
     '94ea026d-3f61-40c5-8a49-30ea573962c1',
     '7ed38d85-050f-4791-8f26-7cdba409cf30',
     'ce6dd11b-b45b-4b94-af69-6078372137ff',
     'b1bb1c07-4118-4f45-9374-222a85adcf0a',
     'e51fe945-8775-4235-9e03-8d2bf56cc238'
   )) AS target_rows_found;
