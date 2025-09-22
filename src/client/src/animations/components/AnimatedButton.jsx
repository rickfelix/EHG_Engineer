import { motion } from 'framer-motion';
import { BUTTON_VARIANTS } from '../constants.js';
import { useReducedMotion } from '../hooks/useReducedMotion.js';

/**
 * Animated button component with hover and tap effects
 */
export function AnimatedButton({ 
  children, 
  className = '',
  onClick,
  variants = BUTTON_VARIANTS,
  disabled = false,
  type = 'button',
  ...props 
}) {
  const prefersReducedMotion = useReducedMotion();
  
  // If reduced motion is preferred, render static button
  if (prefersReducedMotion) {
    return (
      <button
        className={className}
        onClick={onClick}
        disabled={disabled}
        type={type}
        {...props}
      >
        {children}
      </button>
    );
  }
  
  return (
    <motion.button
      className={className}
      variants={variants}
      initial="initial"
      whileHover={!disabled ? "hover" : undefined}
      whileTap={!disabled ? "tap" : undefined}
      onClick={onClick}
      disabled={disabled}
      type={type}
      {...props}
    >
      {children}
    </motion.button>
  );
}