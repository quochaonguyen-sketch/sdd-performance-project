"use client";

import { useEffect, useRef } from "react";

export function SidebarNavigation({ children, moduleKey, activeKey, open }: {
  children: React.ReactNode; moduleKey: string; activeKey: string; open: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = nav.querySelector<HTMLElement>('.app-nav-link[aria-current="page"]');
        const marker = nav.querySelector<HTMLElement>(".app-sidebar-active-marker");
        if (!marker) return;
        if (!active || !open || nav.clientWidth === 0) { marker.style.opacity = "0"; return; }
        const top = active.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop + 7;
        marker.style.height = `${Math.max(0, active.offsetHeight - 14)}px`;
        marker.style.transform = `translateY(${top}px)`;
        marker.style.opacity = "1";
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    nav.querySelectorAll<HTMLElement>(".app-nav-link").forEach(link => observer.observe(link));
    measure();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [activeKey, moduleKey, open]);

  useEffect(() => {
    const nav = ref.current;
    if (!nav || !open) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    const animations = Array.from(nav.querySelectorAll<HTMLElement>(":scope > .app-nav-link, :scope > .app-nav-eyebrow")).map((element, index) => element.animate(
      [{ opacity: 0, transform: "translateX(-8px)" }, { opacity: 1, transform: "translateX(0)" }],
      { duration: 240, delay: Math.min(index, 8) * 24, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" },
    ));
    const cancel = () => animations.forEach(animation => animation.cancel());
    preference.addEventListener("change", cancel);
    return () => { cancel(); preference.removeEventListener("change", cancel); };
  }, [moduleKey, open]);

  return <nav ref={ref} className="app-sidebar-nav" aria-label="Điều hướng chính">
    <span className="app-sidebar-active-marker" aria-hidden="true" />
    {children}
  </nav>;
}
