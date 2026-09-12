import dotenv from 'dotenv';
dotenv.config({ quiet: true });
import { resolveSubAgentRepo } from '../lib/sub-agents/resolve-repo.js';
const a = await resolveSubAgentRepo({ subAgentCode: 'VALIDATION', sdId: 'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001' });
console.log('VALIDATION:', JSON.stringify(a, null, 1));
const b = await resolveSubAgentRepo({ subAgentCode: 'TESTING', sdId: 'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001' });
console.log('TESTING:', JSON.stringify(b, null, 1));
