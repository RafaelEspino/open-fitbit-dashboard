import cron from "node-cron";
import type { BackfillManager } from "./backfill.js";
import type { SyncService } from "./sync.js";

export interface SchedulerHandle {
  stop(): void;
}

export function startScheduler(sync: SyncService, backfill: BackfillManager): SchedulerHandle {
  const jobs = [
    cron.schedule("30 3 * * *", () => {
      sync
        .syncRecent(3)
        .then((summary) => console.log("nightly sync complete", summary))
        .catch((e) => console.error(`nightly sync failed: ${(e as Error).message}`));
    }),
    cron.schedule("0 */6 * * *", () => {
      sync
        .syncRecent(2)
        .then((summary) => console.log("6h sync complete", summary))
        .catch((e) => console.error(`6h sync failed: ${(e as Error).message}`));
    }),
  ];
  void backfill;
  return {
    stop: () => {
      for (const job of jobs) job.stop();
    },
  };
}
