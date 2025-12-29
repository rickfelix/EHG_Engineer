/**
 * Language Parsers for Code Entity Extraction
 *
 * Extracts functions, classes, components, and other code entities
 * from TypeScript, JavaScript, and SQL files for semantic indexing.
 *
 * SD: SD-SEMANTIC-SEARCH-001
 * Story: US-001 - Natural Language Code Search
 */

/**
 * Parse TypeScript/JavaScript code entities using regex patterns
 *
 * Note: This is a simple pattern-based parser. For production use,
 * consider using @babel/parser or typescript compiler API for AST parsing.
 */
function parseTypeScriptJavaScript(code, _language, _filePath) {
  const entities = [];
  const lines = code.split('\n');

  // Pattern: function declarations
  const functionPattern = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\((.*?)\)/gm;
  let match;

  while ((match = functionPattern.exec(code)) !== null) {
    const [_fullMatch, name, params] = match;
    const lineNumber = code.substring(0, match.index).split('\n').length;

    entities.push({
      entityType: 'function',
      entityName: name,
      params,
      lineStart: lineNumber,
      lineEnd: findEndOfBlock(lines, lineNumber - 1) + 1,
      codeSnippet: extractCodeSnippet(lines, lineNumber - 1, 10),
      description: extractJSDocComment(lines, lineNumber - 2)
    });
  }

  // Pattern: arrow functions assigned to const/let
  const arrowFunctionPattern = /^(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\((.*?)\)\s*=>/gm;

  while ((match = arrowFunctionPattern.exec(code)) !== null) {
    const [_fullMatch, name, params] = match;
    const lineNumber = code.substring(0, match.index).split('\n').length;

    entities.push({
      entityType: 'function',
      entityName: name,
      params,
      lineStart: lineNumber,
      lineEnd: findEndOfBlock(lines, lineNumber - 1) + 1,
      codeSnippet: extractCodeSnippet(lines, lineNumber - 1, 10),
      description: extractJSDocComment(lines, lineNumber - 2)
    });
  }

  // Pattern: class declarations
  const classPattern = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?/gm;

  while ((match = classPattern.exec(code)) !== null) {
    const [_fullMatch, name] = match;
    const lineNumber = code.substring(0, match.index).split('\n').length;

    entities.push({
      entityType: 'class',
      entityName: name,
      lineStart: lineNumber,
      lineEnd: findEndOfBlock(lines, lineNumber - 1) + 1,
      codeSnippet: extractCodeSnippet(lines, lineNumber - 1, 15),
      description: extractJSDocComment(lines, lineNumber - 2)
    });
  }

  // Pattern: React components (function components)
  const componentPattern = /^(?:export\s+)?(?:const|function)\s+([A-Z]\w+)\s*(?:=\s*)?(?:\((.*?)\))?\s*(?:=>|:)/gm;

  while ((match = componentPattern.exec(code)) !== null) {
    const [_fullMatch, name, props] = match;
    const lineNumber = code.substring(0, match.index).split('\n').length;

    // Check if it's a React component (returns JSX or uses hooks)
    const snippet = extractCodeSnippet(lines, lineNumber - 1, 20);
    if (snippet.includes('return') && (snippet.includes('<') || snippet.includes('use'))) {
      entities.push({
        entityType: 'component',
        entityName: name,
        params: props || '',
        lineStart: lineNumber,
        lineEnd: findEndOfBlock(lines, lineNumber - 1) + 1,
        codeSnippet: snippet,
        description: extractJSDocComment(lines, lineNumber - 2)
      });
    }
  }

  // Pattern: interface declarations
  const interfacePattern = /^(?:export\s+)?interface\s+(\w+)/gm;

  while ((match = interfacePattern.exec(code)) !== null) {
    const [_fullMatch, name] = match;
    const lineNumber = code.substring(0, match.index).split('\n').length;

    entities.push({
      entityType: 'interface',
      entityName: name,
      lineStart: lineNumber,
      lineEnd: findEndOfBlock(lines, lineNumber - 1) + 1,
      codeSnippet: extractCodeSnippet(lines, lineNumber - 1, 10),
      description: extractJSDocComment(lines, lineNumber - 2)
    });
  }

  // Pattern: type aliases
  const typePattern = /^(?:export\s+)?type\s+(\w+)/gm;

  while ((match = typePattern.exec(code)) !== null) {
    const [_fullMatch, name] = match;
    const lineNumber = code.substring(0, match.index).split('\n').length;

    entities.push({
      entityType: 'type',
      entityName: name,
      lineStart: lineNumber,
      lineEnd: findEndOfBlock(lines, lineNumber - 1) + 1,
      codeSnippet: extractCodeSnippet(lines, lineNumber - 1, 5),
      description: extractJSDocComment(lines, lineNumber - 2)
    });
  }

  return entities;
}

/**
 * Parse SQL code entities
 */
function parseSQL(code, _language, _filePath) {
  const entities = [];
  const lines = code.split('\n');

  // Pattern: CREATE FUNCTION
  const functionPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(\w+)\s*\(/gi;
  let match;

  while ((match = functionPattern.exec(code)) !== null) {
    const [_fullMatch, name] = match;
    const lineNumber = code.substring(0, match.index).split('\n').length;

    entities.push({
      entityType: 'function',
      entityName: name,
      lineStart: lineNumber,
      lineEnd: findEndOfSQLBlock(lines, lineNumber - 1, 'FUNCTION') + 1,
      codeSnippet: extractCodeSnippet(lines, lineNumber - 1, 20),
      description: extractSQLComment(lines, lineNumber - 2)
    });
  }

  // Pattern: CREATE TABLE
  const tablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;

  while ((match = tablePattern.exec(code)) !== null) {
    const [_fullMatch, name] = match;
    const lineNumber = code.substring(0, match.index).split('\n').length;

    entities.push({
      entityType: 'table',
      entityName: name,
      lineStart: lineNumber,
      lineEnd: findEndOfSQLBlock(lines, lineNumber - 1, 'TABLE') + 1,
      codeSnippet: extractCodeSnippet(lines, lineNumber - 1, 15),
      description: extractSQLComment(lines, lineNumber - 2)
    });
  }

  // Pattern: CREATE VIEW
  const viewPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(\w+)/gi;

  while ((match = viewPattern.exec(code)) !== null) {
    const [_fullMatch, name] = match;
    const lineNumber = code.substring(0, match.index).split('\n').length;

    entities.push({
      entityType: 'view',
      entityName: name,
      lineStart: lineNumber,
      lineEnd: findEndOfSQLBlock(lines, lineNumber - 1, 'VIEW') + 1,
      codeSnippet: extractCodeSnippet(lines, lineNumber - 1, 10),
      description: extractSQLComment(lines, lineNumber - 2)
    });
  }

  return entities;
}

/**
 * Extract JSDoc comment from lines before entity
 */
function extractJSDocComment(lines, startLine) {
  if (startLine < 0 || startLine >= lines.length) return '';

  let comment = '';
  let line = startLine;

  // Look for JSDoc comment (/** ... */)
  while (line >= 0 && lines[line].trim().startsWith('*')) {
    comment = lines[line].trim() + '\n' + comment;
    line--;
  }

  // Check for opening /**
  if (line >= 0 && lines[line].trim().startsWith('/**')) {
    comment = lines[line].trim() + '\n' + comment;
  }

  // Clean up comment
  return comment
    .replace(/^\/\*\*\s*/, '')
    .replace(/\*\/\s*$/, '')
    .replace(/^\s*\*\s*/gm, '')
    .trim();
}

/**
 * Extract SQL comment from lines before entity
 */
function extractSQLComment(lines, startLine) {
  if (startLine < 0 || startLine >= lines.length) return '';

  let comment = '';
  let line = startLine;

  // Look for -- comments
  while (line >= 0 && lines[line].trim().startsWith('--')) {
    comment = lines[line].trim().substring(2).trim() + '\n' + comment;
    line--;
  }

  return comment.trim();
}

/**
 * Find the end of a code block (matching braces)
 */
function findEndOfBlock(lines, startLine) {
  let braceCount = 0;
  let inBlock = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];

    for (const char of line) {
      if (char === '{') {
        braceCount++;
        inBlock = true;
      } else if (char === '}') {
        braceCount--;
        if (inBlock && braceCount === 0) {
          return i;
        }
      }
    }
  }

  return startLine + 10; // Default if not found
}

/**
 * Find the end of a SQL block
 */
function findEndOfSQLBlock(lines, startLine, _blockType) {
  // Look for semicolon
  for (let i = startLine; i < lines.length; i++) {
    if (lines[i].trim().endsWith(';')) {
      return i;
    }
  }

  return startLine + 20; // Default
}

/**
 * Extract code snippet from lines
 */
function extractCodeSnippet(lines, startLine, maxLines = 10) {
  const endLine = Math.min(startLine + maxLines, lines.length);
  return lines.slice(startLine, endLine).join('\n');
}

/**
 * Main parser dispatcher
 */
async function parseCodeEntities(code, language, filePath) {
  switch (language) {
    case 'typescript':
    case 'tsx':
    case 'javascript':
    case 'jsx':
      return parseTypeScriptJavaScript(code, language, filePath);

    case 'sql':
      return parseSQL(code, language, filePath);

    default:
      console.warn(`Unsupported language: ${language}`);
      return [];
  }
}

module.exports = {
  parseCodeEntities,
  parseTypeScriptJavaScript,
  parseSQL
};
