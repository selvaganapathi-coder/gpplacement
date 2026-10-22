import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function DashboardRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  switch (user.role) {
    case "SUPER_ADMIN":
    case "ADMIN":
      return <Navigate to="/dashboard/admin" replace />;
    case "FACULTY":
    case "STAFF":
      return <Navigate to="/dashboard/staff" replace />;
    case "STUDENT":
      return <Navigate to="/dashboard/student" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
}
