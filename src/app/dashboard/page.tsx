"use client";

import { STAFF_GUARD_ROLES } from "@/lib/constants";
import { AuthGate } from "@/components/auth/AuthGate";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";

export default function DashboardPage() {
  return (
    <AuthGate roles={[...STAFF_GUARD_ROLES]}>
      {(profile) => (
        <DashboardPanel
          profile={{
            role: profile.role,
            full_name: profile.full_name,
          }}
        />
      )}
    </AuthGate>
  );
}
