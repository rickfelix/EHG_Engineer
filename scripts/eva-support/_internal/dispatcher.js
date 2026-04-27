/**
 * Flow dispatcher.
 * SD: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A
 *
 * Routes a classified subtask to the matching sub-flow module.
 * Single import surface for the slash command.
 */

import research from '../research.js';
import decision from '../decision.js';
import draft from '../draft.js';
import actionPrep from '../action-prep.js';
import platform from '../platform.js';
import pureHuman from '../pure-human.js';

export const FLOW_HANDLERS = {
  research,
  decision,
  draft,
  action_prep: actionPrep,
  platform,
  pure_human: pureHuman,
};

export function getHandler(flow) {
  const handler = FLOW_HANDLERS[flow];
  if (!handler) throw new Error(`Unknown flow: ${flow}`);
  return handler;
}

export async function dispatch(flow, subtask, options = {}) {
  return getHandler(flow)(subtask, options);
}

export default { dispatch, getHandler, FLOW_HANDLERS };
