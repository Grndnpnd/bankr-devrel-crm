'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Download, Link as LinkIcon, Plus } from 'lucide-react';
import DataCard from '@/components/DataCard';
import { EASE } from './_shared';

const QuickActions: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.2, duration: 0.3, ease: EASE }}
      className="flex items-center justify-center gap-3"
      style={{ height: '48px', marginTop: '24px' }}
    >
      <button
        className="flex items-center gap-2 rounded-md px-4 py-2 transition-all duration-150"
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '13px',
          fontWeight: 600,
          color: '#0D0D0D',
          backgroundColor: '#F5A623',
          letterSpacing: '0.01em',
          border: 'none',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#E8941A';
          e.currentTarget.style.boxShadow = '0 0 20px rgba(245,166,35,0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#F5A623';
          e.currentTarget.style.boxShadow = 'none';
        }}
        title="Import from Google Sheets"
      >
        <Download size={16} />
        Import from Google Sheets
      </button>

      <button
        className="flex items-center gap-2 rounded-md px-4 py-2 transition-all duration-150"
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '13px',
          fontWeight: 600,
          color: '#F0F0F0',
          backgroundColor: 'transparent',
          letterSpacing: '0.01em',
          border: '1px solid rgba(255,255,255,0.1)',
          cursor: 'not-allowed',
          opacity: 0.5,
        }}
        title="Coming soon — Plain form expansion in progress"
        disabled
      >
        <LinkIcon size={16} />
        Connect Plain API
      </button>

      <button
        className="flex items-center gap-2 rounded-md px-4 py-2 transition-all duration-150"
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '13px',
          fontWeight: 600,
          color: '#F0F0F0',
          backgroundColor: 'transparent',
          letterSpacing: '0.01em',
          border: '1px solid rgba(255,255,255,0.1)',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#222';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
        title="Add Submission Manually"
      >
        <Plus size={16} />
        Add Submission Manually
      </button>
    </motion.div>
  );
};


export default QuickActions;
