/**
 * replit-config-writer
 * SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-A (Child A / FR-3)
 * SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-A (descriptor-driven FR-3)
 *
 * Pure builder: returns the contents of the venture repo's config file.
 *
 * Dispatch on ctx.stackDescriptor (via deployTargetFamily — fail-safe to 'replit'):
 *   'replit' (absent / replit-autoscale / unknown)
 *     → `.replit` autoscale contents (DEFAULT, byte-identical to today)
 *   'cloudflare' (cloudflare-pages / cloudflare-workers)
 *     → wrangler.toml-style TOML string with optional [[d1_databases]] /
 *       [[r2_buckets]] binding stubs when the descriptor specifies them.
 *   'cloud-run'
 *     → a coherent minimal Cloud Run service-config stub (NOT a wrangler.toml).
 *
 * Pure (no DB / git / fs); the file write happens in Child B inside seedRepo().
 * NOTE: seedRepo must PRESERVE an existing `.replit`/`replit.md` if present
 * (build-into mode) — that preserve logic lives in the seeder, not here.
 */
import { deployTargetFamily } from '../../venture-deploy/stack-descriptor.js';

const DEFAULT_RUN = 'bun run dev';
const DEFAULT_PORT = 5000;

/**
 * @param {Object} ctx
 * @param {string} [ctx.runCommand] - dev run command (default `bun run dev`)
 * @param {number} [ctx.port] - local app port (default 5000)
 * @param {number} [ctx.externalPort] - external port (default 80)
 * @param {Object} [ctx.stackDescriptor] - optional stack descriptor
 * @returns {string} `.replit` or `wrangler.toml` file contents
 */
export function buildReplitConfig(ctx = {}) {
  const runCommand = (ctx.runCommand && String(ctx.runCommand).trim()) || DEFAULT_RUN;
  const port = Number.isInteger(ctx.port) && ctx.port > 0 ? ctx.port : DEFAULT_PORT;
  const externalPort =
    Number.isInteger(ctx.externalPort) && ctx.externalPort > 0 ? ctx.externalPort : 80;
  const sd = ctx.stackDescriptor || null;
  const family = deployTargetFamily(sd);

  // DEFAULT (Replit/absent/unknown — fail-safe): the current .replit autoscale contents unchanged.
  if (family === 'replit') {
    return `run = "${runCommand}"

[deployment]
run = ["sh", "-c", "${runCommand}"]
deploymentTarget = "autoscale"

[[ports]]
localPort = ${port}
externalPort = ${externalPort}
`;
  }

  // F1 — cloud-run: emit a coherent minimal Cloud Run service-config stub, NOT a
  // meaningless bare wrangler.toml. The image + DATABASE_URL are set at deploy time
  // by sibling D (publish); region is a placeholder here.
  if (family === 'cloud-run') {
    const region = (sd && typeof sd.region === 'string' && sd.region.trim()) || 'REPLACE_WITH_REGION';
    return `# Cloud Run service config (SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-A)
# Minimal stub — the container image and DATABASE_URL are set at deploy time by
# the publish step (sibling D). Region below is a placeholder.
service: venture-app
region: ${region}
# image: set at deploy time (sibling D)
# DATABASE_URL: set at deploy time (sibling D)
`;
  }

  // 'cloudflare' path: emit a wrangler.toml-style config string.
  const deploymentTarget = sd.deployment_target;
  const isPages = deploymentTarget === 'cloudflare-pages';
  const isWorkers = deploymentTarget === 'cloudflare-workers';

  const COMPAT_DATE = '2024-01-01';

  let toml = `name = "venture-app"
compatibility_date = "${COMPAT_DATE}"
`;

  if (isPages) {
    toml += `pages_build_output_dir = "dist"
`;
  } else if (isWorkers) {
    toml += `main = "src/worker.js"
`;
  }

  // [[d1_databases]] binding stub when db_provider === 'd1'
  if (sd.db_provider === 'd1') {
    toml += `
[[d1_databases]]
binding = "DB"
database_name = "venture-db"
database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"
`;
  }

  // [[r2_buckets]] stub when storage === 'r2'
  if (sd.storage === 'r2') {
    toml += `
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "venture-assets"
`;
  }

  return toml;
}

export default buildReplitConfig;
