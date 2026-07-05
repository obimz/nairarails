/**
 * Logo.tsx — NairaRails brand mark + wordmark.
 *
 * The mark: a payment rail that splits into three — one track in, three out.
 * Represents the core product: a single payment automatically routed to
 * seller, platform, and rider. Compact enough to work at 24px, distinctive
 * enough to be recognisable at a glance.
 *
 * Usage:
 *   <LogoMark size={28} />                    — icon only
 *   <LogoMark size={28} className="..." />
 */

import React from "react";

interface LogoMarkProps {
  /** Pixel size of the bounding square. Default 28. */
  size?: number;
  className?: string;
}

export function LogoMark({ size = 28, className = "" }: LogoMarkProps) {
  return (
    <div
      className={`flex items-center justify-center rounded-lg shrink-0 ${className}`}
      style={{
        width:      size,
        height:     size,
        background: "#16A97B",
        // Subtle inner shadow so the icon doesn't float
        boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.15)",
      }}
      aria-hidden="true"
    >
      {/* Rail-split SVG — one track in, three out */}
      <svg
        width={Math.round(size * 0.6)}
        height={Math.round(size * 0.6)}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Single input rail coming in from the left */}
        <line x1="0" y1="8" x2="5" y2="8" stroke="black" strokeWidth="2" strokeLinecap="round" />

        {/* Junction node */}
        <circle cx="6" cy="8" r="1.2" fill="black" />

        {/* Three diverging output rails */}
        {/* Top rail */}
        <line x1="6.8" y1="7.4" x2="16" y2="3" stroke="black" strokeWidth="1.5" strokeLinecap="round" />
        {/* Middle rail — straight through */}
        <line x1="7" y1="8" x2="16" y2="8" stroke="black" strokeWidth="1.5" strokeLinecap="round" />
        {/* Bottom rail */}
        <line x1="6.8" y1="8.6" x2="16" y2="13" stroke="black" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/**
 * Full lockup: mark + "NairaRails" wordmark side by side.
 */
interface LogoLockupProps {
  size?: number;
  textSize?: string; // Tailwind text-* class e.g. "text-sm"
  className?: string;
}

export function LogoLockup({ size = 28, textSize = "text-sm", className = "" }: LogoLockupProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span
        className={`font-bold font-display ${textSize}`}
        style={{ color: "var(--text-primary)" }}
      >
        NairaRails
      </span>
    </div>
  );
}
