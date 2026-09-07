import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAuthStatus, fetchDevices, postDisconnect, postSyncNow } from "../api";
import { relativeTime } from "../format";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-200">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["authStatus"], queryFn: fetchAuthStatus, refetchInterval: 30_000 });
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: fetchDevices,
    enabled: status.data?.connected ?? false,
    refetchInterval: 60_000,
    retry: false,
  });

  const syncNow = useMutation({
    mutationFn: postSyncNow,
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries(), 4000);
    },
  });

  const disconnect = useMutation({
    mutationFn: postDisconnect,
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  const connected = status.data?.connected ?? false;
  const backfill = status.data?.backfill;

  return (
    <div className="space-y-4">
      <Section title="Google Health connection">
        <Row label="Status" value={connected ? "Connected" : "Not connected"} />
        <Row label="Health user ID" value={status.data?.healthUserId ?? "—"} />
        <Row label="Last sync" value={relativeTime(status.data?.lastSyncAt)} />
        <div className="mt-3 flex gap-2">
          {connected ? (
            <>
              <button
                onClick={() => syncNow.mutate()}
                disabled={syncNow.isPending}
                className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {syncNow.isPending ? "Syncing…" : "Sync now"}
              </button>
              <button
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Disconnect
              </button>
            </>
          ) : (
            <a
              href="/api/auth/start"
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              Connect Google account
            </a>
          )}
          {syncNow.isSuccess && !syncNow.isPending ? (
            <span className="self-center text-xs text-emerald-400">Sync started</span>
          ) : null}
        </div>
      </Section>

      <Section title="Devices">
        {devices.isError ? (
          <p className="text-sm text-slate-500">Device info unavailable ({(devices.error as Error).message})</p>
        ) : devices.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (devices.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">No paired devices found.</p>
        ) : (
          devices.data!.map((d) => (
            <div key={d.name} className="border-b border-slate-800 py-2 last:border-0">
              <Row label="Device" value={d.deviceVersion ?? d.deviceType ?? "Unknown"} />
              <Row
                label="Battery"
                value={d.batteryLevel != null ? `${d.batteryLevel}% (${d.batteryStatus ?? "—"})` : "—"}
              />
              <Row label="Last device sync" value={relativeTime(d.lastSyncTime)} />
            </div>
          ))
        )}
      </Section>

      <Section title="Historical backfill">
        <Row
          label="Status"
          value={
            backfill?.done
              ? "Complete"
              : backfill?.running
                ? "Running"
                : connected
                  ? "Idle"
                  : "—"
          }
        />
        <Row label="Cursor" value={backfill?.cursor ?? "—"} />
        <p className="mt-2 text-xs text-slate-500">
          The backfill walks backwards through your Google Health history in 14-day chunks and pauses
          automatically once it reaches data-free months.
        </p>
      </Section>
    </div>
  );
}
