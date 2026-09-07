/**
 * A minimal Supabase-shaped mock for testing safeQuery/safeCount call sites.
 * Each `.from(...)` call returns a thenable query-builder chain; every chain method
 * (select/eq/in/or/gte/order/limit/single) returns itself, and awaiting the chain pops the
 * next `{ data, error }` or `{ count, error }` result off a shared, ordered queue — matching
 * real call order regardless of table name.
 *
 * Used by SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001's FR-2 behavioural tests: a queued
 * `{ data: null, error: { message: 'boom' } }` (or `{ count: null, error: null }`) forces
 * safeQuery/safeCount to throw exactly as a genuinely broken query would.
 */
export function createQueuedSupabaseMock(resultsQueue) {
  let idx = 0;
  const chain = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    in: () => chain,
    or: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: () => chain,
    single: () => chain,
    insert: () => Promise.resolve({ data: null, error: null }),
    then: (resolve, reject) => {
      if (idx >= resultsQueue.length) {
        return Promise.reject(new Error(`createQueuedSupabaseMock: no queued result for call #${idx + 1}`)).then(resolve, reject);
      }
      return Promise.resolve(resultsQueue[idx++]).then(resolve, reject);
    },
  };
  return { from: () => chain };
}
