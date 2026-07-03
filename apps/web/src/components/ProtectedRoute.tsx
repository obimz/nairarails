import { Navigate } from "react-router-dom";

/**
 * ProtectedRoute — gates access to dashboard pages behind a stored API key.
 *
 * Checks localStorage for `nairarails_api_key`. If the key is missing the
 * user is redirected to /signup. If it's present the child component renders.
 *
 * Note: localStorage is intentionally used here for hackathon simplicity.
 * Production would use a secure HttpOnly session cookie instead.
 */
interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const hasKey = Boolean(localStorage.getItem("nairarails_api_key"));

  if (!hasKey) {
    return <Navigate to="/signup" replace />;
  }

  return <>{children}</>;
}
