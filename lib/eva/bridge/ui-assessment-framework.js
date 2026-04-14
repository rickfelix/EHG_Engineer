/**
 * UI Assessment Framework
 * SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-B-C
 *
 * Evaluates the UI structure of Replit-built venture apps by analyzing
 * the repository file listing from github-repo-analyzer. Produces a
 * weighted quality score (0-100) and human-readable findings for
 * chairman gate decisions at S21.
 */

const UI_CATEGORIES = {
  landingPage: {
    weight: 25,
    patterns: [
      /^src\/(pages|app)\/(index|home|landing)\.(jsx?|tsx?)$/i,
      /^src\/components\/(Hero|Landing|Home)/i,
      /^(pages|app)\/(index|home|page)\.(jsx?|tsx?)$/i,
    ],
    label: 'Landing Page',
  },
  navigation: {
    weight: 20,
    patterns: [
      /^src\/components\/(Nav|Header|Sidebar|Menu|Layout)/i,
      /^src\/(layout|navigation)\//i,
      /\/(router|routes|routing)\.(jsx?|tsx?)$/i,
    ],
    label: 'Navigation & Routing',
  },
  forms: {
    weight: 20,
    patterns: [
      /^src\/components\/(Form|Input|Login|Signup|Auth|Register)/i,
      /\/(form|input|auth)\.(jsx?|tsx?)$/i,
      /\/hooks\/use(Form|Auth|Input)/i,
    ],
    label: 'Forms & Input',
  },
  responsive: {
    weight: 15,
    patterns: [
      /tailwind\.config/i,
      /globals?\.(css|scss|less)$/i,
      /\/styles\//i,
      /postcss\.config/i,
      /\.css$/i,
    ],
    label: 'Responsive Layout & Styles',
  },
  assets: {
    weight: 20,
    patterns: [
      /^(public|static)\/(images?|img|icons?|assets)/i,
      /\.(png|jpg|jpeg|svg|ico|webp)$/i,
      /favicon/i,
      /^(public|static)\//i,
    ],
    label: 'Static Assets',
  },
};

/**
 * Assess the UI quality of a repository based on its file listing.
 *
 * @param {string[]} files - Array of file paths from github-repo-analyzer
 * @param {object} [structure] - Optional structure summary from github-repo-analyzer
 * @returns {{score: number, findings: object[], categories: object, summary: string}}
 */
export function assessUI(files, structure = {}) {
  if (!files || files.length === 0) {
    return {
      score: 0,
      findings: [{ category: 'general', status: 'missing', message: 'No files found in repository' }],
      categories: {},
      summary: 'Empty repository — no UI assessment possible.',
    };
  }

  const categories = {};
  const findings = [];
  let totalScore = 0;

  for (const [key, config] of Object.entries(UI_CATEGORIES)) {
    const matchingFiles = files.filter(f =>
      config.patterns.some(p => p.test(f))
    );

    const present = matchingFiles.length > 0;
    const categoryScore = present ? config.weight : 0;
    totalScore += categoryScore;

    categories[key] = {
      label: config.label,
      present,
      matchCount: matchingFiles.length,
      weight: config.weight,
      score: categoryScore,
      sampleFiles: matchingFiles.slice(0, 3),
    };

    findings.push({
      category: config.label,
      status: present ? 'present' : 'missing',
      message: present
        ? `Found ${matchingFiles.length} file(s) matching ${config.label} patterns`
        : `No ${config.label} components detected`,
      files: matchingFiles.slice(0, 3),
    });
  }

  const presentCount = Object.values(categories).filter(c => c.present).length;
  const totalCount = Object.keys(categories).length;

  const summary = `UI Assessment: ${totalScore}/100 — ${presentCount}/${totalCount} categories present. ${
    totalScore >= 80 ? 'Strong UI structure.' :
    totalScore >= 50 ? 'Partial UI — some categories missing.' :
    'Weak UI structure — multiple categories missing.'
  }`;

  return { score: totalScore, findings, categories, summary };
}

export default { assessUI };
