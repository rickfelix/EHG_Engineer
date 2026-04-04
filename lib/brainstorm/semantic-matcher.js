/**
 * Semantic Matcher — TF-IDF Cosine Similarity
 * SD: SD-LEO-INFRA-BOARD-DELIBERATION-STRUCTURAL-001C
 *
 * Replaces SYNONYM_MAP in panel-selector.js with mathematical
 * TF-IDF-based topic-to-identity similarity scoring.
 */

/**
 * Tokenize text into lowercase words, removing stop words.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  const STOP_WORDS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
    'at', 'by', 'from', 'as', 'into', 'about', 'and', 'but', 'or', 'not',
    'if', 'then', 'that', 'this', 'it', 'its', 'we', 'our', 'they', 'them'
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/[\s-]+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Build term frequency map from tokens.
 * @param {string[]} tokens
 * @returns {Map<string, number>}
 */
function termFrequency(tokens) {
  const tf = new Map();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  // Normalize by total tokens
  const total = tokens.length || 1;
  for (const [term, count] of tf) {
    tf.set(term, count / total);
  }
  return tf;
}

/**
 * Build inverse document frequency from a corpus of documents.
 * @param {Map<string, number>[]} corpus - Array of TF maps
 * @returns {Map<string, number>}
 */
function inverseDocFrequency(corpus) {
  const idf = new Map();
  const N = corpus.length;
  for (const tf of corpus) {
    for (const term of tf.keys()) {
      idf.set(term, (idf.get(term) || 0) + 1);
    }
  }
  for (const [term, df] of idf) {
    idf.set(term, Math.log((N + 1) / (df + 1)) + 1); // smoothed IDF
  }
  return idf;
}

/**
 * Compute TF-IDF vector for a document.
 * @param {Map<string, number>} tf
 * @param {Map<string, number>} idf
 * @returns {Map<string, number>}
 */
function tfidfVector(tf, idf) {
  const vec = new Map();
  for (const [term, freq] of tf) {
    vec.set(term, freq * (idf.get(term) || 1));
  }
  return vec;
}

/**
 * Compute cosine similarity between two sparse vectors.
 * @param {Map<string, number>} a
 * @param {Map<string, number>} b
 * @returns {number} Similarity in [0, 1]
 */
function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (const [term, val] of a) {
    dot += val * (b.get(term) || 0);
    magA += val * val;
  }
  for (const val of b.values()) {
    magB += val * val;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Compute semantic similarity between a topic and an identity's expertise.
 *
 * @param {string} topic - Topic text (keywords joined)
 * @param {string} expertise - Identity expertise text
 * @param {string[]} expertiseDomains - Identity expertise_domains array
 * @param {Map<string, number>[]} corpus - Pre-built corpus TF maps (optional)
 * @returns {number} Similarity score in [0, 1]
 */
export function computeSimilarity(topic, expertise, expertiseDomains = [], corpus = []) {
  const topicTokens = tokenize(topic);
  const expertiseTokens = [
    ...tokenize(expertise),
    ...expertiseDomains.flatMap(d => tokenize(d))
  ];

  if (!topicTokens.length || !expertiseTokens.length) return 0;

  const topicTF = termFrequency(topicTokens);
  const expertiseTF = termFrequency(expertiseTokens);

  // Build IDF from the corpus plus our two documents
  const allDocs = [...corpus, topicTF, expertiseTF];
  const idf = inverseDocFrequency(allDocs);

  const topicVec = tfidfVector(topicTF, idf);
  const expertiseVec = tfidfVector(expertiseTF, idf);

  return cosineSimilarity(topicVec, expertiseVec);
}

/**
 * Score all identities against a topic using TF-IDF similarity.
 *
 * @param {string} topic - Topic text
 * @param {string[]} keywords - Additional keywords
 * @param {Array<{expertise: string, expertise_domains: string[]}>} identities
 * @returns {Array<{index: number, similarity: number}>} Sorted by similarity descending
 */
export function scoreIdentities(topic, keywords, identities) {
  const fullTopic = [topic, ...keywords].join(' ');

  // Build corpus from all identities for better IDF
  const corpus = identities.map(id => {
    const tokens = [
      ...tokenize(id.expertise || ''),
      ...(id.expertise_domains || []).flatMap(d => tokenize(d))
    ];
    return termFrequency(tokens);
  });

  return identities
    .map((id, index) => ({
      index,
      similarity: computeSimilarity(fullTopic, id.expertise || '', id.expertise_domains || [], corpus)
    }))
    .sort((a, b) => b.similarity - a.similarity);
}

export { tokenize, termFrequency, cosineSimilarity };
