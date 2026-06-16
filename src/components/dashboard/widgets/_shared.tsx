'use client';
import React from 'react';

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];

const AnimatedNumber: React.FC<{
  value: number;
  duration?: number;
  delay?: number;
  prefix?: string;
  suffix?: string;
  color?: string;
}> = ({ value, duration = 800, delay = 0, prefix = '', suffix = '', color }) => {
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    const start = performance.now() + delay;
    const animate = (now: number) => {
      const elapsed = now - start;
      if (elapsed < 0) {
        requestAnimationFrame(animate);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value, duration, delay]);

  return (
    <span style={{ color }}>
      {prefix}
      {display.toLocaleString()}
      {suffix}
    </span>
  );
};


export { AnimatedNumber, EASE };
