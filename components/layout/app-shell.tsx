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
import { SidebarNavigation } from "@/components/layout/sidebar-navigation";
import { NavigationGroup } from "@/components/layout/navigation-group";
import { OffRequestNotifications } from "@/components/layout/off-request-notifications";
import { QuickNoteButton } from "@/components/notes/quick-note-button";
import { OllamaChatbox } from "@/components/ai/ollama-chatbox";

const volumeItems = [
  { href: "/volume/delivery", label: "Delivery Volume", icon: Truck },
  { href: "/volume/pickup", label: "Pickup Volume", icon: PackagePlus },
];

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/realtime-dashboard", label: "Delivery Realtime", icon: Activity },
  { href: "/riders", label: "Rider Directory", icon: Bike },
  { href: "/team", label: "Staffing & Scheduling", icon: UsersRound },
  { href: "/pickup-realtime", label: "Pickup Realtime", icon: PackagePlus },
  { href: "/lmhub-inventory", label: "Pickup Backlog", icon: PackageOpen },
  { href: "/inventory-delivery", label: "Delivery Backlog", icon: Truck },
  { href: "/backlog-history", label: "Backlog History", icon: BarChart3 },
  ...volumeItems,
  { href: "/performance", label: "Rider Performance", icon: BarChart3 },
  { href: "/onhold", label: "On-Hold Analytics", icon: BarChart3 },
  { href: "/overnight-holds", label: "Giữ hàng qua đêm", icon: Moon },
  { href: "/notes", label: "Notes", icon: ListChecks },
  { href: "/off-schedule", label: "Time Off", icon: ListChecks },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/violations", label: "Violations", icon: ListChecks },
  { href: "/route-sheet", label: "Operations Sheets", icon: ListChecks },
  { href: "/imports", label: "Data Import", icon: PackagePlus },
  { href: "/data-sources", label: "Data Sources", icon: Activity },
  { href: "/settings", label: "Members", icon: UsersRound },
  { href: "/user-activity", label: "Activity Log", icon: Activity },
];

const navigationGroups = [
  { label: "Live Monitoring", icon: Activity, paths: ["/realtime-dashboard", "/pickup-realtime"] },
  { label: "Backlog", icon: PackageOpen, paths: ["/lmhub-inventory", "/inventory-delivery", "/backlog-history", "/overnight-holds"] },
  { label: "Volume", icon: Truck, paths: volumeItems.map(item => item.href) },
  { label: "Pickup Management", icon: ListChecks, paths: ["/pickup-management", "/pickup-management?view=replacement"] },
];

const mobileNavItems = navItems.filter(item => ["/dashboard", "/realtime-dashboard", "/riders", "/team"].includes(item.href));
const pickupItems = [
  { href: "/pickup-management", view: null, label: "Pickup Points", icon: ListChecks },
  { href: "/pickup-management?view=replacement", view: "replacement", label: "Pickup Coverage", icon: Truck },
];
const returnItems = [
  { href: "/return-orders", view: null, label: "Return Orders", icon: PackageSearch },
];
const toolItems = [
  { href: "/zones", label: "Zones", icon: PencilRuler },
  { href: "/zone-builder", label: "Zone Builder", icon: PencilRuler },
];
const memberHiddenItems = new Set<string>([]);
const morePaths = ["/backlog-history", "/overnight-holds", "/performance", "/return-orders", "/volume", "/pickup-realtime", "/lmhub-inventory", "/inventory-delivery", "/settings", "/notes", "/off-schedule", "/tasks", "/violations", "/route-sheet", "/imports", "/pickup-management", "/zones", "/zone-builder"];
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
    ...workspaceItems.filter((item) => item.href !== "/pickup-management" && item.href !== "/return-orders" && (!memberToolRestricted || !memberHiddenItems.has(item.href))),
    ...visibleReturnItems,
    ...visiblePickupItems,
    ...visibleToolItems,
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
    { id: "operations" as const, label: "Operations", icon: LayoutGrid },
    { id: "team" as const, label: "Workforce", icon: UsersRound },
    ...(!memberToolRestricted ? [{ id: "routes" as const, label: "Maps & Routes", icon: Map }] : []),
    { id: "data" as const, label: "Data Management", icon: Table2 },
    { id: "settings" as const, label: "Administration", icon: Settings2 },
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
      : [...navItems, ...toolItems].find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const splitItems = navItems.filter((item) => !memberToolRestricted || !memberHiddenItems.has(item.href))
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
        <nav className="app-module-rail" aria-label="Select workspace">
          <Link href="/dashboard" className="app-rail-brand" aria-label={`${APP_NAME} — Dashboard`}><SddMark /></Link>
          {modules.map((module) => {
            const Icon = module.icon;
            return <button key={module.id} type="button" title={module.label} aria-label={module.label} aria-pressed={selectedModule === module.id} aria-controls="operations-module-panel" className={cn("app-module-button", selectedModule === module.id && "is-active", module.id === "settings" && "is-settings")} onClick={() => { setModuleSelection({ pathname, module: module.id }); setSidebarOpen(true); }}><Icon size={19} aria-hidden="true" /><span className="app-module-tooltip" aria-hidden="true">{module.label}</span></button>;
          })}
        </nav>
        <aside className="app-sidebar" id="operations-module-panel" aria-label={modules.find((module) => module.id === selectedModule)?.label} aria-hidden={!sidebarOpen} inert={!sidebarOpen}>
          <Link href="/dashboard" className="app-sidebar-brand" aria-label={`${APP_NAME} — Dashboard`}><AppBrand inverse /></Link>
          <div className="app-sidebar-context"><span>Coverage</span><strong>Areas 1–5</strong></div>
          <SidebarNavigation moduleKey={selectedModule} activeKey={`${pathname}:${searchParams.get("view") ?? ""}`} open={sidebarOpen}>
            <p className="app-nav-eyebrow">{selectedModule === "operations" ? "Monitoring & Analytics" : modules.find((module) => module.id === selectedModule)?.label}</p>
            {moduleItems.map((item) => {
              const group = navigationGroups.find(group => group.paths.includes(item.href));
              if (group) {
                if (group.paths[0] !== item.href) return null;
                const items = moduleItems.filter(child => group.paths.includes(child.href));
                return <NavigationGroup key={`${group.label}:${pathname}`} label={group.label} icon={group.icon} active={items.some(child => isNavigationItemActive(child, pathname, searchParams.get("view")))}>
                  {items.map(child => <Link key={child.href} href={child.href} aria-current={isNavigationItemActive(child, pathname, searchParams.get("view")) ? "page" : undefined} className={cn("app-nav-link", isNavigationItemActive(child, pathname, searchParams.get("view")) && "is-active")}><child.icon size={16} aria-hidden="true"/><span>{child.label}</span><NavigationPendingIndicator/></Link>)}
                </NavigationGroup>;
              }
              const active = isNavigationItemActive(item, pathname, searchParams.get("view"));
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("app-nav-link", active && "is-active")}><Icon size={17} aria-hidden="true" /><span>{item.label}</span><NavigationPendingIndicator /></Link>;
            })}
            {selectedModule === "operations" ? <>
              <p className="app-nav-eyebrow app-nav-eyebrow-secondary">Operations Management</p>
              {visibleReturnItems.map((item) => <Link key={item.href} href={item.href} aria-current={isNavigationItemActive(item, pathname, searchParams.get("view")) ? "page" : undefined} className={cn("app-nav-link", isNavigationItemActive(item, pathname, searchParams.get("view")) && "is-active")}><item.icon size={17} aria-hidden="true" /><span>{item.label}</span><NavigationPendingIndicator /></Link>)}
              {visiblePickupItems.length ? <NavigationGroup key={`pickup:${pathname}:${searchParams.get("view") ?? ""}`} label="Pickup Management" icon={ListChecks} active={visiblePickupItems.some(item => isNavigationItemActive(item, pathname, searchParams.get("view")))}>
                {visiblePickupItems.map((item) => <Link key={item.href} href={item.href} aria-current={isNavigationItemActive(item, pathname, searchParams.get("view")) ? "page" : undefined} className={cn("app-nav-link", isNavigationItemActive(item, pathname, searchParams.get("view")) && "is-active")}><item.icon size={16} aria-hidden="true" /><span>{item.label}</span><NavigationPendingIndicator /></Link>)}
              </NavigationGroup> : null}
            </> : null}
          </SidebarNavigation>
          <div className="app-sidebar-foot"><Map size={15} aria-hidden="true" /><span>SDD · Areas 1–5</span></div>
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
            const group = navigationGroups.find(group => group.paths.includes(item.href));
            if (group) {
              if (group.paths[0] !== item.href) return null;
              const items = moreNavItems.filter(child => group.paths.includes(child.href));
              return <NavigationGroup key={`mobile:${group.label}:${pathname}:${searchParams.get("view") ?? ""}`} label={group.label} icon={group.icon} active={items.some(child => isNavigationItemActive(child, pathname, searchParams.get("view")))} mobile>
                {items.map(child => <Link key={child.href} href={child.href} onClick={() => setMoreOpen(false)} aria-current={isNavigationItemActive(child, pathname, searchParams.get("view")) ? "page" : undefined} className={cn("app-more-link", isNavigationItemActive(child, pathname, searchParams.get("view")) && "is-active")}><child.icon size={17} aria-hidden="true"/><span>{child.label}</span><NavigationPendingIndicator/></Link>)}
              </NavigationGroup>;
            }
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
