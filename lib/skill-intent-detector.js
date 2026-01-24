/**
 * Skill Intent Detector
 *
 * Detects when user messages should trigger skill invocations.
 * Uses semantic similarity to match user intent to skill commands.
 *
 * Part of SD-LEO-INFRA-SEMANTIC-ROUTING-001
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const EMBEDDING_MODEL = 'text-embedding-3-small';
const SIMILARITY_THRESHOLD = 0.45; // Higher threshold for skill matching

/**
 * Skill trigger patterns with semantic descriptions
 */
const SKILL_PATTERNS = {
  'leo create': {
    name: '/leo create',
    description: 'Create a new Strategic Directive',
    patterns: [
      'create an SD',
      'create a strategic directive',
      'new SD',
      'new directive',
      'make this an SD',
      'turn this into an SD',
      'yes create the SD',
      'yes create it',
      'go ahead and create',
      'sure create it',
      'track this as an SD',
      'add this to the queue'
    ]
  },
  'ship': {
    name: '/ship',
    description: 'Commit changes and create a pull request',
    patterns: [
      'commit this',
      'create PR',
      'ship it',
      'lets ship',
      'push this',
      'merge this',
      'ready to ship',
      'create a pull request',
      'commit and push'
    ]
  },
  'learn': {
    name: '/learn',
    description: 'Capture learnings and patterns from this session',
    patterns: [
      'capture this pattern',
      'we should learn from this',
      'add this as a learning',
      'remember this for next time',
      'this is a recurring issue'
    ]
  },
  'document': {
    name: '/document',
    description: 'Update documentation for changes made',
    patterns: [
      'document this',
      'update the docs',
      'add documentation',
      'we should document this',
      'this needs documentation'
    ]
  },
  'restart': {
    name: '/restart',
    description: 'Restart all LEO stack servers',
    patterns: [
      'restart servers',
      'fresh environment',
      'restart the stack',
      'restart LEO',
      'reboot servers'
    ]
  },
  'quick-fix': {
    name: '/quick-fix',
    description: 'Create a quick fix for a small issue',
    patterns: [
      'quick fix',
      'small fix',
      'just fix this quickly',
      'patch this',
      'minor bug',
      'simple fix'
    ]
  },
  'triangulation-protocol': {
    name: '/triangulation-protocol',
    description: 'Multi-AI ground-truth verification',
    patterns: [
      'verify this with other AIs',
      'triangulate this',
      'is this actually implemented',
      'check if this works',
      'get external AI opinion'
    ]
  },
  'uat': {
    name: '/uat',
    description: 'Run user acceptance testing',
    patterns: [
      'run UAT',
      'acceptance testing',
      'lets do acceptance testing',
      'manual test',
      'verify this works',
      'test this feature'
    ]
  },
  'escalate': {
    name: '/escalate',
    description: 'Escalate an issue for root cause analysis',
    patterns: [
      'this keeps failing',
      'stuck on this',
      'blocked',
      'need root cause',
      'escalate this issue',
      'why does this keep happening',
      '5 whys'
    ]
  },
  'inbox': {
    name: '/inbox',
    description: 'Check feedback items',
    patterns: [
      'check feedback',
      'see inbox',
      'any feedback',
      'review feedback items'
    ]
  },
  'simplify': {
    name: '/simplify',
    description: 'Simplify and clean up code',
    patterns: [
      'simplify this code',
      'clean this up',
      'refactor for clarity',
      'make this cleaner',
      'reduce complexity'
    ]
  },
  'leo next': {
    name: '/leo next',
    description: 'Show the SD queue and next work item',
    patterns: [
      'whats next',
      'show the queue',
      'next SD',
      'what should we work on',
      'show priorities'
    ]
  }
};

/**
 * Parse a vector from string format
 */
function parseVector(vec) {
  if (Array.isArray(vec)) return vec;
  if (typeof vec === 'string') {
    try {
      const cleaned = vec.replace(/^\[|\]$/g, '');
      return cleaned.split(',').map(Number);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Calculates cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  const vecA = parseVector(a);
  const vecB = parseVector(b);

  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * SkillIntentDetector - Detects skill invocation intent from user messages
 */
export class SkillIntentDetector {
  constructor(options = {}) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.threshold = options.threshold || SIMILARITY_THRESHOLD;
    this.patternEmbeddings = null; // Cached pattern embeddings
  }

  /**
   * Generate embeddings for all skill patterns (cached)
   */
  async loadPatternEmbeddings() {
    if (this.patternEmbeddings) {
      return this.patternEmbeddings;
    }

    console.log('Generating skill pattern embeddings...');

    this.patternEmbeddings = {};

    for (const [skillKey, skill] of Object.entries(SKILL_PATTERNS)) {
      // Combine patterns into a single text for embedding
      const combinedText = [
        skill.description,
        ...skill.patterns
      ].join('. ');

      try {
        const response = await this.openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: combinedText
        });

        this.patternEmbeddings[skillKey] = {
          name: skill.name,
          description: skill.description,
          patterns: skill.patterns,
          embedding: response.data[0].embedding
        };

      } catch (error) {
        console.error(`Failed to generate embedding for ${skillKey}:`, error.message);
      }
    }

    console.log(`Generated embeddings for ${Object.keys(this.patternEmbeddings).length} skills`);

    return this.patternEmbeddings;
  }

  /**
   * Generate embedding for a user message
   */
  async generateMessageEmbedding(message) {
    try {
      const response = await this.openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: message
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Failed to generate message embedding:', error.message);
      return null;
    }
  }

  /**
   * Detect skill intent from a user message
   *
   * @param {string} message - User message to analyze
   * @param {Object} options - Detection options
   * @returns {Promise<Object|null>} - Detected skill or null
   */
  async detect(message, options = {}) {
    const {
      threshold = this.threshold,
      returnAll = false
    } = options;

    // Load pattern embeddings
    const patterns = await this.loadPatternEmbeddings();

    // Generate embedding for user message
    const messageEmbedding = await this.generateMessageEmbedding(message);

    if (!messageEmbedding) {
      return returnAll ? [] : null;
    }

    // Calculate similarity with each skill
    const scores = [];

    for (const [skillKey, skill] of Object.entries(patterns)) {
      const similarity = cosineSimilarity(messageEmbedding, skill.embedding);

      // Also check for exact pattern matches (bonus)
      const messageLower = message.toLowerCase();
      const exactMatch = skill.patterns.some(p =>
        messageLower.includes(p.toLowerCase())
      );

      // Combined score with bonus for exact match
      const combinedScore = exactMatch ? Math.min(1, similarity + 0.2) : similarity;

      scores.push({
        skill: skillKey,
        name: skill.name,
        description: skill.description,
        semanticScore: Math.round(similarity * 100),
        exactMatch,
        combinedScore: Math.round(combinedScore * 100)
      });
    }

    // Sort by combined score
    scores.sort((a, b) => b.combinedScore - a.combinedScore);

    if (returnAll) {
      return scores;
    }

    // Return top match if above threshold
    const topMatch = scores[0];
    if (topMatch && topMatch.combinedScore >= threshold * 100) {
      return topMatch;
    }

    return null;
  }

  /**
   * Test detection with example messages
   */
  async runTests() {
    const testMessages = [
      'yes, create the SD',
      'sure, go ahead and create it',
      'commit this and create a PR',
      'ship it',
      'what should we work on next',
      'lets do some acceptance testing',
      'this keeps failing, escalate it',
      'document this feature',
      'can you simplify this code'
    ];

    console.log('\n🎯 Skill Intent Detector - Test Results\n');
    console.log('='.repeat(70));

    for (const message of testMessages) {
      console.log(`\n💬 Message: "${message}"`);
      console.log('-'.repeat(50));

      const result = await this.detect(message, { returnAll: false });

      if (result) {
        console.log(`   ✅ Detected: ${result.name} (${result.combinedScore}%)`);
        console.log(`      Semantic: ${result.semanticScore}% | Exact: ${result.exactMatch ? 'Yes' : 'No'}`);
      } else {
        console.log('   ❌ No skill detected');
      }
    }

    console.log('\n' + '='.repeat(70));
  }
}

// CLI entry point
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     process.argv[1]?.endsWith('skill-intent-detector.js');

if (isMainModule) {
  const detector = new SkillIntentDetector();

  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    detector.runTests().catch(err => {
      console.error('Test failed:', err.message);
      process.exit(1);
    });
  } else if (args.length > 0) {
    const message = args.filter(a => !a.startsWith('--')).join(' ');
    detector.detect(message, { returnAll: true }).then(results => {
      console.log(JSON.stringify(results, null, 2));
    }).catch(err => {
      console.error('Detection failed:', err.message);
      process.exit(1);
    });
  } else {
    console.log('Usage:');
    console.log('  node lib/skill-intent-detector.js --test');
    console.log('  node lib/skill-intent-detector.js "your message here"');
  }
}

export default SkillIntentDetector;
