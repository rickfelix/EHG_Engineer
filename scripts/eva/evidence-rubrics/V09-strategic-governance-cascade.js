/** V09: strategic_governance_cascade — Mission->Constitution->Vision->Strategy->OKRs->SDs hierarchy enforced. */
export default {
  id: 'V09', name: 'strategic_governance_cascade',
  checks: [
    { id: 'V09-C1', label: 'Cascade validator with multi-layer check exists',
      type: 'code_pattern', weight: 25,
      params: { glob: 'scripts/modules/governance/cascade-validator.js', pattern: 'validate|cascade|layer' } },
    { id: 'V09-C2', label: 'aegis_constitutions table has records',
      type: 'db_row_exists', weight: 20,
      params: { table: 'aegis_constitutions' } },
    { id: 'V09-C3', label: 'eva_vision_documents and eva_architecture_plans have records',
      type: 'db_row_exists', weight: 20,
      params: { table: 'eva_vision_documents' } },
    { id: 'V09-C4', label: 'Cascade validation produces blocking failures on violation',
      type: 'code_pattern', weight: 20,
      params: { glob: 'scripts/modules/governance/cascade-validator.js', pattern: 'throw|reject|block|fail' } },
    { id: 'V09-C5', label: 'Cascade invalidation engine propagates changes',
      type: 'file_exists', weight: 15,
      params: { glob: 'scripts/modules/governance/cascade-invalidation-engine.js' } },
  ],
};
