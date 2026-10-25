"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Activity, BarChart3, Bike, LayoutGrid, Map, Settings2, Table2, Columns2, ListChecks, LogOut, Menu, Moon, PackageOpen, PackagePlus, PackageSearch, PanelLeftClose, PanelLeftOpen, PencilRuler, Sun, Truck, UsersRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/utils/cn";
import { APP_NAME, AppBrand, AppCopyright, SddMark } from "@/components/layout/app-brand";
import { AppLoadingOverlay } from "@/components/layout/app-loading-overlay";
import { NavigationPendingIndicator } from "@/components/layout/navigation-pending-indicator";
import { RouteReveal } from "@/components/layout/route-reveal";
import { OffRequestNotifications } from "@/components/layout/off-request-notifications";
import { QuickNoteButton } from "@/components/notes/quick-note-button";
import { OllamaChatbox } from "@/components/ai/ollama-chatbox";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/realtime-dashboard", label: "Realtime Dashboard", icon: Activity },
  { href: "/riders", label: "Riders", icon: Bike },
  { href: "/team", label: "Nhân sự & lịch FTE", icon: UsersRound },
  { href: "/performance", label: "Performance", icon: BarChart3 },
  { href: "/pickup-realtime", label: "Pickup Realtime", icon: PackagePlus },
  { href: "/lmhub-inventory", label: "Tồn pickup", icon: PackageOpen },
  { href: "/inventory-delivery", label: "Tồn delivery", icon: Truck },
  { href: "/onhold", label: "Phân tích OH", icon: BarChart3 },
  { href: "/notes", label: "Ghi chú", icon: ListChecks },
  { href: "/off-schedule", label: "Lịch OFF", icon: ListChecks },
  { href: "/tasks", label: "Công việc", icon: ListChecks },
  { href: "/violations", label: "Vi phạm", icon: ListChecks },
  { href: "/route-sheet", label: "Excel / Google Sheet", icon: ListChecks },
  { href: "/imports", label: "Nhập dữ liệu", icon: PackagePlus },
  { href: "/data-sources", label: "Nguồn dữ liệu", icon: Activity },
  { href: "/settings", label: "Thành viên", icon: UsersRound },
  { href: "/user-activity", label: "Nhật ký người dùng", icon: Activity },
];

const mobileNavItems = navItems.slice(0, 4);
const volumeItems = [
  { href: "/volume/delivery", label: "Delivery", icon: Truck },
  { href: "/volume/pickup", label: "Pickup", icon: PackagePlus },
];
const pickupItems = [
  { href: "/pickup-management", view: null, label: "Quản lý PUP", icon: ListChecks },
  { href: "/pickup-management?view=replacement", view: "replacement", label: "Thế pick", icon: Truck },
];
const returnItems = [
  { href: "/return-orders", view: null, label: "Hàng trả", icon: PackageSearch },
];
const toolItems = [
  { href: "/zones", label: "Khu vực", icon: PencilRuler },
  { href: "/zone-builder", label: "Zone Builder", icon: PencilRuler },
];
const memberHiddenItems = new Set<string>([]);
const morePaths = ["/performance", "/return-orders", "/volume", "/pickup-realtime", "/lmhub-inventory", "/inventory-delivery", "/settings", "/notes", "/off-schedule", "/tasks", "/violations", "/route-sheet", "/imports", "/pickup-management", "/zones", "/zone-builder"];
type ThemeMode = "light" | "dark";
type WorkspaceModule = "operations" | "team" | "routes" | "data" | "settings";
const subscribeToFrameContext = () => () => {};

function getTrustedFrameContext() {
  if (window.self === window.top) return false;
  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function AppShell({ children, user }: { children: React.ReactNode; user: { email: string; fullName: string | null; role: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isTrustedFrame = useSyncExternalStore(subscribeToFrameContext, getTrustedFrameContext, () => false);
  const isEmbedded = searchParams.get("embed") === "split" || isTrustedFrame;
  const [moreOpen, setMoreOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitRoute, setSplitRoute] = useState("/dashboard");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const memberToolRestricted = user.role === "member";
  const visibleToolItems = memberToolRestricted ? [] : toolItems;
  const visiblePickupItems = memberToolRestricted ? [] : pickupItems;
  const visibleReturnItems = returnItems;
  const workspaceItems = navItems.filter((item) => !["/settings", "/user-activity"].includes(item.href) && (item.href !== "/data-sources" || ["admin", "leader"].includes(user.role)));
  const teamPaths = ["/riders", "/team", "/notes", "/off-schedule", "/tasks", "/violations"];
  const dataPaths = ["/route-sheet", "/imports", "/data-sources"];
  const systemItems = navItems.filter((item) => item.href === "/settings" || item.href === "/user-activity" && user.role === "admin");
  const moreNavItems = [
    ...volumeItems,
    ...workspaceItems.filter((item) => item.href !== "/pickup-management" && item.href !== "/return-orders" && (!memberToolRestricted || !memberHiddenItems.has(item.href))),
    ...visiblePickupItems,
    ...visibleToolItems,
    ...visibleReturnItems,
    ...systemItems,
  ];
  const pickupActive = pathname.startsWith("/pickup-management");
  const returnActive = pathname.startsWith("/return-orders");
  const routeModule: WorkspaceModule = teamPaths.some((path) => pathname.startsWith(path)) ? "team"
    : dataPaths.some((path) => pathname.startsWith(path)) ? "data"
    : toolItems.some((item) => pathname.startsWith(item.href)) && !memberToolRestricted ? "routes"
    : pathname.startsWith("/settings") || pathname.startsWith("/user-activity") ? "settings" : "operations";
  const [moduleSelection, setModuleSelection] = useState<{ pathname: string; module: WorkspaceModule } | null>(null);
  const selectedModule = moduleSelection?.pathname === pathname ? moduleSelection.module : routeModule;
  const modules = [
    { id: "operations" as const, label: "Vận hành", icon: LayoutGrid },
    { id: "team" as const, label: "Đội ngũ", icon: UsersRound },
    ...(!memberToolRestricted ? [{ id: "routes" as const, label: "Bản đồ & tuyến", icon: Map }] : []),
    { id: "data" as const, label: "Excel & dữ liệu", icon: Table2 },
    { id: "settings" as const, label: "Quản trị", icon: Settings2 },
  ];
  const moduleItems = selectedModule === "team" ? workspaceItems.filter((item) => teamPaths.includes(item.href))
    : selectedModule === "routes" ? visibleToolItems
    : selectedModule === "data" ? workspaceItems.filter((item) => dataPaths.includes(item.href))
    : selectedModule === "settings" ? systemItems
    : workspaceItems.filter((item) => !teamPaths.includes(item.href) && !dataPaths.includes(item.href));
  const moreRouteActive = morePaths.some((path) => pathname.startsWith(path));
  const currentPage = returnActive
    ? returnItems.find((item) => item.view === searchParams.get("view")) ?? returnItems[0]
    : pickupActive
      ? pickupItems.find((item) => item.view === searchParams.get("view")) ?? pickupItems[0]
      : [...navItems, ...volumeItems, ...toolItems].find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const splitItems = [...navItems.filter((item) => !memberToolRestricted || !memberHiddenItems.has(item.href)), ...volumeItems]
    .filter((item) => item.href !== pathname && (item.href !== "/user-activity" || user.role === "admin") && (item.href !== "/data-sources" || ["admin", "leader"].includes(user.role)));
  const activeSplitRoute = splitRoute === pathname ? (splitItems[0]?.href ?? "/dashboard") : splitRoute;

  useEffect(() => {
    const initialTheme = window.setTimeout(() => setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light"), 0);
    return () => window.clearTimeout(initialTheme);
  }, []);

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("rider-ops-theme", nextTheme);
    setTheme(nextTheme);
  }

  async function signOut() {
    await fetch("/api/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event_id: crypto.randomUUID(), event_type: "logout", path: pathname }), keepalive: true }).catch(() => null);
    await createClient().auth.signOut();
    router.replace("/login");
  }

  function preserveEmbeddedNavigation(event: React.MouseEvent<HTMLElement>) {
    if (!isEmbedded || !(event.target instanceof Element)) return;
    const anchor = event.target.closest("a");
    if (!anchor || anchor.target === "_blank" || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const url = new URL(anchor.href, window.location.origin);
    if (url.origin !== window.location.origin) return;
    event.preventDefault();
    url.searchParams.set("embed", "split");
    router.push(`${url.pathname}${url.search}${url.hash}`);
  }

  if (isEmbedded) {
    return <><main className="app-embedded-main" onClickCapture={preserveEmbeddedNavigation}><RouteReveal key={pathname}>{children}</RouteReveal></main><AppLoadingOverlay /></>;
  }

  return (
    <div className={cn("app-shell-technical", !sidebarOpen && "is-sidebar-collapsed")}>
      <div className="app-navigation" id="operations-sidebar">
        <nav className="app-module-rail" aria-label="Chọn module">
          <Link href="/dashboard" className="app-rail-brand" aria-label={`${APP_NAME} — Dashboard`}><SddMark /></Link>
          {modules.map((module) => {
            const Icon = module.icon;
            return <button key={module.id} type="button" title={module.label} aria-label={module.label} aria-pressed={selectedModule === module.id} aria-controls="operations-module-panel" className={cn("app-module-button", selectedModule === module.id && "is-active", module.id === "settings" && "is-settings")} onClick={() => setModuleSelection({ pathname, module: module.id })}><Icon size={19} aria-hidden="true" /><span className="app-module-tooltip" aria-hidden="true">{module.label}</span></button>;
          })}
        </nav>
        <aside className="app-sidebar" id="operations-module-panel" aria-label={modules.find((module) => module.id === selectedModule)?.label}>
          <Link href="/dashboard" className="app-sidebar-brand" aria-label={`${APP_NAME} — Dashboard`}><AppBrand inverse /></Link>
          <div className="app-sidebar-context"><span>Địa bàn</span><strong>Khu vực 1–5</strong></div>
          <nav className="app-sidebar-nav" aria-label="Điều hướng chính">
            <p className="app-nav-eyebrow">{selectedModule === "operations" ? "Không gian vận hành" : modules.find((module) => module.id === selectedModule)?.label}</p>
            {moduleItems.map((item) => {
              const active = isNavigationItemActive(item, pathname, searchParams.get("view"));
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("app-nav-link", active && "is-active")}><Icon size={17} aria-hidden="true" /><span>{item.label}</span><NavigationPendingIndicator /></Link>;
            })}
            {selectedModule === "operations" ? <>
              <p className="app-nav-eyebrow app-nav-eyebrow-secondary">Sản lượng</p>
              {volumeItems.map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={cn("app-nav-link", pathname === item.href && "is-active")}><item.icon size={17} aria-hidden="true" /><span>{item.label}</span><NavigationPendingIndicator /></Link>)}
              {visiblePickupItems.length ? <p className="app-nav-eyebrow app-nav-eyebrow-secondary">Quản lý pickup</p> : null}
              {visiblePickupItems.map((item) => <Link key={item.href} href={item.href} aria-current={isNavigationItemActive(item, pathname, searchParams.get("view")) ? "page" : undefined} className={cn("app-nav-link", isNavigationItemActive(item, pathname, searchParams.get("view")) && "is-active")}><item.icon size={17} aria-hidden="true" /><span>{item.label}</span><NavigationPendingIndicator /></Link>)}
              <p className="app-nav-eyebrow app-nav-eyebrow-secondary">Hàng trả</p>
              {visibleReturnItems.map((item) => <Link key={item.href} href={item.href} aria-current={isNavigationItemActive(item, pathname, searchParams.get("view")) ? "page" : undefined} className={cn("app-nav-link", isNavigationItemActive(item, pathname, searchParams.get("view")) && "is-active")}><item.icon size={17} aria-hidden="true" /><span>{item.label}</span><NavigationPendingIndicator /></Link>)}
            </> : null}
          </nav>
          <div className="app-sidebar-foot"><Map size={15} aria-hidden="true" /><span>SDD · Khu vực 1–5</span></div>
        </aside>
      </div>

      <div className="app-shell-content">
        <header className="app-header">
          <div className="app-header-mobile-brand"><AppBrand compact /></div>
          <div className="app-header-leading">
            <button type="button" className="app-sidebar-toggle" aria-controls="operations-sidebar" aria-expanded={sidebarOpen} aria-label={sidebarOpen ? "Ẩn thanh điều hướng" : "Hiện thanh điều hướng"} title={sidebarOpen ? "Ẩn thanh điều hướng" : "Hiện thanh điều hướng"} onClick={() => setSidebarOpen((current) => !current)}>
              {sidebarOpen ? <PanelLeftClose size={18} aria-hidden="true" /> : <PanelLeftOpen size={18} aria-hidden="true" />}
            </button>
            <div className="app-header-context">
              <p className="app-header-kicker">Không gian làm việc <span aria-hidden="true">/</span></p>
              <div className="app-header-title-row"><span>{currentPage?.label ?? "Operations"}</span></div>
            </div>
          </div>
          <div className="app-header-account">
            <OllamaChatbox />
            <OffRequestNotifications />
            <button type="button" className={cn("app-split-toggle", splitOpen && "is-active")} aria-pressed={splitOpen} aria-label={splitOpen ? "Tắt chia màn hình" : "Chia màn hình"} title={splitOpen ? "Tắt chia màn hình" : "Chia màn hình"} onClick={() => setSplitOpen((current) => !current)}>
              <Columns2 size={17} aria-hidden="true" /><span>{splitOpen ? "Đóng chia màn hình" : "Chia màn hình"}</span>
            </button>
            <button type="button" className="app-theme-toggle" aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"} title={theme === "dark" ? "Giao diện sáng" : "Giao diện tối"} onClick={toggleTheme}>
              {theme === "dark" ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
            </button>
            <div className="app-account-copy"><strong>{user.fullName ?? user.email}</strong><span>{user.role === "admin" ? "Quản trị viên" : user.role}</span></div>

            <button type="button" className="app-signout" onClick={() => void signOut()}><LogOut size={15} aria-hidden="true" /><span>Đăng xuất</span></button>
          </div>
        </header>
        <main className={cn("app-main", splitOpen && "is-quick-split")}>
          <section className="app-primary-pane"><RouteReveal key={pathname}>{children}</RouteReveal></section>
          {splitOpen ? <aside className="app-quick-split-pane" aria-label="Màn hình làm việc thứ hai">
            <header><span>Làm song song</span><select value={activeSplitRoute} onChange={(event) => setSplitRoute(event.target.value)} aria-label="Chọn màn hình thứ hai">
              {splitItems.map((item) => <option key={item.href} value={item.href}>{item.label}</option>)}
            </select></header>
            <iframe src={`${activeSplitRoute}?embed=split`} title={`Màn hình song song: ${splitItems.find((item) => item.href === activeSplitRoute)?.label ?? activeSplitRoute}`} />
          </aside> : null}
        </main>
        <footer className="app-footer"><AppCopyright /><p>Rider Ops Console · {currentPage?.label ?? "Operations"}</p></footer>
        <QuickNoteButton />
      </div>

      {moreOpen ? <button type="button" aria-label="Đóng menu" className="app-mobile-scrim" onClick={() => setMoreOpen(false)} /> : null}
      <section className={cn("app-more-sheet", moreOpen && "is-open")} aria-label="Menu chức năng khác" aria-hidden={!moreOpen}>
        <div className="app-more-heading"><div><span>Rider Operations</span><h2>Chức năng vận hành</h2></div><button type="button" aria-label="Đóng menu" onClick={() => setMoreOpen(false)}><X size={18} /></button></div>
        <div className="app-more-grid">
          {moreNavItems.map((item) => {
            const active = isNavigationItemActive(item, pathname, searchParams.get("view"));
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)} aria-current={active ? "page" : undefined} className={cn("app-more-link", active && "is-active")}><Icon size={17} aria-hidden="true" /><span>{item.label}</span><NavigationPendingIndicator /></Link>;
          })}
        </div>
        <button type="button" onClick={() => void signOut()} className="app-more-signout"><LogOut size={17} />Đăng xuất</button>
      </section>

      <nav className="app-taskbar" aria-label="Điều hướng nhanh">
        {mobileNavItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("app-taskbar-link", active && "is-active")}><Icon size={19} aria-hidden="true" /><span>{item.label}</span><NavigationPendingIndicator /></Link>;
        })}
        <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((current) => !current)} className={cn("app-taskbar-link", (moreOpen || moreRouteActive) && "is-active")}>
          {moreOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}<span>Thêm</span>
        </button>
      </nav>
      <AppLoadingOverlay />
    </div>
  );
}

function isNavigationItemActive(item: { href: string; view?: string | null }, pathname: string, currentView: string | null) {
  const itemPath = item.href.split("?")[0];
  if (itemPath !== pathname && !pathname.startsWith(`${itemPath}/`)) return false;
  if (itemPath !== "/pickup-management" && itemPath !== "/return-orders") return true;
  return (item.view ?? null) === currentView;
}
