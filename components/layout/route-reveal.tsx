"use client";

import { useAppLoading } from "@/components/layout/app-loading-store";
import { useEffect, useRef } from "react";

export function RouteReveal({ children }: { children: React.ReactNode }) {
  const loading = useAppLoading();
  const ref = useRef<HTMLDivElement>(null);
  const revealed = useRef(false);

  useEffect(() => {
    const root = ref.current;
    if (loading || !root || revealed.current) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    // RouteReveal is keyed by pathname. Data polling/filter changes must not replay entry motion.
    if (preference.matches) { revealed.current = true; return; }
    const animations: Animation[] = [];
    // Defer the one-shot flag so React development effect replay can cancel safely.
    const frame = requestAnimationFrame(() => {
      revealed.current = true;
      animations.push(root.animate([{ opacity: .45 }, { opacity: 1 }], { duration: 180, easing: "ease-out" }));
      const panels = Array.from(root.firstElementChild?.children ?? []).filter((element): element is HTMLElement => element instanceof HTMLElement).slice(0, 6);
      panels.forEach((element, index) => animations.push(element.animate(
        [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: 240, delay: index * 24, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" },
      )));
    });
    const cancel = () => { cancelAnimationFrame(frame); animations.forEach(animation => animation.cancel()); };
    preference.addEventListener("change", cancel);
    return () => { cancelAnimationFrame(frame); cancel(); preference.removeEventListener("change", cancel); };
  }, [loading]);

  return (
    <div
      ref={ref}
      className={`route-reveal-content ${loading ? "is-loading" : "is-ready"}`}
      aria-busy={loading}
    >
      {children}
    </div>
  );
}
