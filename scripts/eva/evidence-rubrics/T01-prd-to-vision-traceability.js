/** T01: prd_to_vision_traceability — PRDs reference vision dimensions for governance alignment. */
export default {
  id: 'T01', name: 'prd_to_vision_traceability',
  checks: [
    { id: 'T01-C1', label: 'HEAL scoring module references vision traceability',
      type: 'code_pattern', weight: 25,
      params: { glob: 'scripts/eva/vision-evidence-scorer.js', pattern: 'traceability|vision_alignment|prd.*vision' } },
    { id: 'T01-C2', label: 'EVA vision documents have extracted_dimensions',
      type: 'db_row_exists', weight: 25,
      params: { table: 'eva_vision_documents', filter: [{ column: 'extracted_dimensions', op: 'not.is', value: null }] } },
    { id: 'T01-C3', label: 'Artifact persistence service tracks vision_key on artifacts',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/eva/artifact-persistence-service.js', pattern: 'supports_vision_key' } },
    { id: 'T01-C4', label: 'Stage execution engine resolves EVA keys for stages 1-15',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/stage-execution-engine.js', exportName: 'resolveEvaKeys' } },
  ],
};
