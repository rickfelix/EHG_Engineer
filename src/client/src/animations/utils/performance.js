import { PERFORMANCE_THRESHOLDS } from '../constants.js';

/**
 * Animation Performance Monitor
 * Tracks FPS and provides recommendations for animation optimization
 */
export class AnimationPerformanceMonitor {
  constructor() {
    this.frameRates = [];
    this.isMonitoring = false;
    this.rafId = null;
    this.lastFrameTime = 0;
    this.callbacks = new Set();
    this.performanceData = {
      currentFPS: 60,
      averageFPS: 60,
      minFPS: 60,
      maxFPS: 60,
      droppedFrames: 0,
      totalFrames: 0,
      shouldReduceAnimations: false
    };
  }

  /**
   * Start monitoring animation performance
   */
  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.lastFrameTime = performance.now();
    this.monitor();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    this.isMonitoring = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Main monitoring loop
   */
  monitor() {
    if (!this.isMonitoring) return;

    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastFrameTime;
    
    if (deltaTime > 0) {
      const currentFPS = Math.round(1000 / deltaTime);
      
      // Add to rolling buffer (keep last 60 samples)
      this.frameRates.push(currentFPS);
      if (this.frameRates.length > 60) {
        this.frameRates.shift();
      }
      
      // Update performance data
      this.updatePerformanceData(currentFPS);
      
      // Notify callbacks if performance changes significantly
      this.notifyCallbacks();
    }
    
    this.lastFrameTime = currentTime;
    this.rafId = requestAnimationFrame(() => this.monitor());
  }

  /**
   * Update performance metrics
   */
  updatePerformanceData(currentFPS) {
    this.performanceData.currentFPS = currentFPS;
    this.performanceData.totalFrames++;
    
    if (this.frameRates.length > 0) {
      const sum = this.frameRates.reduce((a, b) => a + b, 0);
      this.performanceData.averageFPS = Math.round(sum / this.frameRates.length);
      this.performanceData.minFPS = Math.min(...this.frameRates);
      this.performanceData.maxFPS = Math.max(...this.frameRates);
    }
    
    // Count dropped frames (below target FPS)
    if (currentFPS < PERFORMANCE_THRESHOLDS.targetFPS) {
      this.performanceData.droppedFrames++;
    }
    
    // Determine if we should reduce animations
    this.performanceData.shouldReduceAnimations = 
      this.performanceData.averageFPS < PERFORMANCE_THRESHOLDS.minFPS;
  }

  /**
   * Get current performance data
   */
  getPerformanceData() {
    return { ...this.performanceData };
  }

  /**
   * Get average FPS over the monitoring period
   */
  getAverageFPS() {
    return this.performanceData.averageFPS;
  }

  /**
   * Check if animations should be reduced
   */
  shouldReduceAnimations() {
    return this.performanceData.shouldReduceAnimations;
  }

  /**
   * Get performance level (high, medium, low)
   */
  getPerformanceLevel() {
    const avgFPS = this.performanceData.averageFPS;
    
    if (avgFPS >= PERFORMANCE_THRESHOLDS.targetFPS) {
      return 'high';
    } else if (avgFPS >= PERFORMANCE_THRESHOLDS.warningFPS) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Subscribe to performance updates
   */
  subscribe(callback) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Notify all subscribers of performance changes
   */
  notifyCallbacks() {
    const data = this.getPerformanceData();
    this.callbacks.forEach(callback => callback(data));
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.frameRates = [];
    this.performanceData = {
      currentFPS: 60,
      averageFPS: 60,
      minFPS: 60,
      maxFPS: 60,
      droppedFrames: 0,
      totalFrames: 0,
      shouldReduceAnimations: false
    };
  }
}

// Singleton instance
let monitorInstance = null;

/**
 * Get or create the performance monitor instance
 */
export function getPerformanceMonitor() {
  if (!monitorInstance) {
    monitorInstance = new AnimationPerformanceMonitor();
  }
  return monitorInstance;
}

/**
 * Hook to use performance monitoring in React components
 */
export function useAnimationPerformance() {
  const [performanceData, setPerformanceData] = useState(() => 
    getPerformanceMonitor().getPerformanceData()
  );
  
  useEffect(() => {
    const monitor = getPerformanceMonitor();
    
    // Subscribe to updates
    const unsubscribe = monitor.subscribe(setPerformanceData);
    
    // Start monitoring if not already
    monitor.startMonitoring();
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  return performanceData;
}

/**
 * Utility to measure specific animation performance
 */
export class AnimationTimer {
  constructor(name) {
    this.name = name;
    this.startTime = 0;
    this.endTime = 0;
    this.duration = 0;
  }
  
  start() {
    this.startTime = performance.now();
  }
  
  end() {
    this.endTime = performance.now();
    this.duration = this.endTime - this.startTime;
    
    // Log if animation took too long
    if (this.duration > 16.67) { // More than one frame at 60fps
      console.warn(`Animation "${this.name}" took ${this.duration.toFixed(2)}ms (target: <16.67ms)`);
    }
    
    return this.duration;
  }
  
  getDuration() {
    return this.duration;
  }
}

/**
 * Debounce animations based on performance
 */
export function performanceDebounce(func, delay = PERFORMANCE_THRESHOLDS.debounceDelay) {
  let timeoutId;
  let lastCallTime = 0;
  
  return function(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;
    
    // If performance is low, increase debounce delay
    const monitor = getPerformanceMonitor();
    const adjustedDelay = monitor.shouldReduceAnimations() ? delay * 2 : delay;
    
    clearTimeout(timeoutId);
    
    if (timeSinceLastCall >= adjustedDelay) {
      func.apply(this, args);
      lastCallTime = now;
    } else {
      timeoutId = setTimeout(() => {
        func.apply(this, args);
        lastCallTime = Date.now();
      }, adjustedDelay - timeSinceLastCall);
    }
  };
}

// Missing import for React hooks
import { useState, useEffect } from 'react';