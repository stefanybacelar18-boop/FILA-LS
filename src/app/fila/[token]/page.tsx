import { QueueTracker } from "@/components/fila/QueueTracker";

export default async function FilaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <QueueTracker token={token} />;
}
