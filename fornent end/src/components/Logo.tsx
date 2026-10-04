import React from 'react';

interface LogoProps {
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  subtitle = 'Emergency Dispatch',
  size = 'md',
  className = '',
}) => {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
  };

  const titleSizes = {
    sm: 'text-sm font-bold tracking-tight',
    md: 'text-base font-bold tracking-tight',
    lg: 'text-xl font-extrabold tracking-tight',
  };

  const subtitleSizes = {
    sm: 'text-[9px] tracking-wider font-semibold',
    md: 'text-[11px] tracking-widest font-semibold',
    lg: 'text-xs tracking-widest font-semibold',
  };

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Emblem */}
      <div
        className={`${iconSizes[size]} bg-[#0f172a] rounded-lg p-1.5 flex items-center justify-center shadow-sm relative overflow-hidden flex-shrink-0`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Shield Outline */}
          <path
            d="M12 2L4 5V11.5C4 16.5 7.4 21.1 12 22.3C16.6 21.1 20 16.5 20 11.5V5L12 2Z"
            fill="#2563EB"
          />
          {/* Emergency Cross inside Shield */}
          <path
            d="M11 7H13V11H17V13H13V17H11V13H7V11H11V7Z"
            fill="#FFFFFF"
          />
        </svg>
      </div>

      {/* Brand Typography */}
      <div className="flex flex-col leading-none">
        <span className={`text-[#0b1c30] uppercase font-display ${titleSizes[size]}`}>
          SAHAYAK
        </span>
        {subtitle && (
          <span className={`text-[#45464d] uppercase font-sans mt-0.5 ${subtitleSizes[size]}`}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
};
