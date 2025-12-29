/**
 * Performance Optimizer
 * Implements intelligent caching, parallel processing, and optimization strategies
 * Ensures the invisible sub-agent system operates at maximum efficiency
 */

import Redis from 'ioredis';

class PerformanceOptimizer {
  constructor(config = {}) {
    this.config = {
      cache_enabled: true,
      redis_url: config.redis_url || null,
      memory_cache_size: 1000,       // Max items in memory cache
      cache_ttl: 300000,             // 5 minutes default TTL
      
      // Parallel processing
      max_concurrent_operations: 5,
      operation_timeout: 3000,
      batch_size: 10,
      
      // Response optimization
      response_compression: true,
      lazy_loading: true,
      prefetch_enabled: true,
      
      // Performance monitoring
      metrics_enabled: true,
      performance_target_ms: 2000,
      degradation_threshold: 0.2,
      
      ...config
    };
    
    // Initialize caching systems
    this.memoryCache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };
    
    // Redis connection (optional)
    this.redis = null;
    if (this.config.redis_url) {
      this.initializeRedis();
    }
    
    // Performance monitoring
    this.performanceMetrics = {
      operation_times: [],
      cache_performance: [],
      parallel_efficiency: [],
      memory_usage: [],
      last_cleanup: Date.now()
    };
    
    // Parallel processing queue
    this.operationQueue = [];
    this.activeOperations = new Set();
    this.operationPool = new Map();
    
    // Optimization strategies
    this.optimizationStrategies = new Map();
    this.loadOptimizationStrategies();
    
    // Auto-cleanup interval
    setInterval(() => this.performMaintenance(), 60000); // Every minute
  }

  /**
   * Initialize Redis connection for distributed caching
   */
  async initializeRedis() {
    try {
      this.redis = new Redis(this.config.redis_url);
      
      this.redis.on('error', (err) => {
        console.error('Redis connection error:', err);
        this.redis = null; // Fallback to memory cache
      });
      
      this.redis.on('connect', () => {
        console.log('Redis cache connected');
      });
      
      await this.redis.connect();
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      this.redis = null;
    }
  }

  /**
   * Optimized cache get operation
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached value or null
   */
  async get(key) {
    const startTime = Date.now();
    
    try {
      // Try memory cache first (fastest)
      if (this.memoryCache.has(key)) {
        const cached = this.memoryCache.get(key);
        if (Date.now() - cached.timestamp < this.config.cache_ttl) {
          this.cacheStats.hits++;
          this.recordOperationTime('cache_get_memory', Date.now() - startTime);
          return cached.value;
        } else {
          // Expired, remove from memory cache
          this.memoryCache.delete(key);
        }
      }
      
      // Try Redis cache (if available)
      if (this.redis) {
        const cached = await this.redis.get(key);
        if (cached) {
          const parsed = JSON.parse(cached);
          
          // Store in memory cache for faster future access
          this.setMemoryCache(key, parsed);
          
          this.cacheStats.hits++;
          this.recordOperationTime('cache_get_redis', Date.now() - startTime);
          return parsed;
        }
      }
      
      this.cacheStats.misses++;
      return null;
      
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Optimized cache set operation
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live (optional)
   */
  async set(key, value, ttl = null) {
    const startTime = Date.now();
    const cacheTtl = ttl || this.config.cache_ttl;
    
    try {
      // Set in memory cache
      this.setMemoryCache(key, value);
      
      // Set in Redis cache (if available)
      if (this.redis) {
        await this.redis.setEx(
          key, 
          Math.floor(cacheTtl / 1000), 
          JSON.stringify(value)
        );
      }
      
      this.cacheStats.sets++;
      this.recordOperationTime('cache_set', Date.now() - startTime);
      
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Set item in memory cache with LRU eviction
   */
  setMemoryCache(key, value) {
    // LRU eviction if at capacity
    if (this.memoryCache.size >= this.config.memory_cache_size) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
      this.cacheStats.evictions++;
    }
    
    this.memoryCache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  /**
   * Parallel execution with intelligent batching
   * @param {Array} operations - Array of async operations
   * @param {number} maxConcurrency - Max concurrent operations
   * @returns {Promise<Array>} Results array
   */
  async executeInParallel(operations, maxConcurrency = null) {
    const concurrency = maxConcurrency || this.config.max_concurrent_operations;
    const startTime = Date.now();
    
    if (operations.length === 0) return [];
    
    const results = [];
    const executing = [];
    
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      const operationId = this.generateOperationId();
      
      // Create promise with timeout
      const promise = Promise.race([
        this.executeWithTimeout(operation, this.config.operation_timeout),
        this.createTimeoutPromise(this.config.operation_timeout)
      ]).then(result => {
        this.activeOperations.delete(operationId);
        return result;
      });
      
      this.activeOperations.add(operationId);
      executing.push(promise);
      
      // Wait for completion if at concurrency limit
      if (executing.length >= concurrency) {
        const completed = await Promise.all(executing);
        results.push(...completed);
        executing.length = 0;
      }
    }
    
    // Wait for remaining operations
    if (executing.length > 0) {
      const completed = await Promise.all(executing);
      results.push(...completed);
    }
    
    // Record performance metrics
    const totalTime = Date.now() - startTime;
    const efficiency = operations.length / (totalTime / 1000); // ops per second
    this.recordParallelEfficiency(efficiency, operations.length, totalTime);
    
    return results;
  }

  /**
   * Smart batching for similar operations
   * @param {Array} operations - Operations to batch
   * @returns {Promise<Array>} Batched results
   */
  async smartBatch(operations) {
    if (!operations.length) return [];
    
    // Group operations by type/similarity
    const batches = this.groupOperationsByType(operations);
    const batchResults = [];
    
    for (const [batchType, batchOps] of batches) {
      const strategy = this.optimizationStrategies.get(batchType);
      
      if (strategy && strategy.batchProcessor) {
        // Use specialized batch processor
        const result = await strategy.batchProcessor(batchOps);
        batchResults.push(...result);
      } else {
        // Use standard parallel execution
        const result = await this.executeInParallel(batchOps);
        batchResults.push(...result);
      }
    }
    
    return batchResults;
  }

  /**
   * Intelligent prefetching based on patterns
   * @param {Array} likelyNextOperations - Operations likely to be needed
   */
  async prefetch(likelyNextOperations) {
    if (!this.config.prefetch_enabled || !likelyNextOperations.length) {
      return;
    }
    
    // Execute prefetch operations in background with lower priority
    const prefetchPromises = likelyNextOperations.map(operation => {
      return this.executeWithTimeout(operation, this.config.operation_timeout * 2)
        .catch(error => {
          console.warn('Prefetch operation failed:', error.message);
          return null;
        });
    });
    
    // Don't wait for prefetch to complete
    Promise.all(prefetchPromises).then(results => {
      // Cache prefetched results
      results.forEach((result, index) => {
        if (result && likelyNextOperations[index].cacheKey) {
          this.set(likelyNextOperations[index].cacheKey, result);
        }
      });
    });
  }

  /**
   * Compress response data for better performance
   * @param {any} data - Data to compress
   * @returns {any} Compressed data
   */
  compressResponse(data) {
    if (!this.config.response_compression) return data;
    
    try {
      // Simple compression strategies
      if (typeof data === 'object') {
        return this.compressObjectResponse(data);
      } else if (typeof data === 'string') {
        return this.compressStringResponse(data);
      }
      
      return data;
    } catch (error) {
      console.error('Response compression failed:', error);
      return data;
    }
  }

  /**
   * Compress object responses by removing redundancy
   */
  compressObjectResponse(obj) {
    // Remove empty arrays and objects
    const compressed = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;
      
      if (Array.isArray(value)) {
        if (value.length > 0) {
          compressed[key] = value.map(item => 
            typeof item === 'object' ? this.compressObjectResponse(item) : item
          );
        }
      } else if (typeof value === 'object') {
        const compressedChild = this.compressObjectResponse(value);
        if (Object.keys(compressedChild).length > 0) {
          compressed[key] = compressedChild;
        }
      } else {
        compressed[key] = value;
      }
    }
    
    return compressed;
  }

  /**
   * Compress string responses
   */
  compressStringResponse(str) {
    // Remove excessive whitespace while preserving formatting
    return str
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove triple+ newlines
      .replace(/[ \t]+/g, ' ') // Normalize spaces
      .trim();
  }

  /**
   * Memory usage monitoring and optimization
   */
  optimizeMemoryUsage() {
    const memUsage = process.memoryUsage();
    this.performanceMetrics.memory_usage.push({
      timestamp: Date.now(),
      heap_used: memUsage.heapUsed,
      heap_total: memUsage.heapTotal,
      cache_size: this.memoryCache.size
    });
    
    // Aggressive cleanup if memory usage is high
    if (memUsage.heapUsed / memUsage.heapTotal > 0.8) {
      this.performAggressiveCleanup();
    }
    
    // Keep only recent memory metrics
    if (this.performanceMetrics.memory_usage.length > 100) {
      this.performanceMetrics.memory_usage.splice(0, 50);
    }
  }

  /**
   * Perform aggressive cleanup when memory is constrained
   */
  performAggressiveCleanup() {
    // Clear half of memory cache (oldest entries)
    const cacheEntries = Array.from(this.memoryCache.entries());
    const toRemove = Math.floor(cacheEntries.length / 2);
    
    for (let i = 0; i < toRemove; i++) {
      this.memoryCache.delete(cacheEntries[i][0]);
      this.cacheStats.evictions++;
    }
    
    // Clear old performance metrics
    this.performanceMetrics.operation_times.splice(0, Math.floor(this.performanceMetrics.operation_times.length / 2));
    this.performanceMetrics.cache_performance.splice(0, Math.floor(this.performanceMetrics.cache_performance.length / 2));
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    console.log('Performed aggressive memory cleanup');
  }

  /**
   * Load optimization strategies for different operation types
   */
  loadOptimizationStrategies() {
    // Agent selection optimization
    this.optimizationStrategies.set('agent_selection', {
      batchProcessor: async (operations) => {
        // Batch agent selections that are similar
        return await this.batchAgentSelections(operations);
      },
      cacheStrategy: 'context_based',
      ttl: 300000 // 5 minutes
    });
    
    // Context analysis optimization
    this.optimizationStrategies.set('context_analysis', {
      batchProcessor: async (operations) => {
        return await this.batchContextAnalysis(operations);
      },
      cacheStrategy: 'content_hash',
      ttl: 600000 // 10 minutes
    });
    
    // Response enhancement optimization
    this.optimizationStrategies.set('response_enhancement', {
      cacheStrategy: 'response_based',
      ttl: 180000, // 3 minutes
      compressionEnabled: true
    });
  }

  /**
   * Batch similar agent selection operations
   */
  async batchAgentSelections(operations) {
    // Group by similar context patterns
    const contextGroups = this.groupByContextSimilarity(operations);
    const results = [];
    
    for (const group of contextGroups) {
      if (group.length === 1) {
        // Single operation, execute normally
        results.push(await group[0]());
      } else {
        // Multiple similar operations, optimize
        const sharedContext = this.extractSharedContext(group);
        const variations = group.map(op => this.extractContextVariation(op, sharedContext));
        
        // Execute with shared computation
        const sharedResult = await this.executeSharedAgentSelection(sharedContext);
        
        // Apply variations to shared result
        for (const variation of variations) {
          results.push(this.applyVariationToResult(sharedResult, variation));
        }
      }
    }
    
    return results;
  }

  /**
   * Batch context analysis operations
   */
  async batchContextAnalysis(operations) {
    // Similar batching logic for context analysis
    const results = [];
    
    for (const operation of operations) {
      // For now, execute individually (could be optimized further)
      results.push(await operation());
    }
    
    return results;
  }

  /**
   * Performance monitoring and alerting
   */
  monitorPerformance() {
    const recentOperations = this.performanceMetrics.operation_times.slice(-100);
    
    if (recentOperations.length < 10) return;
    
    const avgTime = recentOperations.reduce((sum, op) => sum + op.duration, 0) / recentOperations.length;
    const target = this.config.performance_target_ms;
    
    if (avgTime > target * (1 + this.config.degradation_threshold)) {
      console.warn(`Performance degradation detected: ${avgTime}ms avg vs ${target}ms target`);
      this.triggerPerformanceOptimization();
    }
    
    // Update performance metrics
    this.performanceMetrics.cache_performance.push({
      timestamp: Date.now(),
      hit_rate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses),
      avg_operation_time: avgTime
    });
  }

  /**
   * Trigger automatic performance optimization
   */
  triggerPerformanceOptimization() {
    // Increase cache size temporarily
    this.config.memory_cache_size = Math.min(2000, this.config.memory_cache_size * 1.2);
    
    // Reduce operation timeout for faster failures
    this.config.operation_timeout = Math.max(1000, this.config.operation_timeout * 0.8);
    
    // Enable more aggressive batching
    this.config.batch_size = Math.max(5, this.config.batch_size * 0.8);
    
    console.log('Applied automatic performance optimizations');
  }

  /**
   * Get comprehensive performance statistics
   */
  getPerformanceStats() {
    const recentOps = this.performanceMetrics.operation_times.slice(-100);
    const avgOpTime = recentOps.length > 0 ? 
      recentOps.reduce((sum, op) => sum + op.duration, 0) / recentOps.length : 0;
    
    const hitRate = this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses || 1);
    
    return {
      cache: {
        hit_rate: hitRate,
        total_hits: this.cacheStats.hits,
        total_misses: this.cacheStats.misses,
        memory_cache_size: this.memoryCache.size,
        redis_connected: !!this.redis
      },
      performance: {
        avg_operation_time: avgOpTime,
        target_time: this.config.performance_target_ms,
        active_operations: this.activeOperations.size,
        total_operations: recentOps.length
      },
      optimization: {
        parallel_efficiency: this.calculateAverageEfficiency(),
        memory_usage: process.memoryUsage(),
        last_cleanup: new Date(this.performanceMetrics.last_cleanup).toISOString()
      }
    };
  }

  /**
   * Utility methods
   */
  executeWithTimeout(operation, timeout) {
    return Promise.race([
      operation(),
      this.createTimeoutPromise(timeout)
    ]);
  }

  createTimeoutPromise(timeout) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operation timeout')), timeout);
    });
  }

  generateOperationId() {
    return 'op_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
  }

  recordOperationTime(operation, duration) {
    this.performanceMetrics.operation_times.push({
      operation,
      duration,
      timestamp: Date.now()
    });
    
    // Keep only recent operation times
    if (this.performanceMetrics.operation_times.length > 1000) {
      this.performanceMetrics.operation_times.splice(0, 500);
    }
  }

  recordParallelEfficiency(efficiency, operationCount, totalTime) {
    this.performanceMetrics.parallel_efficiency.push({
      efficiency,
      operation_count: operationCount,
      total_time: totalTime,
      timestamp: Date.now()
    });
    
    // Keep only recent efficiency metrics
    if (this.performanceMetrics.parallel_efficiency.length > 100) {
      this.performanceMetrics.parallel_efficiency.splice(0, 50);
    }
  }

  calculateAverageEfficiency() {
    const recent = this.performanceMetrics.parallel_efficiency.slice(-20);
    return recent.length > 0 ? 
      recent.reduce((sum, e) => sum + e.efficiency, 0) / recent.length : 0;
  }

  groupOperationsByType(operations) {
    const groups = new Map();
    
    for (const operation of operations) {
      const type = operation.type || 'default';
      if (!groups.has(type)) {
        groups.set(type, []);
      }
      groups.get(type).push(operation);
    }
    
    return groups;
  }

  groupByContextSimilarity(operations) {
    // Simplified grouping - could be enhanced with more sophisticated similarity matching
    const groups = [];
    
    for (const operation of operations) {
      let addedToGroup = false;
      
      for (const group of groups) {
        if (this.areOperationsSimilar(operation, group[0])) {
          group.push(operation);
          addedToGroup = true;
          break;
        }
      }
      
      if (!addedToGroup) {
        groups.push([operation]);
      }
    }
    
    return groups;
  }

  areOperationsSimilar(op1, op2) {
    // Simple similarity check - could be enhanced
    return op1.type === op2.type && 
           JSON.stringify(op1.context).substring(0, 100) === 
           JSON.stringify(op2.context).substring(0, 100);
  }

  extractSharedContext(operations) {
    // Extract common context elements
    return {
      shared: true,
      operations: operations.length
    };
  }

  extractContextVariation(operation, _sharedContext) {
    // Extract what's different about this operation
    return {
      operation_id: operation.id,
      specific_context: operation.context
    };
  }

  async executeSharedAgentSelection(sharedContext) {
    // Execute agent selection with shared context
    return { shared_result: true, context: sharedContext };
  }

  applyVariationToResult(sharedResult, variation) {
    // Apply operation-specific variation to shared result
    return {
      ...sharedResult,
      variation: variation,
      operation_id: variation.operation_id
    };
  }

  /**
   * Periodic maintenance tasks
   */
  performMaintenance() {
    this.optimizeMemoryUsage();
    this.monitorPerformance();
    this.cleanupExpiredCache();
    
    this.performanceMetrics.last_cleanup = Date.now();
  }

  cleanupExpiredCache() {
    const now = Date.now();
    const expired = [];
    
    for (const [key, value] of this.memoryCache.entries()) {
      if (now - value.timestamp > this.config.cache_ttl) {
        expired.push(key);
      }
    }
    
    expired.forEach(key => {
      this.memoryCache.delete(key);
      this.cacheStats.evictions++;
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.redis) {
      await this.redis.quit();
    }
    
    this.memoryCache.clear();
    this.activeOperations.clear();
    this.operationQueue.length = 0;
  }
}

export default PerformanceOptimizer;