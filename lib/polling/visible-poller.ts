// One request at a time; mutation events queue one fresh read after an in-flight read.
export function startVisiblePolling(load: (signal: AbortSignal) => Promise<void>, intervalMs = 60_000, eventName?: string) {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | null = null;
  let controller: AbortController | undefined;
  let pending = false;
  let lastStarted = -Infinity;
  const visible = () => document.visibilityState === "visible";
  const clear = () => { clearTimeout(timer); timer = undefined; };
  const schedule = (delay: number) => { clear(); if (active && visible()) timer = setTimeout(() => void run(), delay); };

  function run(force = false): Promise<void> {
    if (!active) return Promise.resolve();
    if (!visible()) { pending ||= force; return Promise.resolve(); }
    if (inFlight) { pending ||= force; return inFlight; }
    // Visibility and focus often fire together when returning to a tab.
    if (!force && Date.now() - lastStarted < 1000) return Promise.resolve();
    clear(); pending = false; lastStarted = Date.now(); controller = new AbortController();
    inFlight = Promise.resolve().then(() => load(controller!.signal)).catch(() => {}).finally(() => {
      inFlight = null;
      if (!active) return;
      if (pending && visible()) void run(true);
      else schedule(intervalMs);
    });
    return inFlight;
  }
  const refresh = () => run(true);
  const focus = () => { void run(); };
  const visibility = () => {
    if (!visible()) { clear(); controller?.abort(); }
    else { pending = true; void run(true); }
  };
  window.addEventListener("focus", focus);
  document.addEventListener("visibilitychange", visibility);
  if (eventName) window.addEventListener(eventName, refresh);
  schedule(0);
  return {
    refresh,
    stop() {
      active = false; clear(); controller?.abort();
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
      if (eventName) window.removeEventListener(eventName, refresh);
    },
  };
}
