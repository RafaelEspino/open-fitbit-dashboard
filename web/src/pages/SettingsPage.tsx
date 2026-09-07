import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Battery, Link2, Link2Off, RefreshCw, Watch } from "lucide-react";
import { fetchAuthStatus, fetchDevices, postDisconnect, postSyncNow } from "../api";
import { relativeTime } from "../format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
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
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const connected = status.data?.connected ?? false;
  const backfill = status.data?.backfill;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Google Health connection
            <Badge variant={connected ? "secondary" : "outline"}>
              {connected ? "Connected" : "Not connected"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Your Fitbit data flows from the device to the phone app, then to Google —
            this app syncs it via the Google Health API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Row label="Health user ID" value={status.data?.healthUserId ?? "—"} />
            <Row label="Last sync" value={relativeTime(status.data?.lastSyncAt)} />
          </div>
          <Separator />
          <div className="flex flex-wrap gap-2">
            {connected ? (
              <>
                <Button onClick={() => syncNow.mutate()} disabled={syncNow.isPending} size="sm">
                  <RefreshCw className={syncNow.isPending ? "animate-spin" : ""} />
                  {syncNow.isPending ? "Syncing…" : "Sync now"}
                </Button>
                <Button
                  onClick={() => disconnect.mutate()}
                  disabled={disconnect.isPending}
                  size="sm"
                  variant="outline"
                >
                  <Link2Off />
                  Disconnect
                </Button>
                {syncNow.isSuccess && !syncNow.isPending ? (
                  <span className="self-center text-xs text-emerald-400">Sync started</span>
                ) : null}
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  window.location.href = "/api/auth/start";
                }}
              >
                <Link2 />
                Connect Google account
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Watch className="size-4 text-muted-foreground" />
            Devices
          </CardTitle>
        </CardHeader>
        <CardContent>
          {devices.isError ? (
            <p className="text-sm text-muted-foreground">
              Device info unavailable ({(devices.error as Error).message})
            </p>
          ) : devices.isLoading ? (
            <div className="h-14 rounded bg-muted/40" />
          ) : (devices.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No paired devices found.</p>
          ) : (
            devices.data!.map((d, i) => (
              <div key={d.name}>
                {i > 0 ? <Separator /> : null}
                <Row label="Device" value={d.deviceVersion ?? d.deviceType ?? "Unknown"} />
                <Row
                  label="Battery"
                  value={
                    d.batteryLevel != null ? `${d.batteryLevel}% (${d.batteryStatus ?? "—"})` : "—"
                  }
                />
                <Row label="Last device sync" value={relativeTime(d.lastSyncTime)} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Historical backfill
            <Badge variant={backfill?.done ? "outline" : backfill?.running ? "secondary" : "outline"}>
              {backfill?.done ? "Complete" : backfill?.running ? "Running" : "Idle"}
            </Badge>
          </CardTitle>
          <CardDescription>
            The backfill walks backwards through your Google Health history in 14-day chunks
            and stops once it reaches data-free months.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Row label="Cursor" value={backfill?.cursor ?? "—"} />
        </CardContent>
      </Card>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Battery className="size-3.5" />
        Device data appears after your Fitbit app syncs with the cloud.
      </p>
    </div>
  );
}
