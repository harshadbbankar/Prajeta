import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { View } from "react-native";

import { api } from "@/src/api";
import { TrackMap } from "@/src/components/TrackMap";
import { usePolling } from "@/src/hooks";
import { space, useTheme } from "@/src/theme";
import { Card, Row, Txt } from "@/src/ui";

export type TrackingData = any;

const ago = (s: number) => (s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`);

/** Customer view: driver's live position + ETA, refreshed every 8 seconds. */
export function LiveTracking({ bookingId }: { bookingId: string }) {
  const q = useQuery({ queryKey: ["tracking", bookingId], queryFn: () => api<any>(`/bookings/${bookingId}/tracking`) });
  const poll = useCallback(() => q.refetch(), [q]);
  const t = q.data;
  usePolling(poll, 8000, !!t?.active);
  if (!t?.active) return null;
  return <TrackingCard t={t} />;
}

/** Shared by the customer booking screen and the public family link. */
export function TrackingCard({ t, testID = "live-tracking-card" }: { t: TrackingData; testID?: string }) {
  const { colors } = useTheme();

  const markers: any[] = [];
  if (t.driver) markers.push({ ...t.driver, kind: "driver" });
  if (t.pickup && t.status !== "IN_PROGRESS") markers.push({ ...t.pickup, kind: "pickup" });
  if (t.destination && t.status === "IN_PROGRESS") markers.push({ ...t.destination, kind: "destination" });

  const headline =
    t.status === "DRIVER_ARRIVED"
      ? "Your driver has arrived"
      : !t.driver
        ? "Waiting for driver's location"
        : t.eta_mins != null
          ? `${t.status === "IN_PROGRESS" ? "Reaching destination" : "Driver arriving"} in ~${t.eta_mins} min`
          : t.status === "IN_PROGRESS"
            ? "Trip in progress"
            : "Driver on the way";

  return (
    <Card testID={testID} style={{ gap: space.md }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Row style={{ flex: 1 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.driver && !t.stale ? colors.success : colors.warning }} />
          <Txt v="label">Live tracking</Txt>
        </Row>
        {t.updated_secs_ago != null ? <Txt v="caption" testID="tracking-updated">Updated {ago(t.updated_secs_ago)}</Txt> : null}
      </Row>
      <View style={{ gap: 2 }}>
        <Txt v="h2" testID="tracking-headline">{headline}</Txt>
        {t.distance_km != null && t.status !== "DRIVER_ARRIVED" ? (
          <Txt v="body" color={colors.muted} testID="tracking-distance">
            {t.distance_km} km away from your {t.target === "destination" ? "destination" : "pickup"}
          </Txt>
        ) : null}
        {!t.driver ? <Txt v="caption">Your driver&apos;s position will appear here once they start sharing location.</Txt> : null}
        {t.driver && t.stale ? (
          <Row gap={4}>
            <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
            <Txt v="caption" color={colors.warning}>Signal weak — showing last known position.</Txt>
          </Row>
        ) : null}
      </View>
      {markers.length ? <TrackMap markers={markers} testID="tracking-map" /> : null}
      {t.pickup?.approx && t.status !== "IN_PROGRESS" ? <Txt v="caption">Pickup pin is approximate (city area).</Txt> : null}
    </Card>
  );
}
