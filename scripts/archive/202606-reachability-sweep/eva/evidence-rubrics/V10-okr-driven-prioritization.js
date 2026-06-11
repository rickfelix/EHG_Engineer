/** V10: okr_driven_prioritization — SD selection driven by OKR alignment with monthly automation. */
export default {
  id: 'V10', name: 'okr_driven_prioritization',
  checks: [
    { id: 'V10-C1', label: 'OKR monthly handler exports runOkrMonthlySnapshot',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/jobs/okr-monthly-handler.js', exportName: 'runOkrMonthlySnapshot' } },
    { id: 'V10-C2', label: 'OKR monthly generator exports runOkrMonthlyGeneration',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/jobs/okr-monthly-generator.js', exportName: 'runOkrMonthlyGeneration' } },
    { id: 'V10-C3', label: 'OKR hard tier integrated into urgency scoring',
      type: 'export_exists', weight: 25,
      params: { module: 'scripts/modules/auto-proceed/urgency-scorer.js', exportName: 'getOkrHardTier' } },
    { id: 'V10-C4', label: 'OKR stale archival exports archiveStaleOkrs',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/jobs/okr-archive-stale.js', exportName: 'archiveStaleOkrs' } },
  ],
};
