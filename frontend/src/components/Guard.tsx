import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/types";

function roleAllowed(userRole: Role, allowed: Role[]): boolean {
  if (allowed.includes(userRole)) return true;
  if (userRole === "SUPER_ADMIN" && allowed.includes("ADMIN")) return true;
  if (
    (userRole === "FACULTY" || userRole === "ADMIN" || userRole === "SUPER_ADMIN") &&
    allowed.includes("STAFF")
  ) {
    return true;
  }
  return false;
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600">
        Loading…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  }
  if (user.mustChangePassword && loc.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  return <>{children}</>;
}

export function RequireRoles({
  roles,
  children,
}: {
  roles: Role[];
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  if (!user || !roleAllowed(user.role, roles)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
