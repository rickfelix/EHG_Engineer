// Manual invocation of the exact same canonical sequence ExecToPlanExecutor.executeSpecific()
// runs internally (autoCompleteDeliverablesForSD -> checkDeliverablesNeedCompletion ->
// autoCompleteDeliverables), for SD-LEO-FIX-IMPLEMENTATION-FIDELITY-GATE-001. Run standalone so
// the deliverables/user-stories are already promoted before the real EXEC-TO-PLAN handoff runs,
// rather than relying solely on the in-handoff side effect.
import { autoCompleteDeliverables, checkDeliverablesNeedCompletion } from '../modules/handoff/auto-complete-deliverables.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'aff34d2d-dcd7-41aa-9dc9-f70f6004c818';

async function main() {
  const needsCompletion = await checkDeliverablesNeedCompletion(SD_ID);
  console.log('needsCompletion:', JSON.stringify(needsCompletion, null, 2));
  if (needsCompletion.needed) {
    const completeResult = await autoCompleteDeliverables(SD_ID, { verifiedBy: 'EXEC' });
    console.log('completeResult:', JSON.stringify(completeResult, null, 2));
  } else {
    console.log('Deliverables already complete or verified by database trigger.');
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
