/**
 * Batch Operations Registry
 * Central manifest of all available batch operations.
 */

import acceptHandoffs from './accept-handoffs.mjs';
import rescore from './rescore.mjs';
import completeChildren from './complete-children.mjs';

const operations = new Map();
operations.set(acceptHandoffs.key, acceptHandoffs);
operations.set(rescore.key, rescore);
operations.set(completeChildren.key, completeChildren);

export default operations;
