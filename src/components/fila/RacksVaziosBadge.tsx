import { PackageOpen } from "lucide-react";

export function RacksVaziosBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold uppercase text-teal-900 ${className}`}
    >
      <PackageOpen className="h-3 w-3" />
      Retorna com racks
    </span>
  );
}
