"use client";

import { useEffect, useRef, type RefObject } from "react";

export function SpotlightSheen() {
  return <span className="dashboard-spotlight-sheen" aria-hidden="true" />;
}

/** Presentation only: never edits displayed values or triggers a data request. */
export function useDashboardSpotlight(rootRef: RefObject<HTMLDivElement | null>, { ready, version, scope }: {
  ready: boolean; version: number; scope: string;
}) {
  const previous = useRef<{ scope: string; values: Map<string, string> } | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;
    let active: HTMLElement | null = null;
    let pending: { element: HTMLElement; x: number; y: number } | null = null;
    const reset = () => {
      cancelAnimationFrame(frame); frame = 0; pending = null;
      active?.removeAttribute("data-spotlight-hover"); active = null;
    };
    const move = (event: PointerEvent) => {
      if (reduce.matches || !pointer.matches || event.pointerType === "touch") return;
      const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-dashboard-spotlight]") : null;
      if (!element || !root.contains(element)) { reset(); return; }
      pending = { element, x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!pending) return;
        const { element, x, y } = pending;
        if (active !== element) { active?.removeAttribute("data-spotlight-hover"); active = element; }
        const rect = element.getBoundingClientRect();
        element.style.setProperty("--spotlight-x", `${x - rect.left}px`);
        element.style.setProperty("--spotlight-y", `${y - rect.top}px`);
        element.setAttribute("data-spotlight-hover", "true");
      });
    };
    const focus = (event: FocusEvent) => {
      const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-dashboard-spotlight]") : null;
      if (element) { element.style.setProperty("--spotlight-x", "50%"); element.style.setProperty("--spotlight-y", "50%"); }
    };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerleave", reset);
    root.addEventListener("focusin", focus);
    reduce.addEventListener("change", reset);
    pointer.addEventListener("change", reset);
    return () => {
      reset();
      root.removeEventListener("pointermove", move); root.removeEventListener("pointerleave", reset); root.removeEventListener("focusin", focus);
      reduce.removeEventListener("change", reset); pointer.removeEventListener("change", reset);
    };
  }, [rootRef]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !ready) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-dashboard-spotlight]"));
    const values = new Map(cards.map(card => [card.dataset.dashboardSpotlight!, card.dataset.spotlightValue ?? ""]));
    const before = previous.current;
    previous.current = { scope, values };
    // Establish a baseline on first load / range change. Unchanged polling never flashes.
    if (!before || before.scope !== scope) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    const animations: Animation[] = [];
    cards.filter(card => before.values.has(card.dataset.dashboardSpotlight!) && before.values.get(card.dataset.dashboardSpotlight!) !== values.get(card.dataset.dashboardSpotlight!)).forEach((card, index) => {
      const sheen = card.querySelector<HTMLElement>(".dashboard-spotlight-sheen");
      if (!sheen) return;
      animations.push(sheen.animate([
        { opacity: 0, transform: "translateX(-110%)" },
        { opacity: .8, offset: .35 },
        { opacity: 0, transform: "translateX(110%)" },
      ], { duration: 760, delay: Math.min(index, 4) * 35, easing: "cubic-bezier(.2,.65,.3,1)" }));
      card.querySelectorAll<HTMLElement>(".dash-volume-total, .dash-volume-split strong, .dash-progress-lead strong, .dash-progress-stats dd, .dash-area-cell > strong, .dashboard-return-overdue-summary strong").forEach(number => {
        animations.push(number.animate([{ transform: "translateY(3px)" }, { transform: "translateY(0)" }], { duration: 320, easing: "ease-out" }));
      });
    });
    const cancel = () => animations.forEach(animation => animation.cancel());
    preference.addEventListener("change", cancel);
    return () => { cancel(); preference.removeEventListener("change", cancel); };
  }, [ready, version, scope, rootRef]);
}
