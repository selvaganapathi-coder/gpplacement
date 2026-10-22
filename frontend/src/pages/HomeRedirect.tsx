import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="page-shell flex min-h-screen items-center justify-center px-4">
        <div className="flex animate-fade-in-slow items-center gap-3 rounded-2xl border border-sky-200/50 bg-white/85 px-6 py-4 text-sm font-medium text-slate-600 shadow-warm backdrop-blur-sm">
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"
            aria-hidden
          />
          Loading…
        </div>
      </div>
    );
  }
  if (user) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/login" replace />;
}
