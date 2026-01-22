/**
 * Genesis Oath v3.1 SD Data Module
 *
 * Exports all SD data for the Genesis v3.1 Simulation Chamber implementation.
 * Used by create-genesis-v31-sds.js
 */

export {
  parentSD,
  masonSD,
  dreamcatcherSD,
  mirrorSD,
  ritualSD
} from './sd-definitions.js';

export {
  masonP1,
  masonP2,
  masonP3,
  dreamP1,
  dreamP2,
  dreamP3,
  mirrorInt,
  mirrorElev,
  mirrorTest
} from './phase-definitions.js';

/**
 * Insertion order respecting parent-child hierarchy
 */
export const INSERTION_ORDER = [
  'parent',
  'mason',
  'dreamcatcher',
  'mirror',
  'ritual',
  'masonP1',
  'masonP2',
  'masonP3',
  'dreamP1',
  'dreamP2',
  'dreamP3',
  'mirrorInt',
  'mirrorElev',
  'mirrorTest'
];

/**
 * Get all SDs keyed by insertion order key
 * @returns {Object}
 */
export function getAllSDs() {
  const { parentSD, masonSD, dreamcatcherSD, mirrorSD, ritualSD } = require('./sd-definitions.js');
  const { masonP1, masonP2, masonP3, dreamP1, dreamP2, dreamP3, mirrorInt, mirrorElev, mirrorTest } = require('./phase-definitions.js');

  return {
    parent: parentSD,
    mason: masonSD,
    dreamcatcher: dreamcatcherSD,
    mirror: mirrorSD,
    ritual: ritualSD,
    masonP1,
    masonP2,
    masonP3,
    dreamP1,
    dreamP2,
    dreamP3,
    mirrorInt,
    mirrorElev,
    mirrorTest
  };
}
