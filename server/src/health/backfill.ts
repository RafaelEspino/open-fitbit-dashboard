import type { AppDatabase } from "../db.js";
import { getSetting, setSetting } from "../db.js";
import type { SyncService } from "./sync.js";
import { addDays, todayLocal } from "../util/dates.js";

export interface BackfillStatus {
  running: boolean;
  done: boolean;
  cursor: string | null;
  emptyStreak: number;
}

const HOT_DAYS = 14;
const CHUNK_DAYS = 14;
const EMPTY_STREAK_LIMIT = 6;

export class BackfillManager {
  private running = false;

  constructor(private db: AppDatabase, private sync: SyncService) {}

  status(): BackfillStatus {
    return {
      running: this.running || getSetting(this.db, "backfill_running") === "1",
      done: getSetting(this.db, "backfill_done") === "1",
      cursor: getSetting(this.db, "backfill_cursor") ?? null,
      emptyStreak: Number(getSetting(this.db, "backfill_empty_streak") ?? 0),
    };
  }

  start(): void {
    if (this.running) return;
    if (getSetting(this.db, "backfill_done") === "1") {
      this.sync
        .syncRecent(3)
        .then((summary) => console.log("sync complete", summary))
        .catch((e) => console.error(`sync failed: ${(e as Error).message}`));
      return;
    }
    this.running = true;
    setSetting(this.db, "backfill_running", "1");
    this.run()
      .catch((e) => console.error(`backfill failed: ${(e as Error).message}`))
      .finally(() => {
        this.running = false;
        setSetting(this.db, "backfill_running", "0");
      });
  }

  private async run(): Promise<void> {
    const tz = this.sync.timeZone();
    const today = todayLocal(tz);
    let cursor = getSetting(this.db, "backfill_cursor");
    if (!cursor) {
      const hotStart = addDays(today, -HOT_DAYS);
      console.log(`backfill: hot load ${hotStart}..${today}`);
      await this.sync.syncAll({ start: hotStart, end: addDays(today, 1) });
      cursor = hotStart;
      setSetting(this.db, "backfill_cursor", cursor);
    } else {
      await this.sync.syncRecent(3);
    }
    let emptyStreak = Number(getSetting(this.db, "backfill_empty_streak") ?? 0);
    while (true) {
      const end = cursor;
      const start = addDays(cursor, -CHUNK_DAYS);
      const summary = await this.sync.syncAll({ start, end });
      const empty = summary.metricsRows + summary.hrRows + summary.sleepRows === 0;
      emptyStreak = empty ? emptyStreak + 1 : 0;
      setSetting(this.db, "backfill_empty_streak", String(emptyStreak));
      cursor = start;
      setSetting(this.db, "backfill_cursor", cursor);
      console.log(
        `backfill: chunk ${start}..${end} new rows (metrics=${summary.metricsRows} hr=${summary.hrRows} sleep=${summary.sleepRows} exercise=${summary.exerciseRows}) empty=${empty} streak=${emptyStreak}`
      );
      if (emptyStreak >= EMPTY_STREAK_LIMIT) {
        setSetting(this.db, "backfill_done", "1");
        console.log("backfill: complete");
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
