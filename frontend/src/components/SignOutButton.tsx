import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function SignOutButton({ className = "" }: { className?: string }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={async () => {
        await logout();
        navigate("/login", { replace: true });
      }}
      className={`btn-ghost shrink-0 ${className}`.trim()}
    >
      Sign out
    </button>
  );
}
