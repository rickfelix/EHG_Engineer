/**
 * Pure diff between a freshly-fetched Gemini model catalog and the committed
 * known-models store (SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-I).
 */

/**
 * @param {Array<{id: string}>} fetched
 * @param {Array<{id: string}>} known
 * @returns {{ newModels: Array, changedModels: Array }}
 */
export function diffModels(fetched = [], known = []) {
  const knownById = new Map(known.map((m) => [m.id, m]));
  const newModels = [];
  const changedModels = [];
  for (const model of fetched) {
    const prior = knownById.get(model.id);
    if (!prior) {
      newModels.push(model);
    } else if (prior.description !== model.description || prior.displayName !== model.displayName) {
      changedModels.push({ ...model, priorDescription: prior.description, priorDisplayName: prior.displayName });
    }
  }
  return { newModels, changedModels };
}
