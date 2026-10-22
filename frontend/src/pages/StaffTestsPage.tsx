import { DashboardShell } from "@/components/DashboardShell";
import { MarksDownloadPanel } from "@/components/MarksDownloadPanel";
import { TestsPanel } from "@/components/TestsPanel";
import { useStaffDepartmentScope } from "@/hooks/useStaffDepartmentScope";
import { staffSidebarNav } from "@/lib/dashboardNav";

export function StaffTestsPage() {
  const scope = useStaffDepartmentScope();

  return (
    <DashboardShell
      title="Assessments"
      subtitle={scope.departmentLabel ?? undefined}
      nav={staffSidebarNav}
    >
      {!scope.loaded ? null : !scope.hasDepartment ? (
        <p className="soft-alert mb-4 border-amber-200 bg-amber-50 text-amber-950">
          Ask an admin to assign your department before creating assessments.
        </p>
      ) : null}

      <details className="tests-marks mb-4">
        <summary className="tests-marks__summary">Marks CSV download</summary>
        <div className="tests-marks__body">
          <MarksDownloadPanel mode="staff" allowedPrograms={scope.managedPrograms} />
        </div>
      </details>

      <TestsPanel
        mode="staff"
        allowedPrograms={scope.managedPrograms}
        newTestPath="/dashboard/staff/tests/new"
        viewQuestionsPath={(id) => `/dashboard/staff/tests/${id}`}
        editQuestionsPath={(id) => `/dashboard/staff/tests/${id}/edit`}
        resultsPath={(id) => `/dashboard/staff/tests/${id}/results`}
      />
    </DashboardShell>
  );
}
