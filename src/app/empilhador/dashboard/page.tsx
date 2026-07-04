"use client";

import { AuthGate } from "@/components/auth/AuthGate";
import { EmpilhadorDashboardPanel } from "@/components/dashboard/EmpilhadorDashboardPanel";

export default function EmpilhadorDashboardPage() {
  return (
    <AuthGate roles={["empilhador"]}>
      {(profile) => (
        <EmpilhadorDashboardPanel
          profile={{ id: profile.id, full_name: profile.full_name, email: profile.email }}
        />
      )}
    </AuthGate>
  );
}
