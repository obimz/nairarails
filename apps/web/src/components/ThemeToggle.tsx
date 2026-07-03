/**
 * ThemeToggle.tsx - Modern theme toggle component
 * 
 * A glassmorphism-styled toggle for switching between light and dark modes
 * with smooth animations and accessibility features.
 */

import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface ThemeToggleProps {
  className?: string;
  showSystemOption?: boolean;
}

export function ThemeToggle({ className = '', showSystemOption = false }: ThemeToggleProps) {
  const { theme, setTheme, toggleTheme, isSystemTheme, setIsSystemTheme } = useTheme();

  if (showSystemOption) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex items-center rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-1 dark:border-white/10 dark:bg-white/5 light:border-slate-200 light:bg-white/80">
          {[
            { id: 'system', icon: Monitor, label: 'System' },
            { id: 'light', icon: Sun, label: 'Light' },
            { id: 'dark', icon: Moon, label: 'Dark' }
          ].map(({ id, icon: Icon, label }) => {
            const isActive = id === 'system' 
              ? isSystemTheme 
              : !isSystemTheme && theme === id;
            
            return (
              <button
                key={id}
                onClick={() => {
                  if (id === 'system') {
                    setIsSystemTheme(true);
                  } else {
                    setTheme(id as 'light' | 'dark');
                  }
                }}
                className={`
                  relative flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200
                  hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#16A97B]/50 focus:ring-offset-1
                  dark:hover:bg-white/10 light:hover:bg-slate-100
                  ${isActive 
                    ? 'bg-[#16A97B] text-black shadow-lg shadow-emerald-500/25 dark:bg-[#16A97B] light:bg-[#16A97B]' 
                    : 'text-slate-400 dark:text-slate-400 light:text-slate-600'
                  }
                `}
                aria-label={`Switch to ${label.toLowerCase()} theme`}
                aria-pressed={isActive}
              >
                <Icon className="w-4 h-4" />
                {isActive && (
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-white/20 to-transparent" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className={`
        relative inline-flex items-center justify-center w-10 h-10 rounded-xl 
        border border-white/10 bg-white/5 backdrop-blur-sm
        hover:bg-white/10 hover:border-white/20
        focus:outline-none focus:ring-2 focus:ring-[#16A97B]/50 focus:ring-offset-2 focus:ring-offset-transparent
        transition-all duration-200 cursor-pointer group
        dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 dark:hover:border-white/20
        light:border-slate-200 light:bg-white/80 light:hover:bg-white light:hover:border-slate-300
        ${className}
      `}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      aria-pressed={false}
    >
      {/* Icons with smooth transitions */}
      <div className="relative w-5 h-5">
        <Sun className={`
          absolute inset-0 w-5 h-5 transition-all duration-300
          ${theme === 'light' 
            ? 'opacity-100 rotate-0 scale-100 text-amber-500' 
            : 'opacity-0 rotate-90 scale-75 text-slate-400'
          }
        `} />
        <Moon className={`
          absolute inset-0 w-5 h-5 transition-all duration-300
          ${theme === 'dark' 
            ? 'opacity-100 rotate-0 scale-100 text-blue-400' 
            : 'opacity-0 -rotate-90 scale-75 text-slate-400'
          }
        `} />
      </div>

      {/* Hover glow effect */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
    </button>
  );
}