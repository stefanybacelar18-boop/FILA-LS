import { AlertCircle, AlertTriangle, X } from "lucide-react";

type QueuePanelAlertsProps = {
  fetchError: string | null;
  actionError: string | null;
  onDismissActionError: () => void;
};

export function QueuePanelAlerts({
  fetchError,
  actionError,
  onDismissActionError,
}: QueuePanelAlertsProps) {
  return (
    <>
      {fetchError && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Erro ao carregar fila</p>
            <p>{fetchError}</p>
          </div>
        </div>
      )}

      {actionError && (
        <div
          className="mb-4 flex items-start justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          role="alert"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p>{actionError}</p>
          </div>
          <button
            type="button"
            onClick={onDismissActionError}
            className="shrink-0 rounded-lg p-1 hover:bg-amber-100"
            aria-label="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
