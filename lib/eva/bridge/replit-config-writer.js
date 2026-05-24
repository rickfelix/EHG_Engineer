/**
 * replit-config-writer
 * SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-A (Child A / FR-3)
 *
 * Pure builder: returns the contents of the venture repo's `.replit` — the
 * minimal Replit HOSTING run-config (how Replit RUNS the app), NOT Agent build
 * context. Matches the proven contribution-hub config: `bun run dev` on port
 * 5000, autoscale deployment.
 *
 * Pure (no DB / git / fs); the file write happens in Child B inside seedRepo().
 * NOTE: seedRepo must PRESERVE an existing `.replit`/`replit.md` if present
 * (build-into mode) — that preserve logic lives in the seeder, not here.
 */

const DEFAULT_RUN = 'bun run dev';
const DEFAULT_PORT = 5000;

/**
 * @param {Object} ctx
 * @param {string} [ctx.runCommand] - dev run command (default `bun run dev`)
 * @param {number} [ctx.port] - local app port (default 5000)
 * @param {number} [ctx.externalPort] - external port (default 80)
 * @returns {string} `.replit` file contents
 */
export function buildReplitConfig(ctx = {}) {
  const runCommand = (ctx.runCommand && String(ctx.runCommand).trim()) || DEFAULT_RUN;
  const port = Number.isInteger(ctx.port) && ctx.port > 0 ? ctx.port : DEFAULT_PORT;
  const externalPort =
    Number.isInteger(ctx.externalPort) && ctx.externalPort > 0 ? ctx.externalPort : 80;

  return `run = "${runCommand}"

[deployment]
run = ["sh", "-c", "${runCommand}"]
deploymentTarget = "autoscale"

[[ports]]
localPort = ${port}
externalPort = ${externalPort}
`;
}

export default buildReplitConfig;
