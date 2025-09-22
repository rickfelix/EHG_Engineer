/**
 * Animation utilities and constants for LEO Protocol Dashboard
 * Following Material Design motion principles
 */

// Animation durations (in seconds)
export const duration = {
  instant: 0,
  faster: 0.1,
  fast: 0.2,
  normal: 0.3,
  slow: 0.4,
  slower: 0.6,
  verySlow: 0.8
};

// Easing functions - using Framer Motion's defaults and custom curves
export const easing = {
  // Standard easing
  ease: [0.4, 0, 0.2, 1],           // Material Design standard
  easeIn: [0.4, 0, 1, 1],           // Accelerate
  easeOut: [0, 0, 0.2, 1],          // Decelerate
  easeInOut: [0.4, 0, 0.2, 1],      // Standard curve
  
  // Emphasis easing
  sharp: [0.4, 0, 0.6, 1],          // Quick actions
  smooth: [0.25, 0.1, 0.25, 1],     // Smooth transitions
  
  // Spring physics
  spring: {
    type: "spring",
    stiffness: 500,
    damping: 30
  },
  springGentle: {
    type: "spring",
    stiffness: 300,
    damping: 25
  },
  springBouncy: {
    type: "spring",
    stiffness: 600,
    damping: 20
  }
};

// Animation variants for common patterns
export const variants = {
  // Fade variants
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  },
  
  // Slide variants
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  },
  
  slideDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 }
  },
  
  slideLeft: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 }
  },
  
  slideRight: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 }
  },
  
  // Scale variants
  scaleIn: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 }
  },
  
  // Stagger children
  staggerContainer: {
    animate: {
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1
      }
    }
  },
  
  staggerItem: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 }
  }
};

// Page transition variants
export const pageTransition = {
  initial: { opacity: 0, x: -10 },
  animate: { 
    opacity: 1, 
    x: 0,
    transition: {
      duration: duration.normal,
      ease: easing.easeOut
    }
  },
  exit: { 
    opacity: 0, 
    x: 10,
    transition: {
      duration: duration.fast,
      ease: easing.easeIn
    }
  }
};

// Card hover animation
export const cardHover = {
  rest: {
    scale: 1,
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)"
  },
  hover: {
    scale: 1.02,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.15)",
    transition: {
      duration: duration.fast,
      ease: easing.easeOut
    }
  },
  tap: {
    scale: 0.98,
    transition: {
      duration: duration.instant,
      ease: easing.easeIn
    }
  }
};

// Button animations
export const buttonAnimation = {
  rest: { scale: 1 },
  hover: { 
    scale: 1.05,
    transition: {
      duration: duration.fast,
      ease: easing.spring
    }
  },
  tap: { 
    scale: 0.95,
    transition: {
      duration: duration.instant
    }
  }
};

// Loading animation
export const loadingAnimation = {
  animate: {
    rotate: 360,
    transition: {
      duration: 1,
      ease: "linear",
      repeat: Infinity
    }
  }
};

// Skeleton loading animation
export const skeletonAnimation = {
  animate: {
    backgroundPosition: ["200% 0", "-200% 0"],
    transition: {
      duration: 1.5,
      ease: "linear",
      repeat: Infinity
    }
  }
};

// Check if user prefers reduced motion
export const shouldReduceMotion = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// Get appropriate animation config based on user preference
export const getAnimationConfig = (config) => {
  if (shouldReduceMotion()) {
    // Return instant transitions for reduced motion
    return {
      ...config,
      transition: { duration: 0 }
    };
  }
  return config;
};

// Animation performance monitor
export class AnimationPerformanceMonitor {
  constructor() {
    this.metrics = {
      frameDrops: 0,
      averageFPS: 60,
      animationCount: 0
    };
    this.isMonitoring = false;
  }
  
  start() {
    if (this.isMonitoring || typeof window === 'undefined') return;
    
    this.isMonitoring = true;
    let lastTime = performance.now();
    let frames = 0;
    
    const measureFPS = () => {
      if (!this.isMonitoring) return;
      
      frames++;
      const currentTime = performance.now();
      
      if (currentTime >= lastTime + 1000) {
        this.metrics.averageFPS = Math.round((frames * 1000) / (currentTime - lastTime));
        if (this.metrics.averageFPS < 30) {
          this.metrics.frameDrops++;
          console.warn(`Performance warning: FPS dropped to ${this.metrics.averageFPS}`);
        }
        frames = 0;
        lastTime = currentTime;
      }
      
      requestAnimationFrame(measureFPS);
    };
    
    requestAnimationFrame(measureFPS);
  }
  
  stop() {
    this.isMonitoring = false;
  }
  
  logMetrics() {
    console.log('Animation Performance Metrics:', this.metrics);
  }
}

// Create singleton instance
export const animationMonitor = new AnimationPerformanceMonitor();

// Export motion components with performance tracking
export const trackAnimation = (Component) => {
  return (props) => {
    if (animationMonitor.isMonitoring) {
      animationMonitor.metrics.animationCount++;
    }
    return Component(props);
  };
};