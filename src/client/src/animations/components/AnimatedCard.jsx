import { motion } from 'framer-motion';
import { CARD_VARIANTS } from '../constants.js';
import { useReducedMotion } from '../hooks/useReducedMotion.js';

/**
 * Animated card component with hover and tap effects
 */
export function AnimatedCard({ 
  children, 
  className = '',
  variants = CARD_VARIANTS,
  whileHover = "hover",
  whileTap = "tap",
  ...props 
}) {
  const prefersReducedMotion = useReducedMotion();
  
  // If reduced motion is preferred, render static card
  if (prefersReducedMotion) {
    return (
      <div className={`card ${className}`} {...props}>
        {children}
      </div>
    );
  }
  
  return (
    <motion.div
      className={`card ${className}`}
      variants={variants}
      initial="initial"
      animate="animate"
      whileHover={whileHover}
      whileTap={whileTap}
      {...props}
    >
      {children}
    </motion.div>
  );
}