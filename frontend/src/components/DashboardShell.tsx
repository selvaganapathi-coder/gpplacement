import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { SignOutButton } from "@/components/SignOutButton";
import { COLLEGE_BRAND, collegeBrandMark } from "@/lib/collegeBrand";

export type DashNavItem = {
  href: string;
  label: string;
  /** Prefer exact path match (and no ?tab= for admin home). */
  end?: boolean;
};

function parseHref(href: string): { pathname: string; tab: string | null } {
  const q = href.indexOf("?");
  if (q === -1) return { pathname: href, tab: null };
  const pathname = href.slice(0, q);
  const tab = new URLSearchParams(href.slice(q + 1)).get("tab");
  return { pathname, tab };
}

function isNavItemActive(
  item: DashNavItem,
  pathname: string,
  search: string
): boolean {
  const { pathname: targetPath, tab: wantTab } = parseHref(item.href);
  const haveTab = new URLSearchParams(search).get("tab");

  if (pathname === targetPath) {
    if (wantTab) return haveTab === wantTab;
    if (item.end) return !haveTab;
    return !haveTab;
  }

  // Highlight parent section for nested pages
  if (wantTab === "users" && pathname.startsWith(`${targetPath}/people/`)) {
    return true;
  }
  if (wantTab === "tests" && pathname.startsWith(`${targetPath}/tests`)) {
    if (pathname.includes("/results")) return false;
    return true;
  }
  if (targetPath === "/dashboard/admin/results") {
    return (
      pathname === "/dashboard/admin/results" ||
      (pathname.startsWith("/dashboard/admin/tests/") && pathname.endsWith("/results"))
    );
  }
  if (targetPath === "/dashboard/staff/results") {
    return (
      pathname === "/dashboard/staff/results" ||
      (pathname.startsWith("/dashboard/staff/tests/") && pathname.endsWith("/results"))
    );
  }
  if (targetPath === "/dashboard/staff/students") {
    return (
      pathname === "/dashboard/staff/students" ||
      pathname.startsWith("/dashboard/staff/students/")
    );
  }
  if (targetPath === "/dashboard/admin/students") {
    return (
      pathname === "/dashboard/admin/students" ||
      pathname.startsWith("/dashboard/admin/students/")
    );
  }
  if (targetPath === "/dashboard/staff/tests") {
    if (pathname === "/dashboard/staff/tests") return true;
    if (pathname === "/dashboard/staff/tests/new") return false;
    if (pathname.startsWith("/dashboard/staff/tests/") && pathname.endsWith("/results")) {
      return false;
    }
    return pathname.startsWith("/dashboard/staff/tests/");
  }
  if (
    item.href.includes("/analytics") &&
    pathname.endsWith("/analytics")
  ) {
    return pathname.startsWith(targetPath.replace(/\/analytics$/, "") || targetPath);
  }
  if (targetPath === "/dashboard/student/tests") {
    if (pathname === "/dashboard/student/tests") return true;
    if (pathname.startsWith("/dashboard/student/test/")) return true;
    if (pathname.startsWith("/dashboard/student/assess/")) return true;
    return false;
  }
  if (targetPath === "/dashboard/admin/skills/master") {
    return (
      pathname === "/dashboard/admin/skills/master" ||
      pathname.startsWith("/dashboard/admin/skills/master/")
    );
  }
  // Advanced tools live under Settings — keep Settings highlighted there.
  if (targetPath === "/dashboard/admin/settings") {
    if (pathname === "/dashboard/admin/settings") return true;
    if (pathname === "/dashboard/admin/analytics") return true;
    if (pathname.startsWith("/dashboard/admin/skills/master")) return true;
    if (pathname === "/dashboard/admin" && haveTab === "audit") return true;
    return false;
  }

  return false;
}

export function DashboardShell({
  title,
  subtitle,
  nav,
  children,
  narrow,
  fillViewport,
}: {
  title: string;
  subtitle?: string;
  nav: DashNavItem[];
  children: React.ReactNode;
  /** Narrower content column (e.g. exam) — collapses chrome */
  narrow?: boolean;
  /** Lock page to viewport height; child manages its own scroll (e.g. table). */
  fillViewport?: boolean;
}) {
  const { user } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (!user) return null;

  const sidebar = (
    <>
      <div className="dash-sidebar__brand">
        <Link to="/dashboard" className="dash-sidebar__mark" aria-label={`${COLLEGE_BRAND.name} home`}>
          {collegeBrandMark()}
        </Link>
        <div className="min-w-0">
          <p className="dash-sidebar__eyebrow">{COLLEGE_BRAND.shortName}</p>
          <p className="dash-sidebar__product">Campus portal</p>
        </div>
      </div>

      {nav.length > 0 ? (
        <nav className="dash-sidebar__nav" aria-label="Main">
          {nav.map((item) => {
            const active = isNavItemActive(item, location.pathname, location.search);
            return (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.end === true}
                className={() =>
                  ["dash-sidebar__link", active ? "dash-sidebar__link--active" : ""]
                    .filter(Boolean)
                    .join(" ")
                }
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      ) : (
        <div className="flex-1" />
      )}

      <div className="dash-sidebar__foot">
        <div className="dash-sidebar__user">
          <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
          <p className="truncate text-[11px] capitalize text-slate-500">
            {user.role.toLowerCase()} · {user.email}
          </p>
        </div>
        <div className="flex items-center gap-2 lg:hidden">
          <SignOutButton className="dash-topbar__signout" />
        </div>
        <div className="hidden lg:block">
          <SignOutButton className="dash-topbar__signout" />
        </div>
      </div>
    </>
  );

  if (narrow) {
    return (
      <div className="page-shell exam-shell">
        <header className="exam-shell__bar">
          <div className="exam-shell__inner">
            <div className="exam-shell__brand">
              <span className="exam-shell__mark" aria-hidden>
                {collegeBrandMark()}
              </span>
              <div className="min-w-0">
                <p className="exam-shell__eyebrow">{COLLEGE_BRAND.name}</p>
                <h1 className="exam-shell__title">{title}</h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SignOutButton />
            </div>
          </div>
        </header>
        <main className="exam-shell__main">
          <div className="animate-fade-in">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className={`dash-layout ${fillViewport ? "dash-layout--fill" : ""}`}>
      {/* Desktop sidebar */}
      <aside className="dash-sidebar dash-sidebar--desktop" aria-label="Sidebar">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {menuOpen ? (
        <button
          type="button"
          className="dash-sidebar__backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <aside
        id="app-nav"
        className={`dash-sidebar dash-sidebar--drawer ${menuOpen ? "dash-sidebar--open" : ""}`}
        aria-hidden={!menuOpen}
      >
        {sidebar}
      </aside>

      <div className="dash-main">
        <header className="dash-topbar">
          <button
            type="button"
            className="dash-topbar__menu lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="app-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
            <span aria-hidden className="flex flex-col gap-1">
              <span
                className={`block h-0.5 w-4 rounded-full bg-slate-700 transition ${
                  menuOpen ? "translate-y-1.5 rotate-45" : ""
                }`}
              />
              <span
                className={`block h-0.5 w-4 rounded-full bg-slate-700 transition ${
                  menuOpen ? "opacity-0" : ""
                }`}
              />
              <span
                className={`block h-0.5 w-4 rounded-full bg-slate-700 transition ${
                  menuOpen ? "-translate-y-1.5 -rotate-45" : ""
                }`}
              />
            </span>
            Menu
          </button>
          <div className="dash-topbar__titles">
            <h1 className="dash-topbar__title">{title}</h1>
            {subtitle ? <p className="dash-topbar__sub">{subtitle}</p> : null}
          </div>
          <div className="dash-topbar__actions">
            {user.role === "STAFF" ? <NotificationBell role="staff" /> : null}
            {user.role === "ADMIN" ? <NotificationBell role="admin" /> : null}
            {user.role === "STUDENT" ? <NotificationBell role="student" /> : null}
            <SignOutButton className="dash-topbar__signout" />
          </div>
        </header>

        <main className={`dash-content ${fillViewport ? "dash-content--fill" : ""}`}>
          <div className={`animate-fade-in ${fillViewport ? "dash-fill-child" : ""}`}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
