import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  title,
  value,
  sub,
  iconClassName,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  sub?: string;
  iconClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="rounded-lg bg-muted p-2.5">
          <Icon className={cn("size-5", iconClassName ?? "text-muted-foreground")} />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{title}</div>
          <div className="truncate text-xl font-semibold tabular-nums">{value}</div>
          {sub ? <div className="text-[11px] text-muted-foreground/70">{sub}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatSkeleton() {
  return <div className="h-[76px] rounded-xl bg-muted/60" />;
}
