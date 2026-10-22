import { Link } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { NewTestForm } from "@/components/NewTestForm";
import { adminSidebarNav } from "@/lib/dashboardNav";

export function AdminNewTestPage() {
  return (
    <DashboardShell title="New assessment" nav={adminSidebarNav}>
      <div className="new-test-page">
        <div className="new-test-intro new-test-intro--slim">
          <Link to="/dashboard/admin?tab=tests" className="new-test-intro__back">
            <span aria-hidden>←</span> Assessments
          </Link>
          <p className="new-test-intro__lede">Draft until you publish.</p>
        </div>

        <NewTestForm
          createUrl="/api/admin/tests"
          redirectTo="/dashboard/admin?tab=tests"
          submitLabel="Create draft"
        />
      </div>
    </DashboardShell>
  );
}
