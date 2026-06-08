import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 40, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`select-none ${className}`}
      aria-label="Birtingur Logo"
    >
      <defs>
        {/* Spine gradient: Deep Navy to Royal Blue */}
        <linearGradient id="spine-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#1e40af" />
        </linearGradient>

        {/* Top fold gradient: Sky Blue to Lighter Sky Blue */}
        <linearGradient id="top-fold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>

        {/* Top loop gradient: Royal Blue to Medium Blue */}
        <linearGradient id="top-loop-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>

        {/* Middle fold gradient: Vibrant Cyan to Teal */}
        <linearGradient id="mid-fold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>

        {/* Bottom loop gradient: Teal to Medium Blue */}
        <linearGradient id="bottom-loop-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>

        {/* Bottom fold gradient: Medium Blue to Dark Navy */}
        <linearGradient id="bottom-fold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>

        {/* Overlap drop shadow for depth */}
        <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow
            dx="-0.5"
            dy="1.5"
            stdDeviation="1.5"
            floodColor="#0f172a"
            floodOpacity="0.25"
          />
        </filter>
        <filter id="shadow-deep" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="-1"
            dy="2.5"
            stdDeviation="2.5"
            floodColor="#0f172a"
            floodOpacity="0.35"
          />
        </filter>
      </defs>

      {/* 1. Left Vertical Stem (Spine) */}
      <rect x="20" y="14" width="12" height="72" rx="3" fill="url(#spine-grad)" />

      {/* 2. Top Horizontal Fold (Underlay) */}
      <path d="M 32 14 L 62 14 L 50 28 L 32 28 Z" fill="url(#top-fold-grad)" />

      {/* 3. Top Loop Outer Fold (Rhombus) */}
      <path
        d="M 62 14 L 78 30 L 62 46 L 46 30 Z"
        fill="url(#top-loop-grad)"
        filter="url(#shadow)"
      />

      {/* 4. Middle Horizontal Fold */}
      <path
        d="M 32 46 L 62 46 L 50 60 L 32 60 Z"
        fill="url(#mid-fold-grad)"
        filter="url(#shadow)"
      />

      {/* 5. Bottom Loop Outer Fold */}
      <path
        d="M 62 46 L 82 66 L 62 86 L 42 66 Z"
        fill="url(#bottom-loop-grad)"
        filter="url(#shadow-deep)"
      />

      {/* 6. Bottom Horizontal Fold */}
      <path d="M 32 72 L 62 86 L 32 86 Z" fill="url(#bottom-fold-grad)" />
    </svg>
  );
};

export default Logo;
