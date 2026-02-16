import type { CodeNode } from '../shared/types';

/**
 * Semantic code search - understands code concepts beyond simple string matching
 */

// Common code concepts and their variations
const CONCEPT_MAP: Record<string, string[]> = {
  // Constructors
  constructor: ['constructor', '__init__', 'init', 'new', 'create'],
  
  // Getters/Setters
  getter: ['get', 'getter', 'accessor', 'property', '__get__'],
  setter: ['set', 'setter', 'mutator', '__set__'],
  
  // Lifecycle
  lifecycle: ['mount', 'unmount', 'componentdidmount', 'componentwillunmount', 'useeffect', 'ondestroy', '__del__'],
  
  // Common patterns
  handler: ['handle', 'handler', 'on', 'listener', 'callback'],
  render: ['render', 'draw', 'paint', 'display', 'show'],
  update: ['update', 'modify', 'change', 'edit', 'patch'],
  delete: ['delete', 'remove', 'destroy', '__del__', 'dispose'],
  create: ['create', 'add', 'new', 'make', 'build', 'construct'],
  fetch: ['fetch', 'get', 'retrieve', 'load', 'request'],
  save: ['save', 'store', 'persist', 'write'],
  validate: ['validate', 'check', 'verify', 'assert', 'test'],
  format: ['format', 'stringify', 'serialize', 'tostring', '__str__', '__repr__'],
  parse: ['parse', 'deserialize', 'fromstring', 'decode'],
  
  // Data structures
  list: ['list', 'array', 'collection', 'sequence'],
  map: ['map', 'dict', 'dictionary', 'hashmap', 'object'],
  set: ['set', 'hashset', 'unique'],
  
  // Async patterns
  async: ['async', 'await', 'promise', 'future', 'task', 'coroutine'],
  callback: ['callback', 'listener', 'handler', 'delegate'],
  
  // Testing
  test: ['test', 'spec', 'should', 'expect', 'assert', 'describe', 'it'],
  mock: ['mock', 'stub', 'fake', 'spy'],
};

/**
 * Calculate similarity score between two strings (0-1)
 */
function similarityScore(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  // Exact match
  if (s1 === s2) return 1.0;
  
  // One contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Calculate Levenshtein distance ratio
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(0));
  
  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j - 1][i] + 1,
        matrix[j][i - 1] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }
  
  const distance = matrix[len2][len1];
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 1.0 : 1 - (distance / maxLen);
}

/**
 * Check if node matches concept-based search
 */
function matchesConcept(node: CodeNode, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  
  // Check if query matches any concept
  for (const [concept, variations] of Object.entries(CONCEPT_MAP)) {
    if (lowerQuery.includes(concept)) {
      // Check if node name matches any variation of this concept
      const lowerName = node.name.toLowerCase();
      return variations.some(variation => 
        lowerName.includes(variation) || 
        similarityScore(lowerName, variation) > 0.7
      );
    }
  }
  
  return false;
}

/**
 * Search node properties/parameters
 */
function matchesProperties(node: CodeNode, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  
  // Search in properties
  if (node.properties?.some(prop => prop.toLowerCase().includes(lowerQuery))) {
    return true;
  }
  
  // Search in parameters
  if (node.parameters?.some(param => param.toLowerCase().includes(lowerQuery))) {
    return true;
  }
  
  // Search in return type
  if (node.returnType?.toLowerCase().includes(lowerQuery)) {
    return true;
  }
  
  // Search in modifiers
  if (node.modifiers?.some(mod => mod.toLowerCase().includes(lowerQuery))) {
    return true;
  }
  
  return false;
}

/**
 * Search in documentation
 */
function matchesDocumentation(node: CodeNode, query: string): boolean {
  if (!node.documentation) return false;
  return node.documentation.toLowerCase().includes(query.toLowerCase());
}

/**
 * Check if query is searching for a specific pattern
 */
function matchesPattern(node: CodeNode, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  
  // Search for specific kinds with aliases
  const kindAliases: Record<string, string[]> = {
    class: ['class', 'classes', 'object'],
    function: ['function', 'func', 'method', 'def'],
    interface: ['interface', 'protocol', 'contract'],
    enum: ['enum', 'enumeration', 'constants'],
    variable: ['var', 'variable', 'const', 'let'],
  };
  
  for (const [kind, aliases] of Object.entries(kindAliases)) {
    if (aliases.some(alias => lowerQuery === alias || lowerQuery.startsWith(alias + ' '))) {
      return node.kind === kind;
    }
  }
  
  return false;
}

/**
 * Enhanced semantic search that understands code concepts
 */
export function semanticSearchNodes(nodes: CodeNode[], query: string): CodeNode[] {
  if (!query.trim()) return nodes;
  
  const lowerQuery = query.toLowerCase().trim();
  const words = lowerQuery.split(/\s+/);
  
  return nodes.filter(node => {
    const lowerName = node.name.toLowerCase();
    const lowerPath = node.filePath.toLowerCase();
    const lowerKind = node.kind.toLowerCase();
    
    // 1. Exact or partial string match (original behavior)
    if (lowerName.includes(lowerQuery) || 
        lowerPath.includes(lowerQuery) || 
        lowerKind.includes(lowerQuery)) {
      return true;
    }
    
    // 2. Multi-word search (all words must match somewhere)
    if (words.length > 1) {
      const allWordsMatch = words.every(word => 
        lowerName.includes(word) || 
        lowerPath.includes(word) ||
        lowerKind.includes(word)
      );
      if (allWordsMatch) return true;
    }
    
    // 3. Concept-based search
    if (matchesConcept(node, query)) {
      return true;
    }
    
    // 4. Pattern matching
    if (matchesPattern(node, query)) {
      return true;
    }
    
    // 5. Search in properties/parameters/types
    if (matchesProperties(node, query)) {
      return true;
    }
    
    // 6. Search in documentation
    if (matchesDocumentation(node, query)) {
      return true;
    }
    
    // 7. Fuzzy matching for typos (only for reasonably long queries)
    if (lowerQuery.length >= 4) {
      if (similarityScore(lowerName, lowerQuery) > 0.75) {
        return true;
      }
    }
    
    return false;
  });
}

/**
 * Get search suggestions based on query
 */
export function getSearchSuggestions(query: string): string[] {
  const lowerQuery = query.toLowerCase().trim();
  if (lowerQuery.length < 2) return [];
  
  const suggestions: string[] = [];
  
  // Suggest concepts
  for (const concept of Object.keys(CONCEPT_MAP)) {
    if (concept.startsWith(lowerQuery) || concept.includes(lowerQuery)) {
      suggestions.push(concept);
    }
  }
  
  // Suggest patterns
  const patterns = ['class', 'function', 'interface', 'enum', 'variable', 'async', 'test'];
  for (const pattern of patterns) {
    if (pattern.startsWith(lowerQuery)) {
      suggestions.push(pattern);
    }
  }
  
  return suggestions.slice(0, 5);
}
