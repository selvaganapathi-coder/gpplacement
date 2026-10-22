import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { RequireAuth, RequireRoles } from "@/components/Guard";
import { HomeRedirect } from "@/pages/HomeRedirect";
import { LoginPage } from "@/pages/LoginPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { ChangePasswordPage } from "@/pages/ChangePasswordPage";
import { DashboardRedirect } from "@/pages/DashboardRedirect";
import { StudentDashboard } from "@/pages/StudentDashboard";
import { StudentTestPage } from "@/pages/StudentTestPage";
import { StudentTestResultPage } from "@/pages/StudentTestResultPage";
import { StudentResultsPage } from "@/pages/StudentResultsPage";
import { StudentTestsPage } from "@/pages/StudentTestsPage";
import { StudentPracticePage } from "@/pages/StudentPracticePage";
import { StudentSelfAssessPage } from "@/pages/StudentSelfAssessPage";
import { StaffDashboard } from "@/pages/StaffDashboard";
import { StaffNewTestPage } from "@/pages/StaffNewTestPage";
import { StaffTestsPage } from "@/pages/StaffTestsPage";
import { StaffTestResultsPage } from "@/pages/StaffTestResultsPage";
import { StaffAttemptReviewPage } from "@/pages/StaffAttemptReviewPage";
import { LeaderboardPage } from "@/pages/LeaderboardPage";
import { StaffTestViewPage } from "@/pages/StaffTestViewPage";
import { StaffTestEditPage } from "@/pages/StaffTestEditPage";
import { StaffStudentsPage } from "@/pages/StaffStudentsPage";
import { StaffStudentDetailPage } from "@/pages/StaffStudentDetailPage";
import { ResultsByTestPage } from "@/pages/ResultsByTestPage";
import { AdminDashboard } from "@/pages/AdminDashboard";
import { AdminNewTestPage } from "@/pages/AdminNewTestPage";
import { AdminPersonPage } from "@/pages/AdminPersonPage";
import { AdminSettingsPage } from "@/pages/AdminSettingsPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import {
  SkillMasterPage,
  SkillCategoryDetailPage,
} from "@/modules/skill-assessment";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/change-password"
          element={
            <RequireAuth>
              <ChangePasswordPage />
            </RequireAuth>
          }
        />
        <Route path="/" element={<HomeRedirect />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardRedirect />
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/student"
          element={
            <RequireAuth>
              <RequireRoles roles={["STUDENT"]}>
                <StudentDashboard />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/student/test/:id"
          element={
            <RequireAuth>
              <RequireRoles roles={["STUDENT"]}>
                <StudentTestPage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/student/attempts/:attemptId/result"
          element={
            <RequireAuth>
              <RequireRoles roles={["STUDENT"]}>
                <StudentTestResultPage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/student/results"
          element={
            <RequireAuth>
              <RequireRoles roles={["STUDENT"]}>
                <StudentResultsPage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/student/leaderboard"
          element={
            <RequireAuth>
              <RequireRoles roles={["STUDENT"]}>
                <LeaderboardPage role="student" />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/student/tests"
          element={
            <RequireAuth>
              <RequireRoles roles={["STUDENT"]}>
                <StudentTestsPage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/student/practice"
          element={
            <RequireAuth>
              <RequireRoles roles={["STUDENT"]}>
                <StudentPracticePage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/student/assess/:id"
          element={
            <RequireAuth>
              <RequireRoles roles={["STUDENT"]}>
                <StudentSelfAssessPage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/staff"
          element={
            <RequireAuth>
              <RequireRoles roles={["STAFF"]}>
                <StaffDashboard />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/staff/tests"
          element={
            <RequireAuth>
              <RequireRoles roles={["STAFF"]}>
                <StaffTestsPage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/staff/results"
          element={
            <RequireAuth>
              <RequireRoles roles={["STAFF"]}>
                <ResultsByTestPage role="staff" />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/staff/students"
          element={
            <RequireAuth>
              <RequireRoles roles={["STAFF"]}>
                <StaffStudentsPage role="staff" />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/staff/students/:id"
          element={
            <RequireAuth>
              <RequireRoles roles={["STAFF"]}>
                <StaffStudentDetailPage role="staff" />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/staff/tests/new"
          element={
            <RequireAuth>
              <RequireRoles roles={["STAFF"]}>
                <StaffNewTestPage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/staff/tests/:id/edit"
          element={
            <RequireAuth>
              <RequireRoles roles={["STAFF"]}>
                <StaffTestEditPage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/staff/tests/:id"
          element={
            <RequireAuth>
              <RequireRoles roles={["STAFF"]}>
                <StaffTestViewPage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/staff/tests/:id/results"
          element={
            <RequireAuth>
              <RequireRoles roles={["STAFF"]}>
                <StaffTestResultsPage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/staff/tests/:id/attempts/:attemptId"
          element={
            <RequireAuth>
              <RequireRoles roles={["STAFF"]}>
                <StaffAttemptReviewPage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/staff/analytics"
          element={
            <RequireAuth>
              <RequireRoles roles={["STAFF"]}>
                <AnalyticsPage role="staff" />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/staff/leaderboard"
          element={
            <RequireAuth>
              <RequireRoles roles={["STAFF"]}>
                <LeaderboardPage role="staff" />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/admin"
          element={
            <RequireAuth>
              <RequireRoles roles={["ADMIN"]}>
                <AdminDashboard />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/admin/settings"
          element={
            <RequireAuth>
              <RequireRoles roles={["ADMIN"]}>
                <AdminSettingsPage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/admin/people/:id"
          element={
            <RequireAuth>
              <RequireRoles roles={["ADMIN"]}>
                <AdminPersonPage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/admin/analytics"
          element={
            <RequireAuth>
              <RequireRoles roles={["ADMIN"]}>
                <AnalyticsPage role="admin" />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/admin/leaderboard"
          element={
            <RequireAuth>
              <RequireRoles roles={["ADMIN"]}>
                <LeaderboardPage role="admin" />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/admin/skills/master"
          element={
            <RequireAuth>
              <RequireRoles roles={["ADMIN"]}>
                <SkillMasterPage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/admin/skills/master/:categoryId"
          element={
            <RequireAuth>
              <RequireRoles roles={["ADMIN"]}>
                <SkillCategoryDetailPage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/admin/results"
          element={
            <RequireAuth>
              <RequireRoles roles={["ADMIN"]}>
                <ResultsByTestPage role="admin" />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/admin/students"
          element={
            <RequireAuth>
              <RequireRoles roles={["ADMIN"]}>
                <StaffStudentsPage role="admin" />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/admin/students/:id"
          element={
            <RequireAuth>
              <RequireRoles roles={["ADMIN"]}>
                <StaffStudentDetailPage role="admin" />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/admin/tests/new"
          element={
            <RequireAuth>
              <RequireRoles roles={["ADMIN"]}>
                <AdminNewTestPage />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/admin/tests/:id/edit"
          element={
            <RequireAuth>
              <RequireRoles roles={["ADMIN"]}>
                <StaffTestEditPage
                  backHref="/dashboard/admin?tab=tests"
                  testsBase="/dashboard/admin/tests"
                />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/admin/tests/:id"
          element={
            <RequireAuth>
              <RequireRoles roles={["ADMIN"]}>
                <StaffTestViewPage
                  backHref="/dashboard/admin?tab=tests"
                  backLabel="All tests"
                />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/admin/tests/:id/results"
          element={
            <RequireAuth>
              <RequireRoles roles={["ADMIN"]}>
                <StaffTestResultsPage role="admin" />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/admin/tests/:id/attempts/:attemptId"
          element={
            <RequireAuth>
              <RequireRoles roles={["ADMIN"]}>
                <StaffAttemptReviewPage role="admin" />
              </RequireRoles>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
