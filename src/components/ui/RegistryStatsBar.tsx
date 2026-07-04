import { cn } from "@/lib/utils";
import { StatCard } from "@/components/ui/StatCard";

type MetricItem = {
  label: string;
  value: number;
  tone?: "brand" | "amber" | "emerald" | "slate" | "blue" | "green";
};

const toneMap = {
  brand: "brand",
  blue: "blue",
  amber: "amber",
  emerald: "green",
  green: "green",
  slate: "slate",
} as const;

export function RegistryStatsBar({
  items,
  className,
}: {
  items: MetricItem[];
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {items.map(({ label, value, tone = "brand" }) => (
        <StatCard
          key={label}
          title={label}
          value={value}
          accent={toneMap[tone]}
        />
      ))}
    </div>
  );
}
