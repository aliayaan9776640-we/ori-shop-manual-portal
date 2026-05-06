import { Navigate } from "react-router-dom";
import { useCurrentUser } from "@/lib/store";
import type { Role } from "@/lib/types";
import type { ReactNode } from "react";

interface RoleGateProps {
  roles: Role[];
  children: ReactNode;
}

export default function RoleGate({ roles, children }: RoleGateProps) {
  const user = useCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold">Access denied</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your role ({user.role}) cannot view this page.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
