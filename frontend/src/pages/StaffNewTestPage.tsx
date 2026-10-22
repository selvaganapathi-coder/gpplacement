import { Link } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { DepartmentScopeBanner } from "@/components/DepartmentScopeBanner";
import { NewTestForm } from "@/components/NewTestForm";
import { useStaffDepartmentScope } from "@/hooks/useStaffDepartmentScope";
import { staffSidebarNav } from "@/lib/dashboardNav";

export function StaffNewTestPage() {
  const scope = useStaffDepartmentScope();

  return (
    <DashboardShell title="New assessment" nav={staffSidebarNav}>
      <div className="new-test-page">
        <div className="new-test-intro new-test-intro--slim">
          <Link to="/dashboard/staff/tests" className="new-test-intro__back">
            <span aria-hidden>←</span> Assessments
          </Link>
          <p className="new-test-intro__lede">
            {scope.departmentLabel
              ? `Draft for ${scope.departmentLabel}.`
              : "Draft until you publish."}
          </p>
        </div>

        <DepartmentScopeBanner
          departmentLabel={scope.departmentLabel}
          hasDepartment={scope.hasDepartment}
          loaded={scope.loaded}
        />

        {!scope.loaded ? (
          <p className="text-sm text-slate-600">Loading department scope…</p>
        ) : scope.hasDepartment ? (
          <NewTestForm
            createUrl="/api/staff/tests"
            redirectTo="/dashboard/staff/tests"
            submitLabel="Create draft"
            allowedPrograms={scope.managedPrograms}
            allowedCohorts={scope.managedCohorts}
          />
        ) : null}
      </div>
    </DashboardShell>
  );
}
