/**
 * Incremental Analysis System
 * Tracks changes and only rescans modified files
 * Massive performance improvement for large codebases
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import crypto from 'crypto';
import EventEmitter from 'events';

class IncrementalAnalyzer extends EventEmitter {
  constructor() {
    super();
    
    // File state cache
    this.fileCache = new Map();
    
    // Analysis result cache
    this.resultCache = new Map();
    
    // Dependency graph
    this.dependencies = new Map();
    
    // Change detection
    this.lastScanTime = null;
    this.modifiedFiles = new Set();
    
    // Cache persistence
    this.cacheFile = path.join(process.cwd(), '.leo-analysis-cache.json');
  }

  /**
   * Initialize incremental analyzer
   */
  async initialize() {
    await this.loadCache();
    this.lastScanTime = Date.now();
  }

  /**
   * Detect changed files since last scan
   */
  async detectChanges(basePath, extensions = ['.js', '.jsx', '.ts', '.tsx']) {
    const changes = {
      added: [],
      modified: [],
      deleted: [],
      unchanged: []
    };
    
    const currentFiles = new Map();
    
    // Scan current file system
    await this.scanDirectory(basePath, currentFiles, extensions);
    
    // Compare with cache
    for (const [filePath, currentHash] of currentFiles) {
      const cachedData = this.fileCache.get(filePath);
      
      if (!cachedData) {
        // New file
        changes.added.push(filePath);
        this.fileCache.set(filePath, {
          hash: currentHash,
          lastModified: Date.now(),
          dependencies: []
        });
      } else if (cachedData.hash !== currentHash) {
        // Modified file
        changes.modified.push(filePath);
        cachedData.hash = currentHash;
        cachedData.lastModified = Date.now();
      } else {
        // Unchanged file
        changes.unchanged.push(filePath);
      }
    }
    
    // Check for deleted files
    for (const [cachedPath] of this.fileCache) {
      if (!currentFiles.has(cachedPath)) {
        changes.deleted.push(cachedPath);
        this.fileCache.delete(cachedPath);
        this.resultCache.delete(cachedPath);
      }
    }
    
    // Update modified files set
    this.modifiedFiles = new Set([...changes.added, ...changes.modified]);
    
    // Find impacted files through dependencies
    changes.impacted = this.findImpactedFiles(changes.modified);
    
    // Save cache
    await this.saveCache();
    
    return changes;
  }

  /**
   * Scan directory and calculate file hashes
   */
  async scanDirectory(dir, fileMap, extensions) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        // Skip node_modules and hidden directories
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        
        if (entry.isDirectory()) {
          await this.scanDirectory(fullPath, fileMap, extensions);
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          const hash = await this.calculateFileHash(fullPath);
          fileMap.set(fullPath, hash);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error.message);
    }
  }

  /**
   * Calculate file hash for change detection
   */
  async calculateFileHash(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return crypto.createHash('md5').update(content).digest('hex');
    } catch (error) {
      return null;
    }
  }

  /**
   * Find files impacted by changes
   */
  findImpactedFiles(modifiedFiles) {
    const impacted = new Set();
    
    for (const modifiedFile of modifiedFiles) {
      // Add direct dependents
      const dependents = this.getDependents(modifiedFile);
      dependents.forEach(file => impacted.add(file));
      
      // Add transitive dependents (2 levels deep max)
      for (const dependent of dependents) {
        const transitive = this.getDependents(dependent);
        transitive.forEach(file => impacted.add(file));
      }
    }
    
    // Remove files that are already in modified list
    modifiedFiles.forEach(file => impacted.delete(file));
    
    return Array.from(impacted);
  }

  /**
   * Get files that depend on a given file
   */
  getDependents(filePath) {
    const dependents = new Set();
    
    for (const [file, deps] of this.dependencies) {
      if (deps.includes(filePath)) {
        dependents.add(file);
      }
    }
    
    return Array.from(dependents);
  }

  /**
   * Update dependency graph from analysis
   */
  updateDependencies(filePath, imports = []) {
    const resolvedImports = imports
      .filter(imp => !imp.startsWith('node_modules'))
      .map(imp => path.resolve(path.dirname(filePath), imp));
    
    this.dependencies.set(filePath, resolvedImports);
    
    // Update cache entry
    const cacheEntry = this.fileCache.get(filePath);
    if (cacheEntry) {
      cacheEntry.dependencies = resolvedImports;
    }
  }

  /**
   * Get cached analysis results
   */
  getCachedResults(filePath) {
    return this.resultCache.get(filePath);
  }

  /**
   * Store analysis results
   */
  setCachedResults(filePath, results) {
    this.resultCache.set(filePath, {
      results,
      timestamp: Date.now()
    });
  }

  /**
   * Check if file needs reanalysis
   */
  needsAnalysis(filePath) {
    // Always analyze if in modified set
    if (this.modifiedFiles.has(filePath)) {
      return true;
    }
    
    // Check if cached results exist and are recent
    const cached = this.resultCache.get(filePath);
    if (!cached) {
      return true;
    }
    
    // Results older than 24 hours should be refreshed
    const age = Date.now() - cached.timestamp;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    return age > maxAge;
  }

  /**
   * Get analysis strategy
   */
  async getAnalysisStrategy(basePath, options = {}) {
    const changes = await this.detectChanges(basePath);
    
    const strategy = {
      type: 'INCREMENTAL',
      totalFiles: this.fileCache.size,
      filesToAnalyze: [],
      filesToSkip: [],
      estimatedTime: 0
    };
    
    // Determine what needs analysis
    const toAnalyze = new Set([
      ...changes.added,
      ...changes.modified,
      ...changes.impacted
    ]);
    
    // Add files without recent cache
    for (const [filePath] of this.fileCache) {
      if (this.needsAnalysis(filePath)) {
        toAnalyze.add(filePath);
      }
    }
    
    strategy.filesToAnalyze = Array.from(toAnalyze);
    strategy.filesToSkip = Array.from(this.fileCache.keys())
      .filter(f => !toAnalyze.has(f));
    
    // Estimate time (2 seconds per file average)
    strategy.estimatedTime = strategy.filesToAnalyze.length * 2;
    
    // Determine strategy type
    const percentageToAnalyze = (strategy.filesToAnalyze.length / strategy.totalFiles) * 100;
    
    if (percentageToAnalyze === 0) {
      strategy.type = 'CACHED';
      strategy.message = 'No changes detected, using cached results';
    } else if (percentageToAnalyze < 10) {
      strategy.type = 'MINIMAL';
      strategy.message = `Analyzing ${strategy.filesToAnalyze.length} changed files`;
    } else if (percentageToAnalyze < 30) {
      strategy.type = 'INCREMENTAL';
      strategy.message = `Incremental analysis of ${Math.round(percentageToAnalyze)}% of codebase`;
    } else if (percentageToAnalyze < 70) {
      strategy.type = 'PARTIAL';
      strategy.message = `Significant changes detected, analyzing ${Math.round(percentageToAnalyze)}% of codebase`;
    } else {
      strategy.type = 'FULL';
      strategy.message = 'Major changes detected, full analysis recommended';
    }
    
    // Add performance savings
    const timeSaved = strategy.filesToSkip.length * 2; // 2 seconds per file
    strategy.timeSaved = this.formatTime(timeSaved);
    
    return strategy;
  }

  /**
   * Clear cache for specific files
   */
  invalidateCache(filePaths) {
    for (const filePath of filePaths) {
      this.resultCache.delete(filePath);
      this.modifiedFiles.add(filePath);
    }
  }

  /**
   * Load cache from disk
   */
  async loadCache() {
    try {
      const cacheData = await fs.readFile(this.cacheFile, 'utf8');
      const parsed = JSON.parse(cacheData);
      
      // Restore file cache
      this.fileCache = new Map(parsed.fileCache || []);
      
      // Restore result cache (with size limit)
      const results = parsed.resultCache || [];
      const maxCacheSize = 100; // Keep last 100 results
      
      this.resultCache = new Map(
        results.slice(-maxCacheSize)
      );
      
      // Restore dependencies
      this.dependencies = new Map(parsed.dependencies || []);
      
      console.log(`Loaded incremental cache: ${this.fileCache.size} files tracked`);
    } catch (error) {
      // Cache doesn't exist or is corrupted, start fresh
      console.log('Starting with fresh incremental cache');
    }
  }

  /**
   * Save cache to disk
   */
  async saveCache() {
    try {
      const cacheData = {
        version: '1.0.0',
        timestamp: Date.now(),
        fileCache: Array.from(this.fileCache.entries()),
        resultCache: Array.from(this.resultCache.entries()),
        dependencies: Array.from(this.dependencies.entries())
      };
      
      await fs.writeFile(
        this.cacheFile,
        JSON.stringify(cacheData, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Failed to save incremental cache:', error.message);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      filesTracked: this.fileCache.size,
      resultsCached: this.resultCache.size,
      dependenciesTracked: this.dependencies.size,
      modifiedFiles: this.modifiedFiles.size,
      cacheFile: this.cacheFile,
      lastScanTime: this.lastScanTime ? new Date(this.lastScanTime).toISOString() : null
    };
  }

  /**
   * Format time in human-readable format
   */
  formatTime(seconds) {
    if (seconds < 60) {
      return `${seconds} seconds`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes < 60) {
      return remainingSeconds > 0 
        ? `${minutes} min ${remainingSeconds} sec`
        : `${minutes} minutes`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    return remainingMinutes > 0
      ? `${hours} hr ${remainingMinutes} min`
      : `${hours} hours`;
  }

  /**
   * Clear all caches
   */
  async clearCache() {
    this.fileCache.clear();
    this.resultCache.clear();
    this.dependencies.clear();
    this.modifiedFiles.clear();
    
    try {
      await fs.unlink(this.cacheFile);
      console.log('Incremental cache cleared');
    } catch (error) {
      // File might not exist
    }
  }
}

// Export singleton instance
let instance = null;

export { 
  IncrementalAnalyzer,
  
  getInstance() {
    if (!instance) {
      instance = new IncrementalAnalyzer();
     }
    return instance;
  }
};