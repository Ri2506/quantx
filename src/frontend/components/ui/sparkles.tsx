"use client";

import { cn } from "@/lib/utils";

type SparklesProps = {
  className?: string;
  size?: number;
  minSize?: number | null;
  density?: number;
  speed?: number;
  minSpeed?: number | null;
  direction?: string;
  opacity?: number;
  opacitySpeed?: number;
  minOpacity?: number | null;
  color?: string;
  background?: string;
  options?: Record<string, unknown>;
};

export function Sparkles({
  className,
  opacity = 0.7,
  background = "transparent",
}: SparklesProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 mix-blend-screen animate-float",
        className
      )}
      style={{
        opacity,
        backgroundColor: background,
        backgroundImage:
          "radial-gradient(circle at 20% 20%, rgba(var(--accent),0.35) 0, transparent 45%), radial-gradient(circle at 80% 30%, rgba(var(--primary),0.25) 0, transparent 40%), radial-gradient(circle at 55% 80%, rgba(255,255,255,0.18) 0, transparent 45%), radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px)",
        backgroundSize: "160px 160px, 220px 220px, 260px 260px, 24px 24px",
        backgroundRepeat: "repeat",
      }}
    />
  );
}
