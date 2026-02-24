import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type AppBackgroundProps = {
  children: ReactNode;
  className?: string;
};

export function AppBackground({ children, className }: AppBackgroundProps) {
  return (
    <div className={cn("relative min-h-screen w-full bg-background-primary text-text-primary", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 app-bg-glow" />
        <div className="absolute inset-0 app-bg-grid" />
        <div className="absolute inset-0 app-bg-candles app-bg-pan" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
