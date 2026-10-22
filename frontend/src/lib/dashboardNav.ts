import type { DashNavItem } from "@/components/DashboardShell";

export const studentSidebarNav: DashNavItem[] = [
  { href: "/dashboard/student", label: "Home", end: true },
  { href: "/dashboard/student/tests", label: "My assessments", end: true },
  { href: "/dashboard/student/results", label: "My results", end: true },
  { href: "/dashboard/student/leaderboard", label: "Leaderboard", end: true },
  { href: "/dashboard/student/practice", label: "Practice", end: true },
];

export const staffSidebarNav: DashNavItem[] = [
  { href: "/dashboard/staff", label: "Home", end: true },
  { href: "/dashboard/staff/tests", label: "Assessments", end: true },
  { href: "/dashboard/staff/results", label: "Results desk", end: true },
  { href: "/dashboard/staff/students", label: "Students", end: true },
  { href: "/dashboard/staff/leaderboard", label: "Leaderboard", end: true },
  { href: "/dashboard/staff/analytics", label: "Analytics", end: true },
  { href: "/dashboard/staff/tests/new", label: "New assessment", end: true },
];

/** Primary admin nav — keep short; advanced tools live under Settings. */
export const adminSidebarNav: DashNavItem[] = [
  { href: "/dashboard/admin", label: "Home", end: true },
  { href: "/dashboard/admin?tab=users", label: "People" },
  { href: "/dashboard/admin?tab=tests", label: "Assessments" },
  { href: "/dashboard/admin/tests/new", label: "New assessment", end: true },
  { href: "/dashboard/admin/results", label: "Results", end: true },
  { href: "/dashboard/admin/students", label: "Students", end: true },
  { href: "/dashboard/admin/leaderboard", label: "Leaderboard", end: true },
  { href: "/dashboard/admin/settings", label: "Settings", end: true },
];
