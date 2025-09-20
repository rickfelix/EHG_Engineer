// Animation timing constants
export const ANIMATION_DURATION = {
  instant: 0,
  fast: 100,      // Reduced from 150
  normal: 200,    // Reduced from 300
  slow: 300,      // Reduced from 500
  verySlow: 500   // Reduced from 1000
};

// Animation easing functions
export const ANIMATION_EASING = {
  easeInOut: [0.4, 0, 0.2, 1],
  easeOut: [0, 0, 0.2, 1],
  easeIn: [0.4, 0, 1, 1],
  spring: { type: "spring", stiffness: 300, damping: 30 },
  bounce: { type: "spring", stiffness: 400, damping: 10 },
  smooth: { type: "spring", stiffness: 100, damping: 20 }
};

// Animation variants for common patterns
export const ANIMATION_VARIANTS = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: ANIMATION_DURATION.normal / 1000 }
  },
  
  slideUp: {
    initial: { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -20, opacity: 0 },
    transition: { 
      duration: ANIMATION_DURATION.normal / 1000,
      ease: ANIMATION_EASING.easeOut
    }
  },
  
  slideDown: {
    initial: { y: -20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: 20, opacity: 0 },
    transition: { 
      duration: ANIMATION_DURATION.normal / 1000,
      ease: ANIMATION_EASING.easeOut
    }
  },
  
  slideLeft: {
    initial: { x: 20, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: -20, opacity: 0 },
    transition: { 
      duration: ANIMATION_DURATION.normal / 1000,
      ease: ANIMATION_EASING.easeOut
    }
  },
  
  slideRight: {
    initial: { x: -20, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: 20, opacity: 0 },
    transition: { 
      duration: ANIMATION_DURATION.normal / 1000,
      ease: ANIMATION_EASING.easeOut
    }
  },
  
  scaleIn: {
    initial: { scale: 0.95, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.95, opacity: 0 },
    transition: { 
      duration: ANIMATION_DURATION.fast / 1000,
      ease: ANIMATION_EASING.easeInOut
    }
  },
  
  rotate: {
    initial: { rotate: -10, opacity: 0 },
    animate: { rotate: 0, opacity: 1 },
    exit: { rotate: 10, opacity: 0 },
    transition: { 
      duration: ANIMATION_DURATION.normal / 1000,
      ease: ANIMATION_EASING.spring
    }
  }
};

// Component-specific animation variants
export const CARD_VARIANTS = {
  initial: { y: 20, opacity: 0 },
  animate: { 
    y: 0, 
    opacity: 1,
    transition: {
      duration: ANIMATION_DURATION.normal / 1000,
      ease: ANIMATION_EASING.easeOut
    }
  },
  hover: {
    y: -2,
    scale: 1.02,
    boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
    transition: {
      duration: ANIMATION_DURATION.fast / 1000,
      ease: ANIMATION_EASING.easeOut
    }
  },
  tap: {
    scale: 0.98,
    transition: {
      duration: ANIMATION_DURATION.instant / 1000
    }
  }
};

export const BUTTON_VARIANTS = {
  initial: { scale: 1 },
  hover: { 
    scale: 1.05,
    transition: {
      duration: ANIMATION_DURATION.fast / 1000,
      ease: ANIMATION_EASING.easeOut
    }
  },
  tap: { 
    scale: 0.95,
    transition: {
      duration: ANIMATION_DURATION.instant / 1000
    }
  }
};

export const MODAL_VARIANTS = {
  backdrop: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: {
      duration: ANIMATION_DURATION.normal / 1000
    }
  },
  content: {
    initial: { scale: 0.9, opacity: 0, y: 20 },
    animate: { 
      scale: 1, 
      opacity: 1, 
      y: 0,
      transition: {
        duration: ANIMATION_DURATION.normal / 1000,
        ease: ANIMATION_EASING.spring
      }
    },
    exit: { 
      scale: 0.9, 
      opacity: 0, 
      y: 20,
      transition: {
        duration: ANIMATION_DURATION.fast / 1000,
        ease: ANIMATION_EASING.easeIn
      }
    }
  }
};

export const STAGGER_VARIANTS = {
  container: {
    animate: {
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1
      }
    }
  },
  item: {
    initial: { opacity: 0, y: 10 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: ANIMATION_DURATION.fast / 1000,
        ease: ANIMATION_EASING.easeOut
      }
    }
  }
};

// Performance thresholds
export const PERFORMANCE_THRESHOLDS = {
  targetFPS: 60,
  minFPS: 30,
  warningFPS: 45,
  maxConcurrentAnimations: 10,
  debounceDelay: 100
};

// Animation configuration
export const ANIMATION_CONFIG = {
  respectReducedMotion: true,
  enableGPUAcceleration: true,
  enableWillChange: true,
  enableLayoutAnimations: true,
  defaultTransition: {
    duration: ANIMATION_DURATION.normal / 1000,
    ease: ANIMATION_EASING.easeInOut
  }
};

// Export common animation presets
export const ANIMATION_SPRING = ANIMATION_EASING.spring;
export const fadeInUp = ANIMATION_VARIANTS.slideUp;
export const slideIn = ANIMATION_VARIANTS.slideLeft;
export const scaleIn = ANIMATION_VARIANTS.scaleIn;
export const staggerContainer = STAGGER_VARIANTS.container;
export const staggerItem = STAGGER_VARIANTS.item;