// .claude/hooks/pre-tool-goal-context.cjs
// Sibling B FR-B-3: PreToolUse additionalContext injector for /goal advisory.
// Cache-stable; advisory-only; NEVER mutates toolInput; NEVER blocks tool execution.

const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob']);
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

function makeCacheKey(sdId, vocabVersion, promptHash) {
  return `${sdId || 'no-sd'}|${vocabVersion || '0'}|${promptHash || '0'}`;
}

function hashString(s) {
  // Simple FNV-1a (no crypto in hook context to keep imports light).
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

async function handler(arg) {
  try {
    const { toolName, toolInput } = arg || {};
    if (!toolName || READ_ONLY_TOOLS.has(toolName)) return {};

    const sdId = process.env.CLAUDE_SESSION_ID || null;
    if (!sdId) return {};

    const argStr = JSON.stringify(toolInput || {});
    const promptHash = hashString(argStr);
    const vocabVersion = process.env.BRAINSTORM_VOCAB_VERSION || '1.0.0';
    const key = makeCacheKey(sdId, vocabVersion, promptHash);

    const cached = cache.get(key);
    const now = Date.now();
    if (cached && (now - cached.at) < CACHE_TTL_MS) {
      return { additionalContext: cached.context };
    }

    const context = `[/goal advisory] tool=${toolName} sd=${sdId.slice(0, 8)} vocab=v${vocabVersion} (cached_60s)`;
    cache.set(key, { at: now, context });
    return { additionalContext: context };
  } catch (e) {
    // Hook NEVER throws — return empty context on any error (advisory-only).
    return {};
  }
}

module.exports = handler;
module.exports.handler = handler;
module.exports._clearCache = () => cache.clear();
