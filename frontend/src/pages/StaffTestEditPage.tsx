import { Link, useParams } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { DepartmentScopeBanner } from "@/components/DepartmentScopeBanner";
import { EditTestForm } from "@/components/EditTestForm";
import { useStaffDepartmentScope } from "@/hooks/useStaffDepartmentScope";
import { adminSidebarNav, staffSidebarNav } from "@/lib/dashboardNav";

type StaffTestEditPageProps = {
  backHref?: string;
  testsBase?: string;
};

export function StaffTestEditPage({
  backHref = "/dashboard/staff/tests",
  testsBase = "/dashboard/staff/tests",
}: StaffTestEditPageProps) {
  const { id } = useParams<{ id: string }>();
  const scope = useStaffDepartmentScope();
  if (!id) return null;
  const isAdmin = backHref.includes("/admin");
  const listHref = isAdmin ? "/dashboard/admin?tab=tests" : "/dashboard/staff/tests";

  return (
    <DashboardShell
      title="Edit assessment"
      nav={isAdmin ? adminSidebarNav : staffSidebarNav}
    >
      <div className="new-test-page">
        <div className="new-test-intro new-test-intro--slim">
          <Link to={listHref} className="new-test-intro__back">
            <span aria-hidden>←</span> Assessments
          </Link>
          <p className="new-test-intro__lede">
            {isAdmin
              ? "Update paper and rules."
              : scope.departmentLabel
                ? `Editing within ${scope.departmentLabel}.`
                : "Update paper and rules."}
          </p>
          <Link
            to={`${testsBase}/${id}`}
            className="text-[13px] font-semibold text-slate-600 hover:text-brand-800 hover:underline"
          >
            View details
          </Link>
        </div>

        {!isAdmin ? (
          <DepartmentScopeBanner
            departmentLabel={scope.departmentLabel}
            hasDepartment={scope.hasDepartment}
            loaded={scope.loaded}
          />
        ) : null}

        <EditTestForm
          testId={id}
          redirectTo={`${testsBase}/${id}`}
          allowedPrograms={isAdmin ? undefined : scope.managedPrograms}
          allowedCohorts={isAdmin ? undefined : scope.managedCohorts}
        />
      </div>
    </DashboardShell>
  );
}
