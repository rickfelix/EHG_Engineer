/** All 14 MAST-derived broken-organization fixture builders (SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001, FR-2). */
import { buildBrokenFixture as fm11 } from './fm-1-1.mjs';
import { buildBrokenFixture as fm12 } from './fm-1-2.mjs';
import { buildBrokenFixture as fm13 } from './fm-1-3.mjs';
import { buildBrokenFixture as fm14 } from './fm-1-4.mjs';
import { buildBrokenFixture as fm15 } from './fm-1-5.mjs';
import { buildBrokenFixture as fm21 } from './fm-2-1.mjs';
import { buildBrokenFixture as fm22 } from './fm-2-2.mjs';
import { buildBrokenFixture as fm23 } from './fm-2-3.mjs';
import { buildBrokenFixture as fm24 } from './fm-2-4.mjs';
import { buildBrokenFixture as fm25 } from './fm-2-5.mjs';
import { buildBrokenFixture as fm26 } from './fm-2-6.mjs';
import { buildBrokenFixture as fm31 } from './fm-3-1.mjs';
import { buildBrokenFixture as fm32 } from './fm-3-2.mjs';
import { buildBrokenFixture as fm33 } from './fm-3-3.mjs';

export const MAST_FIXTURES = {
  'fm-1-1': fm11, 'fm-1-2': fm12, 'fm-1-3': fm13, 'fm-1-4': fm14, 'fm-1-5': fm15,
  'fm-2-1': fm21, 'fm-2-2': fm22, 'fm-2-3': fm23, 'fm-2-4': fm24, 'fm-2-5': fm25, 'fm-2-6': fm26,
  'fm-3-1': fm31, 'fm-3-2': fm32, 'fm-3-3': fm33,
};
