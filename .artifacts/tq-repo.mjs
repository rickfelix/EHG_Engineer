import { resolveSubAgentRepo } from '../lib/sub-agents/resolve-repo.js';
const r = await resolveSubAgentRepo({ subAgentCode: 'TESTING', sdId: 'fbbf9a6d-e079-4c22-9189-88336aae9a16' });
console.log(JSON.stringify(r, null, 2));
