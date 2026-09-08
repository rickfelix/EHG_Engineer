import { autoCompleteDeliverables } from '../modules/handoff/auto-complete-deliverables.js';

const SD_ID = 'bfe8dacf-f689-41dc-b62f-f67ea8c50c54'; // SD-LEO-FIX-GOVERNANCE-AUDIT-LOG-001

const result = await autoCompleteDeliverables(SD_ID, { verifiedBy: 'EXEC' });
console.log(JSON.stringify(result, null, 2));
process.exit(result.success ? 0 : 1);
