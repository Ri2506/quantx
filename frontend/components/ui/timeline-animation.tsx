"use client";

import { motion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import { type ReactNode, type RefObject, createElement } from "react";

type TimelineContentProps = {
  as?: keyof JSX.IntrinsicElements;
  animationNum?: number;
  timelineRef?: RefObject<HTMLElement | null>;
  customVariants?: Variants;
  className?: string;
  children?: ReactNode;
};

export function TimelineContent({
  as: Component = "div",
  animationNum = 0,
  timelineRef,
  customVariants,
  className,
  children,
}: TimelineContentProps) {
  const MotionComponent = motion[Component as keyof typeof motion] || motion.div;
  
  return createElement(
    MotionComponent as any,
    {
      className: cn(className),
      variants: customVariants,
      initial: "hidden",
      whileInView: "visible",
      viewport: {
        once: true,
        amount: 0.25,
        root: timelineRef,
      },
      custom: animationNum,
    },
    children
  );
}
