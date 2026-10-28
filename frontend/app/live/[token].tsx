import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { TrackingCard } from "@/src/components/LiveTracking";
import { fmtDate, fmtTime, usePolling } from "@/src/hooks";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, ErrorView, KV, Loader, Row, StatusBadge, Txt } from "@/src/ui";

/** Public family view of a shared trip — no login. */
export default function LiveTrip() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ["public-live", token], queryFn: () => api<any>(`/public/live/${token}`), retry: false });
  const d = q.data;
  const poll = useCallback(() => q.refetch(), [q]);
  usePolling(poll, 10000, !!d && !d.ended);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: space.md, backgroundColor: colors.surfaceInverse }}>
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <Txt v="h2" color={colors.brandPrimary}>Prajeta</Txt>
            <Txt v="caption" color={colors.surfaceTertiary}>Live trip · shared for safety</Txt>
          </View>
          {d ? <StatusBadge status={d.status} testID="public-live-status" /> : null}
        </Row>
      </View>
      {q.isLoading ? (
        <Loader />
      ) : q.error || !d ? (
        <ErrorView message={(q.error as any)?.message ?? "Trip not found"} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl, maxWidth: 640, width: "100%", alignSelf: "center" }}>
          <Card style={{ gap: 4 }}>
            <Txt v="h3">{d.customer_first_name ? `${d.customer_first_name}'s trip` : "Shared trip"}</Txt>
            <Txt v="caption">{d.service_name} · {d.city_name} · {fmtDate(d.date)} {fmtTime(d.time)}</Txt>
          </Card>
          {d.ended ? (
            <Card testID="public-live-ended" style={{ alignItems: "center", gap: space.sm }}>
              <Ionicons name={d.status === "COMPLETED" ? "checkmark-circle" : "information-circle"} size={44} color={d.status === "COMPLETED" ? colors.success : colors.muted} />
              <Txt v="h2">{d.status === "COMPLETED" ? "Trip completed safely" : "This trip has ended"}</Txt>
              <Txt v="caption">Live tracking is no longer available.</Txt>
            </Card>
          ) : d.active ? (
            <>
              {d.sos_active ? (
                <Card testID="public-sos-banner" style={{ borderColor: colors.error, borderWidth: 2, gap: 4 }}>
                  <Txt v="h3" color={colors.error}>SOS raised on this trip</Txt>
                  <Txt v="caption">Prajeta's safety team has been alerted and is in contact. In immediate danger call 112.</Txt>
                </Card>
              ) : null}
              <TrackingCard t={d} testID="public-tracking-card" />
            </>
          ) : (
            <Card testID="public-live-waiting" style={{ gap: 4 }}>
              <Txt v="h3">Waiting for driver</Txt>
              <Txt v="caption">The booking is confirmed. The map appears once a driver accepts and starts heading to the pickup.</Txt>
            </Card>
          )}
          {d.driver_info ? (
            <Card testID="public-driver-card" style={{ gap: 2 }}>
              <Txt v="h3" style={{ marginBottom: space.sm }}>Driver</Txt>
              <KV k="Name" v={d.driver_info.first_name} />
              <KV k="Rating" v={d.driver_info.rating ? `★ ${d.driver_info.rating}` : "New"} />
              {d.driver_info.badge_label ? <KV k="Recognition" v={d.driver_info.badge_label} /> : null}
              <KV k="Verification" v="ID, licence & police verified" />
              <KV k="Vehicle" v={d.vehicle} />
            </Card>
          ) : null}
          <Txt v="caption" center>Updates every 10 seconds. For emergencies call 112.</Txt>
          <Btn variant="ghost" title="Book a trusted driver with Prajeta" onPress={() => router.replace("/")} testID="public-live-home" />
        </ScrollView>
      )}
    </View>
  );
}
