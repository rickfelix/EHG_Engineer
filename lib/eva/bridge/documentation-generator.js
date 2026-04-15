/**
 * Documentation Generator
 * SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-C-C
 *
 * Generates README.md content from github-repo-analyzer output.
 * Produces project overview, tech stack, directory structure,
 * scripts, environment variables, and deployment notes.
 */

const FRAMEWORK_PATTERNS = {
  'Next.js': ['next', '@next/font', 'next-auth'],
  'React (Vite)': ['vite', '@vitejs/plugin-react'],
  'React (CRA)': ['react-scripts'],
  'Vue': ['vue', '@vue/cli-service'],
  'Svelte': ['svelte', '@sveltejs/kit'],
  'Express': ['express'],
  'FastAPI': ['fastapi', 'uvicorn'],
  'Remix': ['@remix-run/node'],
};

const ENV_VAR_PATTERNS = [
  { pattern: /SUPABASE_URL/i, name: 'VITE_SUPABASE_URL', description: 'Supabase project URL' },
  { pattern: /SUPABASE_ANON/i, name: 'VITE_SUPABASE_ANON_KEY', description: 'Supabase anonymous key (safe for client)' },
  { pattern: /SENTRY_DSN/i, name: 'SENTRY_DSN', description: 'Sentry error tracking DSN (server-side)' },
  { pattern: /VITE_SENTRY_DSN/i, name: 'VITE_SENTRY_DSN', description: 'Sentry DSN for Vite client-side apps' },
  { pattern: /STRIPE/i, name: 'STRIPE_SECRET_KEY', description: 'Stripe payment API key (server only)' },
  { pattern: /OPENAI/i, name: 'OPENAI_API_KEY', description: 'OpenAI API key (server only)' },
];

/**
 * Detect the primary framework from package.json dependencies.
 * @param {object} dependencies - Combined deps + devDeps
 * @returns {string} Framework name
 */
function detectFramework(dependencies) {
  if (!dependencies || typeof dependencies !== 'object') return 'Unknown';

  const allDeps = {
    ...dependencies.dependencies,
    ...dependencies.devDependencies,
  };

  for (const [framework, packages] of Object.entries(FRAMEWORK_PATTERNS)) {
    if (packages.some(pkg => pkg in allDeps)) return framework;
  }

  if ('react' in allDeps) return 'React';
  if ('typescript' in allDeps) return 'TypeScript';
  return 'JavaScript';
}

/**
 * Extract environment variables from file listing.
 * @param {string[]} files - File paths from repo
 * @returns {Array<{name: string, description: string}>}
 */
function extractEnvVars(files) {
  const vars = [];
  const seen = new Set();

  for (const { name, description } of ENV_VAR_PATTERNS) {
    if (!seen.has(name)) {
      vars.push({ name, description });
      seen.add(name);
    }
  }

  // Check for .env.example which would have actual var names
  if (files.some(f => f.endsWith('.env.example') || f.endsWith('.env.local.example'))) {
    vars.push({ name: '(see .env.example)', description: 'Additional variables defined in example file' });
  }

  return vars;
}

/**
 * Generate README markdown from repo analysis.
 *
 * @param {object} analysis - Output from github-repo-analyzer.analyzeRepo()
 * @param {object} [options]
 * @param {string} [options.projectName] - Override project name
 * @param {string} [options.description] - Project description
 * @returns {string} README markdown content
 */
export function generateReadme(analysis, options = {}) {
  const { files = [], dependencies = {}, structure = {} } = analysis || {};
  const projectName = options.projectName || dependencies.name || 'Project';
  const description = options.description || '';

  const sections = [];

  // Title
  sections.push(`# ${projectName}`);
  sections.push('');
  if (description) {
    sections.push(description);
    sections.push('');
  }

  // Tech Stack
  const framework = detectFramework(dependencies);
  const hasSupabase = !!(dependencies.dependencies?.['@supabase/supabase-js']);
  const hasTypescript = files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'));

  sections.push('## Tech Stack');
  sections.push('');
  sections.push(`- **Framework**: ${framework}`);
  sections.push(`- **Language**: ${hasTypescript ? 'TypeScript' : 'JavaScript'}`);
  if (hasSupabase) sections.push('- **Database**: Supabase');
  sections.push('');

  // Directory Structure
  if (structure.topLevelDirs?.length > 0) {
    sections.push('## Project Structure');
    sections.push('');
    sections.push('```');
    for (const dir of structure.topLevelDirs) {
      sections.push(`├── ${dir}/`);
    }
    const rootFiles = files.filter(f => !f.includes('/'));
    for (const file of rootFiles.slice(0, 5)) {
      sections.push(`├── ${file}`);
    }
    sections.push('```');
    sections.push('');
  }

  // Scripts
  if (dependencies.dependencies || dependencies.devDependencies) {
    sections.push('## Getting Started');
    sections.push('');
    sections.push('```bash');
    sections.push('npm install');
    sections.push('npm run dev');
    sections.push('```');
    sections.push('');
  }

  // Environment Variables
  const envVars = extractEnvVars(files);
  if (envVars.length > 0) {
    sections.push('## Environment Variables');
    sections.push('');
    sections.push('Create a `.env` file with:');
    sections.push('');
    sections.push('| Variable | Description |');
    sections.push('|----------|-------------|');
    for (const v of envVars) {
      sections.push(`| \`${v.name}\` | ${v.description} |`);
    }
    sections.push('');
  }

  // Stats
  sections.push('## Stats');
  sections.push('');
  sections.push(`- **Total files**: ${structure.totalFiles || files.length}`);
  if (structure.hasTests) sections.push('- **Tests**: Yes');
  sections.push('');
  sections.push('---');
  sections.push('*Auto-generated by EHG Documentation Generator*');

  return sections.join('\n');
}

export { detectFramework };
export default { generateReadme, detectFramework };
