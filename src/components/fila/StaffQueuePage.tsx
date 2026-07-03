"use client";

import { QueuePanel } from "@/components/fila/QueuePanel";
import { AuthGate } from "@/components/auth/AuthGate";
import { STAFF_GUARD_ROLES } from "@/lib/constants";

export function StaffQueuePage({ roles }: { roles: readonly string[] }) {
  return (
    <AuthGate roles={[...roles]}>
      {(profile) => <QueuePanel profile={profile} />}
    </AuthGate>
  );
}

export function EmpilhadorQueuePage() {
  return <StaffQueuePage roles={STAFF_GUARD_ROLES} />;
}

export function AdminQueuePage() {
  return <StaffQueuePage roles={["administrador"]} />;
}
