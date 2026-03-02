/** V10: okr_driven_prioritization — SD selection driven by OKR alignment with monthly automation. */
export default {
  id: 'V10', name: 'okr_driven_prioritization',
  checks: [
    { id: 'V10-C1', label: 'OKR monthly handler automates monthly cycle',
      type: 'file_exists', weight: 25,
      params: { glob: 'lib/eva/jobs/okr-monthly-handler.js' } },
    { id: 'V10-C2', label: 'OKR monthly generator creates new OKRs',
      type: 'file_exists', weight: 25,
      params: { glob: 'lib/eva/jobs/okr-monthly-generator.js' } },
    { id: 'V10-C3', label: 'OKR alignment scoring used in SD prioritization',
      type: 'code_pattern', weight: 25,
      params: { glob: 'scripts/modules/auto-proceed/urgency-scorer.js', pattern: 'okr|alignment|priority' } },
    { id: 'V10-C4', label: 'OKR stale archival mechanism exists',
      type: 'file_exists', weight: 25,
      params: { glob: 'lib/eva/jobs/okr-archive-stale.js' } },
  ],
};
