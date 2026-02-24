"use client";

import { motion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import { type ElementType, type HTMLAttributes, type ReactNode, type RefObject } from "react";

type TimelineContentProps = {
  as?: ElementType;
  animationNum?: number;
  timelineRef?: RefObject<Element>;
  customVariants?: Variants;
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>;

export function TimelineContent({
  as = "div",
  animationNum = 0,
  timelineRef,
  customVariants,
  className,
  children,
  ...props
}: TimelineContentProps) {
  const MotionComponent: any = motion(as as any);

  return (
    <MotionComponent
      className={cn(className)}
      variants={customVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{
        once: true,
        amount: 0.25,
        root: timelineRef,
      }}
      custom={animationNum}
      {...props}
    >
      {children}
    </MotionComponent>
  );
}
