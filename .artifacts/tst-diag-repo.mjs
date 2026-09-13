import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { resolveSubAgentRepo, applySubAgentRepoVerdict, toCanonicalRepoPath } from '../lib/sub-agents/resolve-repo.js';
const r = await resolveSubAgentRepo({ sdId: 'fbbf9a6d-e079-4c22-9189-88336aae9a16', subAgentCode: 'TESTING' });
console.log('resolution:', JSON.stringify(r, null, 2));
console.log('canonical:', toCanonicalRepoPath(r.repoPath));
const t = { verdict:'FAIL', metadata:{} };
applySubAgentRepoVerdict(t, r);
console.log('applied metadata:', JSON.stringify(t.metadata, null, 2));
