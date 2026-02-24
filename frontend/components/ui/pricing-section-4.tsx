"use client";

import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Check, Zap, Crown, Sparkles } from "lucide-react";
import Link from "next/link";
import ScrollReveal from "@/components/ui/ScrollReveal";

const plans = [
  {
    name: "Free",
    description: "Get started with AI-powered trading signals",
    price: 0,
    yearlyPrice: 0,
    buttonText: "Get Started Free",
    buttonVariant: "outline" as const,
    icon: Sparkles,
    accent: "neon-cyan",
    features: [
      "5 signals per day",
      "3 active positions",
      "View-only mode",
      "Email notifications",
      "Basic analytics",
      "NSE top 50 coverage",
      "Community support",
    ],
  },
  {
    name: "Starter",
    description: "For active traders who want an edge",
    price: 499,
    yearlyPrice: 4990,
    buttonText: "Start 7-Day Free Trial",
    buttonVariant: "default" as const,
    popular: true,
    icon: Zap,
    accent: "neon-green",
    features: [
      "20 signals per day",
      "5 active positions",
      "Semi-auto execution",
      "Email + Push notifications",
      "Advanced analytics",
      "NSE top 200 coverage",
      "Paper trading mode",
      "Priority support",
    ],
  },
  {
    name: "Pro",
    description: "Full institutional-grade intelligence",
    price: 1499,
    yearlyPrice: 14990,
    buttonText: "Start 7-Day Free Trial",
    buttonVariant: "default" as const,
    icon: Crown,
    accent: "neon-purple",
    features: [
      "Unlimited signals",
      "15 active positions",
      "Full-auto execution",
      "All notification channels",
      "Portfolio optimization",
      "NSE 500 + BSE coverage",
      "Broker integration",
      "API access",
      "Dedicated account manager",
    ],
  },
];

const PricingSwitch = ({
  isYearly,
  onSwitch,
}: {
  isYearly: boolean;
  onSwitch: (value: boolean) => void;
}) => {
  return (
    <div className="flex items-center justify-center gap-4">
      <div className="relative z-10 flex rounded-full bg-background-elevated/80 border border-white/[0.06] p-1">
        <button
          type="button"
          onClick={() => onSwitch(false)}
          className={cn(
            "relative z-10 rounded-full px-5 py-2.5 text-sm font-medium transition-colors",
            !isYearly ? "text-space-void" : "text-text-secondary hover:text-text-primary"
          )}
        >
          {!isYearly && (
            <motion.span
              layoutId="pricing-switch"
              className="absolute inset-0 rounded-full bg-gradient-to-r from-neon-cyan to-neon-green"
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative">Monthly</span>
        </button>
        <button
          type="button"
          onClick={() => onSwitch(true)}
          className={cn(
            "relative z-10 rounded-full px-5 py-2.5 text-sm font-medium transition-colors",
            isYearly ? "text-space-void" : "text-text-secondary hover:text-text-primary"
          )}
        >
          {isYearly && (
            <motion.span
              layoutId="pricing-switch"
              className="absolute inset-0 rounded-full bg-gradient-to-r from-neon-cyan to-neon-green"
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative flex items-center gap-1.5">
            Yearly
            <span className="rounded-full bg-neon-green/20 px-2 py-0.5 text-[10px] font-bold text-neon-green">
              -17%
            </span>
          </span>
        </button>
      </div>
    </div>
  );
};

export default function PricingSection() {
  const [isYearly, setIsYearly] = useState(false);

  const formatPrice = (value: number) =>
    value === 0 ? "0" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);

  return (
    <div className="relative px-6 py-32">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-neon-cyan/[0.04] rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-neon-purple/[0.06] rounded-full blur-[100px]" />
      </div>

      <div className="container mx-auto relative z-10">
        {/* Header */}
        <ScrollReveal>
          <div className="text-center mb-6">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-neon-green/20 bg-neon-green/5 px-5 py-2">
              <Crown className="h-4 w-4 text-neon-green" />
              <span className="text-xs font-semibold uppercase tracking-wider text-neon-green">
                Simple Pricing
              </span>
            </div>
            <h2 className="text-4xl font-bold md:text-5xl mb-4">
              <span className="text-text-primary">Plans for Every </span>
              <span className="gradient-text-professional">Trader</span>
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-text-secondary">
              Start free, upgrade when you&apos;re ready. All plans include core AI signal intelligence.
            </p>
          </div>
        </ScrollReveal>

        {/* Toggle */}
        <ScrollReveal delay={0.1}>
          <div className="mb-16">
            <PricingSwitch isYearly={isYearly} onSwitch={setIsYearly} />
          </div>
        </ScrollReveal>

        {/* Pricing Cards */}
        <div className="grid gap-6 md:grid-cols-3 max-w-6xl mx-auto items-start">
          {plans.map((plan, index) => (
            <ScrollReveal key={plan.name} delay={index * 0.1}>
              <motion.div
                whileHover={{ y: -8 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={cn(
                  "relative rounded-2xl overflow-hidden transition-all duration-300",
                  plan.popular
                    ? "ring-2 ring-neon-green/40 shadow-[0_0_60px_-12px_rgba(0,255,136,0.25)]"
                    : "ring-1 ring-white/[0.06]"
                )}
              >
                {/* Popular badge */}
                {plan.popular && (
                  <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-neon-cyan via-neon-green to-neon-cyan py-1.5 text-center z-10">
                    <span className="text-xs font-bold uppercase tracking-wider text-space-void">
                      Most Popular
                    </span>
                  </div>
                )}

                <div
                  className={cn(
                    "glass-card-neu p-8",
                    plan.popular ? "pt-14" : ""
                  )}
                  style={{ borderRadius: "inherit" }}
                >
                  {/* Plan icon + name */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl",
                      plan.accent === "neon-cyan" && "bg-neon-cyan/15",
                      plan.accent === "neon-green" && "bg-neon-green/15",
                      plan.accent === "neon-purple" && "bg-neon-purple/15",
                    )}>
                      <plan.icon className={cn(
                        "h-5 w-5",
                        plan.accent === "neon-cyan" && "text-neon-cyan",
                        plan.accent === "neon-green" && "text-neon-green",
                        plan.accent === "neon-purple" && "text-neon-purple",
                      )} />
                    </div>
                    <h3 className="text-xl font-bold text-text-primary">{plan.name}</h3>
                  </div>

                  <p className="text-sm text-text-secondary mb-6">{plan.description}</p>

                  {/* Price */}
                  <div className="flex items-baseline gap-1 mb-8">
                    <span className="text-lg font-medium text-text-secondary">&#8377;</span>
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={`${plan.name}-${isYearly}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.25 }}
                        className="text-5xl font-bold text-text-primary tracking-tight"
                      >
                        {formatPrice(isYearly ? plan.yearlyPrice : plan.price)}
                      </motion.span>
                    </AnimatePresence>
                    <span className="text-sm text-text-secondary ml-1">
                      /{isYearly ? "year" : "month"}
                    </span>
                  </div>

                  {/* CTA Button */}
                  <Link
                    href={plan.price === 0 ? "/signup" : "/signup?plan=" + plan.name.toLowerCase()}
                    className={cn(
                      "block w-full rounded-xl py-3.5 text-center text-sm font-semibold transition-all",
                      plan.popular
                        ? "btn-tv-gradient btn-press shadow-[0_8px_24px_rgba(0,87,255,0.3)]"
                        : plan.price === 0
                          ? "bg-white/[0.06] border border-white/[0.08] text-text-primary hover:bg-white/[0.1] hover:border-white/[0.12]"
                          : "bg-gradient-to-r from-neon-purple/20 to-neon-purple/10 border border-neon-purple/20 text-neon-purple hover:border-neon-purple/40"
                    )}
                  >
                    {plan.buttonText}
                  </Link>

                  {/* Features */}
                  <div className="mt-8 pt-8 border-t border-white/[0.06]">
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-4">
                      What&apos;s included
                    </p>
                    <ul className="space-y-3">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3">
                          <Check className={cn(
                            "h-4 w-4 mt-0.5 shrink-0",
                            plan.accent === "neon-cyan" && "text-neon-cyan",
                            plan.accent === "neon-green" && "text-neon-green",
                            plan.accent === "neon-purple" && "text-neon-purple",
                          )} />
                          <span className="text-sm text-text-secondary">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
            </ScrollReveal>
          ))}
        </div>

        {/* Bottom note */}
        <ScrollReveal delay={0.4}>
          <p className="text-center text-sm text-text-muted mt-12 max-w-2xl mx-auto">
            All paid plans include a 7-day free trial. No credit card required to start.
            Cancel anytime with no questions asked.
          </p>
        </ScrollReveal>
      </div>
    </div>
  );
}
