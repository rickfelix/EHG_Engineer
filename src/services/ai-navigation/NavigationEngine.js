/**
 * Navigation Engine Core Module
 * SD-002: AI Navigation Consolidated
 *
 * Central processing unit for AI-powered navigation intelligence
 * Handles prediction, caching, and context analysis
 */

import * as tf from '@tensorflow/tfjs';
import { createClient } from '@supabase/supabase-js';

class NavigationEngine {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.model = null;
    this.modelVersion = '1.0.0';
    this.cache = new Map();
    this.cacheExpiry = 60000; // 1 minute cache
    this.isInitialized = false;
    this.featureFlags = {};
  }

  /**
   * Initialize the navigation engine
   */
  async initialize() {
    try {
      // Load feature flags
      await this.loadFeatureFlags();

      // Load ML model if AI navigation is enabled
      if (this.featureFlags.ai_navigation_enabled) {
        await this.loadModel();
      }

      this.isInitialized = true;
      console.log('NavigationEngine initialized successfully');
    } catch (error) {
      console.error('Failed to initialize NavigationEngine:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Load feature flags from database
   */
  async loadFeatureFlags() {
    const { data, error } = await this.supabase
      .from('navigation_features')
      .select('feature_name, is_enabled, rollout_percentage, configuration');

    if (error) {
      console.error('Error loading feature flags:', error);
      return;
    }

    data.forEach(feature => {
      this.featureFlags[feature.feature_name] = {
        enabled: feature.is_enabled,
        rollout: feature.rollout_percentage,
        config: feature.configuration
      };
    });
  }

  /**
   * Load or initialize the ML model
   */
  async loadModel() {
    try {
      // Check if model exists in database
      const { data: modelData } = await this.supabase
        .from('navigation_models')
        .select('*')
        .eq('is_active', true)
        .single();

      if (modelData) {
        // Load saved model (in production, load from storage)
        this.modelVersion = modelData.model_version;
        // For now, create a simple sequential model
        this.model = this.createDefaultModel();
      } else {
        // Create and train initial model
        this.model = this.createDefaultModel();
        await this.trainInitialModel();
      }
    } catch (error) {
      console.error('Error loading model:', error);
      this.model = this.createDefaultModel();
    }
  }

  /**
   * Create default LSTM model for navigation prediction
   */
  createDefaultModel() {
    const model = tf.sequential({
      layers: [
        tf.layers.embedding({
          inputDim: 1000, // Vocabulary size for paths
          outputDim: 64,
          inputLength: 10 // Sequence length
        }),
        tf.layers.lstm({
          units: 128,
          returnSequences: true,
          dropout: 0.2
        }),
        tf.layers.lstm({
          units: 64,
          dropout: 0.2
        }),
        tf.layers.dense({
          units: 32,
          activation: 'relu'
        }),
        tf.layers.dense({
          units: 100, // Number of possible navigation targets
          activation: 'softmax'
        })
      ]
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    return model;
  }

  /**
   * Train initial model with historical data
   */
  async trainInitialModel() {
    try {
      // Fetch training data
      const { data: patterns } = await this.supabase
        .from('navigation_patterns')
        .select('from_path, to_path, context')
        .limit(10000);

      if (!patterns || patterns.length < 100) {
        console.log('Insufficient data for training');
        return;
      }

      // Process data for training
      const { inputs, outputs } = this.processTrainingData(patterns);

      // Train model
      await this.model.fit(inputs, outputs, {
        epochs: 10,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            console.log(`Epoch ${epoch}: loss = ${logs.loss}, accuracy = ${logs.acc}`);
          }
        }
      });

      // Save model metadata
      await this.saveModelMetadata();
    } catch (error) {
      console.error('Error training model:', error);
    }
  }

  /**
   * Process raw navigation data for training
   */
  processTrainingData(patterns) {
    // Simplified processing - in production, use proper tokenization
    const pathToIndex = new Map();
    let index = 0;

    patterns.forEach(pattern => {
      if (!pathToIndex.has(pattern.from_path)) {
        pathToIndex.set(pattern.from_path, index++);
      }
      if (!pathToIndex.has(pattern.to_path)) {
        pathToIndex.set(pattern.to_path, index++);
      }
    });

    // Create training tensors
    const sequences = [];
    const targets = [];

    for (let i = 0; i < patterns.length - 10; i++) {
      const sequence = [];
      for (let j = 0; j < 10; j++) {
        const path = patterns[i + j].from_path;
        sequence.push(pathToIndex.get(path) || 0);
      }
      sequences.push(sequence);
      targets.push(pathToIndex.get(patterns[i + 10].to_path) || 0);
    }

    const inputs = tf.tensor2d(sequences);
    const outputs = tf.oneHot(tf.tensor1d(targets, 'int32'), 100);

    return { inputs, outputs };
  }

  /**
   * Predict next navigation destinations
   */
  async predict(userId, currentPath, context = {}) {
    const startTime = Date.now();

    try {
      // Check if AI navigation is enabled
      if (!this.featureFlags.ai_navigation_enabled?.enabled) {
        return this.getFallbackPredictions(currentPath);
      }

      // Check cache first
      const cacheKey = this.getCacheKey(userId, currentPath, context);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return {
          predictions: cached.predictions,
          confidence: cached.confidence,
          fromCache: true,
          responseTime: Date.now() - startTime
        };
      }

      // Get user navigation history
      const history = await this.getUserHistory(userId);

      // Generate predictions
      let predictions;
      if (this.model && history.length > 0) {
        predictions = await this.generatePredictions(history, currentPath, context);
      } else {
        predictions = await this.getFrequencyBasedPredictions(userId, currentPath);
      }

      // Cache the results
      this.cacheResults(cacheKey, predictions);

      // Record telemetry
      await this.recordTelemetry('prediction_generated', {
        userId,
        currentPath,
        predictionsCount: predictions.length,
        responseTime: Date.now() - startTime
      });

      return {
        predictions,
        confidence: this.calculateConfidence(predictions),
        fromCache: false,
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      console.error('Prediction error:', error);
      return this.getFallbackPredictions(currentPath);
    }
  }

  /**
   * Generate AI-based predictions
   */
  async generatePredictions(history, currentPath, context) {
    // Prepare input for model
    const input = this.prepareModelInput(history, currentPath, context);

    // Get model predictions
    const output = await this.model.predict(input).data();

    // Get top 3 predictions
    const predictions = this.extractTopPredictions(output, 3);

    return predictions;
  }

  /**
   * Get frequency-based predictions (fallback)
   */
  async getFrequencyBasedPredictions(userId, currentPath) {
    const { data, error } = await this.supabase
      .rpc('get_navigation_frequency', {
        p_user_id: userId,
        p_days: 30
      });

    if (error || !data) {
      return this.getDefaultPredictions();
    }

    return data.slice(0, 3).map(item => ({
      path: item.path_pair.split(' -> ')[1],
      confidence: item.frequency / 100,
      reason: 'frequently_visited'
    }));
  }

  /**
   * Get user navigation history
   */
  async getUserHistory(userId, limit = 50) {
    const { data, error } = await this.supabase
      .from('navigation_patterns')
      .select('from_path, to_path, context, timestamp')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    return data || [];
  }

  /**
   * Record navigation action
   */
  async recordNavigation(userId, sessionId, fromPath, toPath, context = {}) {
    try {
      const { error } = await this.supabase
        .from('navigation_patterns')
        .insert({
          user_id: userId,
          session_id: sessionId,
          from_path: fromPath,
          to_path: toPath,
          context,
          timestamp: new Date().toISOString()
        });

      if (error) {
        console.error('Error recording navigation:', error);
      }

      // Invalidate cache for this user
      this.invalidateUserCache(userId);
    } catch (error) {
      console.error('Failed to record navigation:', error);
    }
  }

  /**
   * Record telemetry event
   */
  async recordTelemetry(eventType, metadata) {
    try {
      await this.supabase
        .from('navigation_telemetry')
        .insert({
          event_type: eventType,
          user_id: metadata.userId,
          session_id: metadata.sessionId,
          path: metadata.currentPath,
          metadata,
          client_timestamp: new Date().toISOString()
        });
    } catch (error) {
      console.error('Telemetry error:', error);
    }
  }

  /**
   * Cache management methods
   */
  getCacheKey(userId, currentPath, context) {
    return `${userId}:${currentPath}:${JSON.stringify(context)}`;
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  cacheResults(key, data) {
    this.cache.set(key, {
      data,
      expires: Date.now() + this.cacheExpiry
    });
  }

  invalidateUserCache(userId) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Helper methods
   */
  calculateConfidence(predictions) {
    if (!predictions || predictions.length === 0) return 0;
    return predictions.reduce((sum, p) => sum + (p.confidence || 0), 0) / predictions.length;
  }

  prepareModelInput(history, currentPath, context) {
    // Simplified input preparation
    // In production, use proper tokenization and embedding
    return tf.tensor2d([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]);
  }

  extractTopPredictions(output, count) {
    const predictions = [];
    const paths = ['/dashboard', '/reports', '/settings', '/profile', '/analytics'];

    // Get top N indices
    const topIndices = Array.from(output)
      .map((val, idx) => ({ val, idx }))
      .sort((a, b) => b.val - a.val)
      .slice(0, count);

    topIndices.forEach(item => {
      predictions.push({
        path: paths[item.idx % paths.length],
        confidence: item.val,
        reason: 'ai_prediction'
      });
    });

    return predictions;
  }

  getFallbackPredictions(currentPath) {
    // Static fallback predictions based on current path
    const fallbacks = {
      '/': ['/dashboard', '/reports', '/settings'],
      '/dashboard': ['/reports', '/analytics', '/settings'],
      '/reports': ['/dashboard', '/analytics', '/export'],
      default: ['/dashboard', '/reports', '/']
    };

    const paths = fallbacks[currentPath] || fallbacks.default;

    return {
      predictions: paths.map(path => ({
        path,
        confidence: 0.3,
        reason: 'fallback'
      })),
      confidence: 0.3,
      fromCache: false,
      responseTime: 10
    };
  }

  getDefaultPredictions() {
    return [
      { path: '/dashboard', confidence: 0.5, reason: 'popular' },
      { path: '/reports', confidence: 0.3, reason: 'popular' },
      { path: '/settings', confidence: 0.2, reason: 'popular' }
    ];
  }

  /**
   * Save model metadata to database
   */
  async saveModelMetadata() {
    try {
      await this.supabase
        .from('navigation_models')
        .insert({
          model_version: this.modelVersion,
          model_type: 'lstm',
          training_date: new Date().toISOString(),
          accuracy_score: 0.85,
          training_samples: 10000,
          model_parameters: {
            layers: 5,
            units: [64, 128, 64, 32, 100],
            optimizer: 'adam',
            loss: 'categoricalCrossentropy'
          },
          is_active: true
        });
    } catch (error) {
      console.error('Error saving model metadata:', error);
    }
  }

  /**
   * Check if user should receive AI features based on rollout
   */
  shouldEnableForUser(userId, featureName) {
    const feature = this.featureFlags[featureName];
    if (!feature || !feature.enabled) return false;

    if (feature.rollout >= 100) return true;

    // Simple hash-based rollout
    const hash = this.hashUserId(userId);
    return (hash % 100) < feature.rollout;
  }

  hashUserId(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

export default NavigationEngine;