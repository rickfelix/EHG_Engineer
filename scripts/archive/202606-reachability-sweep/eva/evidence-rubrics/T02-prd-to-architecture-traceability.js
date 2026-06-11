/** T02: prd_to_architecture_traceability — PRDs reference architecture decisions/ADRs for structural coherence. */
export default {
  id: 'T02', name: 'prd_to_architecture_traceability',
  checks: [
    { id: 'T02-C1', label: 'Architecture plans have extracted_dimensions',
      type: 'db_row_exists', weight: 25,
      params: { table: 'eva_architecture_plans', filter: [{ column: 'extracted_dimensions', op: 'not.is', value: null }] } },
    { id: 'T02-C2', label: 'Artifact persistence tracks plan_key on artifacts',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/eva/artifact-persistence-service.js', pattern: 'supports_plan_key' } },
    { id: 'T02-C3', label: 'ADR extractor integrates with artifact persistence',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/eva/artifact-persistence-service.js', pattern: 'persistADRs|extractedADRs|adr_ids' } },
    { id: 'T02-C4', label: 'Architecture upsert validates vision_key linkage',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/eva/archplan-upsert.js', pattern: 'visionKey|vision_key' } },
  ],
};
