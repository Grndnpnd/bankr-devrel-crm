'use client';
import React from 'react';
import { motion } from 'framer-motion';

interface DataCardProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
}

const DataCard: React.FC<DataCardProps> = ({
  children,
  title,
  className = '',
  style = {},
  delay = 0,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay,
        ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
      }}
      className={`rounded-xl transition-all duration-200 ${className}`}
      style={{
        backgroundColor: '#1A1A1A',
        backgroundImage:
          'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3), 0 0 1px rgba(255,255,255,0.04)',
        padding: '24px',
        ...style,
      }}
      whileHover={{
        borderColor: 'rgba(255,255,255,0.1)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.06)',
      }}
    >
      {title && (
        <div
          className="uppercase mb-4"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '12px',
            fontWeight: 600,
            color: '#525252',
            letterSpacing: '0.06em',
          }}
        >
          {title}
        </div>
      )}
      {children}
    </motion.div>
  );
};

export default DataCard;
