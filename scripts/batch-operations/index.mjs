/**
 * Batch Operations Registry
 * Central manifest of all available batch operations.
 */

import acceptHandoffs from './accept-handoffs.mjs';
import rescore from './rescore.mjs';
import completeChildren from './complete-children.mjs';
import updateRefs from './update-refs.mjs';
import testSds from './test-sds.mjs';
import simplifyAll from './simplify-all.mjs';

const operations = new Map();
operations.set(acceptHandoffs.key, acceptHandoffs);
operations.set(rescore.key, rescore);
operations.set(completeChildren.key, completeChildren);
operations.set(updateRefs.key, updateRefs);
operations.set(testSds.key, testSds);
operations.set(simplifyAll.key, simplifyAll);

export default operations;
