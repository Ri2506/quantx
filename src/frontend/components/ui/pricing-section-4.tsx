"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Sparkles as SparklesComp } from "@/components/ui/sparkles";
import { TimelineContent } from "@/components/ui/timeline-animation";
import { VerticalCutReveal } from "@/components/ui/vertical-cut-reveal";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useRef, useState } from "react";

const plans = [
  {
    name: "Starter",
    description:
      "Perfect for new swing traders building discipline and consistency",
    price: 999,
    yearlyPrice: 9990,
    buttonText: "Activate Signal Access",
    buttonVariant: "outline" as const,
    includes: [
      "Starter access includes:",
      "5 AI signals per day",
      "NSE coverage",
      "Entry, stop, target levels",
      "Paper trading mode",
      "Email alerts",
    ],
  },
  {
    name: "Pro",
    description:
      "Best value for active swing traders scaling conviction",
    price: 2499,
    yearlyPrice: 24990,
    buttonText: "Activate Signal Access",
    buttonVariant: "default" as const,
    popular: true,
    includes: [
      "Everything in Starter, plus:",
      "Unlimited AI signals",
      "NSE + BSE coverage",
      "WhatsApp + email alerts",
      "Advanced risk analytics",
      "Priority support",
    ],
  },
  {
    name: "Premium",
    description:
      "For serious capital allocation and institutional-grade tooling",
    price: 4999,
    yearlyPrice: 49990,
    buttonText: "Activate Signal Access",
    buttonVariant: "outline" as const,
    includes: [
      "Everything in Pro, plus:",
      "Custom risk presets",
      "Dedicated success manager",
      "Early access to new scanners",
      "API access",
      "1-click broker connect",
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
    <div className="flex justify-center">
      <div className="relative z-10 mx-auto flex w-fit rounded-full bg-background-elevated border border-border p-1">
        <button
          type="button"
          onClick={() => onSwitch(false)}
          aria-pressed={!isYearly}
          className={cn(
            "relative z-10 w-fit h-10  rounded-full sm:px-6 px-3 sm:py-2 py-1 font-medium transition-colors",
            !isYearly ? "text-text-primary" : "text-text-secondary",
          )}
        >
          {!isYearly && (
            <motion.span
              layoutId={"switch"}
              className="pointer-events-none absolute top-0 left-0 h-10 w-full rounded-full border-4 border-primary bg-primary shadow-[0_0_24px_rgba(var(--primary),0.35)]"
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative">Monthly</span>
        </button>

        <button
          type="button"
          onClick={() => onSwitch(true)}
          aria-pressed={isYearly}
          className={cn(
            "relative z-10 w-fit h-10 flex-shrink-0 rounded-full sm:px-6 px-3 sm:py-2 py-1 font-medium transition-colors",
            isYearly ? "text-text-primary" : "text-text-secondary",
          )}
        >
          {isYearly && (
            <motion.span
              layoutId={"switch"}
              className="pointer-events-none absolute top-0 left-0 h-10 w-full rounded-full border-4 border-primary bg-primary shadow-[0_0_24px_rgba(var(--primary),0.35)]"
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative flex items-center gap-2">Yearly</span>
        </button>
      </div>
    </div>
  );
};

export default function PricingSection6() {
  const [isYearly, setIsYearly] = useState(false);
  const pricingRef = useRef<HTMLDivElement>(null);

  const revealVariants = {
    visible: (i: number) => ({
      y: 0,
      opacity: 1,
      filter: "blur(0px)",
      transition: {
        delay: i * 0.4,
        duration: 0.5,
      },
    }),
    hidden: {
      filter: "blur(10px)",
      y: -20,
      opacity: 0,
    },
  };

  const togglePricingPeriod = (value: boolean) => setIsYearly(value);

  const formatPrice = (value: number) =>
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);

  return (
    <div
      className="min-h-screen mx-auto relative bg-background-primary overflow-x-hidden"
      ref={pricingRef}
    >
      <TimelineContent
        animationNum={4}
        timelineRef={pricingRef}
        customVariants={revealVariants}
        className="absolute top-0 h-96 w-screen overflow-hidden [mask-image:radial-gradient(circle_at_50%_50%,white,transparent)]"
      >
        <div className="absolute bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,rgba(var(--text-primary),0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(var(--text-primary),0.04)_1px,transparent_1px)] bg-[size:70px_80px]" />
        <SparklesComp
          density={1800}
          direction="bottom"
          speed={1}
          color="rgb(var(--sparkles-color))"
          className="absolute inset-x-0 bottom-0 h-full w-full [mask-image:radial-gradient(circle_at_50%_50%,white,transparent_85%)]"
        />
      </TimelineContent>
      <TimelineContent
        animationNum={5}
        timelineRef={pricingRef}
        customVariants={revealVariants}
        className="absolute left-0 top-[-114px] w-full h-[113.625vh] flex flex-col items-start justify-start content-start flex-none flex-nowrap gap-2.5 overflow-hidden p-0 z-0"
      >
        <div className="framer-1i5axl2">
          <div
            className="absolute left-[-568px] right-[-568px] top-0 h-[2053px] flex-none rounded-full"
            style={{
              border: "200px solid rgb(var(--accent))",
              filter: "blur(92px)",
              WebkitFilter: "blur(92px)",
            }}
            data-border="true"
            data-framer-name="Ellipse 1"
          ></div>
          <div
            className="absolute left-[-568px] right-[-568px] top-0 h-[2053px] flex-none rounded-full"
            style={{
              border: "200px solid rgb(var(--primary))",
              filter: "blur(92px)",
              WebkitFilter: "blur(92px)",
            }}
            data-border="true"
            data-framer-name="Ellipse 2"
          ></div>
        </div>
      </TimelineContent>

      <article className="text-center mb-6 pt-32 max-w-3xl mx-auto space-y-2 relative z-50">
        <h2 className="text-4xl font-medium text-text-primary">
          <VerticalCutReveal
            splitBy="words"
            staggerDuration={0.15}
            staggerFrom="first"
            reverse={true}
            containerClassName="justify-center "
            transition={{
              type: "spring",
              stiffness: 250,
              damping: 40,
              delay: 0,
            }}
          >
            Plans built for serious swing traders
          </VerticalCutReveal>
        </h2>

        <TimelineContent
          as="p"
          animationNum={0}
          timelineRef={pricingRef}
          customVariants={revealVariants}
          className="text-text-secondary"
        >
          Trusted by 2,400+ traders in India. Choose monthly flexibility or save
          with annual billing.
        </TimelineContent>

        <TimelineContent
          as="div"
          animationNum={1}
          timelineRef={pricingRef}
          customVariants={revealVariants}
        >
          <PricingSwitch isYearly={isYearly} onSwitch={togglePricingPeriod} />
        </TimelineContent>
      </article>

      <div
        className="absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0"
        style={{
          backgroundImage: `
        radial-gradient(circle at center, rgba(var(--accent), 0.35) 0%, transparent 70%)
      `,
          opacity: 0.6,
          mixBlendMode: "multiply",
        }}
      />

      <div className="grid md:grid-cols-3 max-w-5xl gap-4 py-6 mx-auto ">
        {plans.map((plan, index) => (
          <TimelineContent
            key={plan.name}
            as="div"
            animationNum={2 + index}
            timelineRef={pricingRef}
            customVariants={revealVariants}
          >
            <Card
              className={`relative text-text-primary border-border ${
                plan.popular
                  ? "bg-background-elevated shadow-[0px_-13px_180px_0px_rgba(var(--accent),0.35)] z-20 border-accent/40"
                  : "bg-background-surface z-10 border-border/60"
              }`}
            >
              <CardHeader className="text-left ">
                <div className="flex justify-between">
                  <h3 className="text-3xl mb-2">{plan.name}</h3>
                </div>
                <div className="flex items-baseline">
                  <span className="text-4xl font-semibold ">₹</span>
                  <motion.span
                    key={`${plan.name}-${isYearly ? "yearly" : "monthly"}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="text-4xl font-semibold"
                  >
                    {formatPrice(isYearly ? plan.yearlyPrice : plan.price)}
                  </motion.span>
                  <span className="text-text-secondary ml-1">
                    /{isYearly ? "year" : "month"}
                  </span>
                </div>
                <p className="text-sm text-text-secondary mb-4">{plan.description}</p>
              </CardHeader>

              <CardContent className="pt-0">
                <button
                  className={`w-full mb-6 p-4 text-xl rounded-xl ${
                    plan.popular
                      ? "bg-primary text-primary-foreground shadow-[0_18px_40px_rgba(var(--primary),0.25)] border border-primary hover:bg-primary/90"
                      : plan.buttonVariant === "outline"
                        ? "bg-background-elevated text-text-primary shadow-[0_18px_40px_rgba(0,0,0,0.2)] border border-border hover:bg-background-surface"
                        : ""
                  }`}
                >
                  {plan.buttonText}
                </button>

                <div className="space-y-3 pt-4 border-t border-border/70">
                  <h4 className="font-medium text-base mb-3">
                    {plan.includes[0]}
                  </h4>
                  <ul className="space-y-2">
                    {plan.includes.slice(1).map((feature, featureIndex) => (
                      <li
                        key={featureIndex}
                        className="flex items-center gap-2"
                      >
                        <span className="h-2.5 w-2.5 bg-border rounded-full grid place-content-center"></span>
                        <span className="text-sm text-text-secondary">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TimelineContent>
        ))}
      </div>
    </div>
  );
}
