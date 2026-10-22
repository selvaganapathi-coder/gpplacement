type DepartmentScopeBannerProps = {
  departmentLabel: string | null;
  hasDepartment: boolean;
  loaded?: boolean;
};

/** Shows staff their locked department on Welcome / Training / Analytics / New test. */
export function DepartmentScopeBanner({
  departmentLabel,
  hasDepartment,
  loaded = true,
}: DepartmentScopeBannerProps) {
  if (!loaded) return null;

  if (!hasDepartment) {
    return (
      <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        Your account has no department yet. Ask an admin to assign your department — until then
        you cannot create or manage assessments.
      </p>
    );
  }

  return (
    <p className="mb-4 rounded-lg border border-sky-200/70 bg-sky-50/80 px-3 py-2 text-sm text-slate-700">
      Department scope: <strong>{departmentLabel}</strong>. You can only see, create, edit, publish,
      and view analytics for this department — not others.
    </p>
  );
}
