import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Marker, TrackMap } from "@/src/components/TrackMap";
import { useConfig, usePolling } from "@/src/hooks";
import { radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, ChipRow, Empty, ErrorView, Header, Loader, Row, Txt, useToast } from "@/src/ui";

const ago = (s: number | null) => (s == null ? "no location yet" : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`);

export default function LiveMap() {
  const { booking } = useLocalSearchParams<{ booking?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const cfg = useConfig();
  const [city, setCity] = useState("mumbai");
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const q = useQuery({
    queryKey: ["live-drivers", booking ?? "", city],
    queryFn: () => api<any>(booking ? `/admin/live-drivers?booking_id=${booking}` : `/admin/live-drivers?city_id=${city}`),
    retry: false,
  });
  const poll = useCallback(() => q.refetch(), [q]);
  usePolling(poll, 15000);
  const d = q.data;

  const offer = async (driverId: string) => {
    setBusy(driverId);
    try {
      await api(`/admin/bookings/${booking}/assign`, { body: { driver_id: driverId } });
      toast("Offer sent to driver");
      qc.invalidateQueries({ queryKey: ["admin-booking", booking] });
      router.back();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy("");
    }
  };

  const located = (d?.drivers ?? []).filter((r: any) => r.location);
  const markers: Marker[] = located.map((r: any, i: number) => ({
    ...r.location,
    kind: "driver",
    id: r.driver_id,
    label: String(i + 1),
    busy: r.state === "on_trip",
    selected: sel === r.driver_id,
    onPress: () => setSel(r.driver_id),
  }));
  if (d?.pickup) markers.push({ ...d.pickup, kind: "pickup", id: "pickup" });

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Live driver map" subtitle={d?.booking ? `Nearest drivers for ${d.booking.ref}` : "Online and on-trip drivers"} />
      {!booking ? (
        <View style={{ backgroundColor: colors.surface }}>
          <ChipRow>
            {(cfg.data?.cities ?? []).filter((c) => c.enabled).map((c) => (
              <Chip key={c.id} label={c.name} selected={city === c.id} onPress={() => { setCity(c.id); setSel(null); }} testID={`live-city-${c.id}`} />
            ))}
          </ChipRow>
        </View>
      ) : null}
      {q.isLoading ? <Loader /> : q.error ? <ErrorView message={(q.error as any).message} onRetry={() => q.refetch()} /> : (
        <ScrollView refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />} contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}>
          <Row>
            {[["Available", d.counts.available, colors.surfaceInverse], ["On trip", d.counts.on_trip, colors.muted], ["No location", d.counts.no_location, colors.warning]].map(([l, n, c]: any) => (
              <View key={l} testID={`live-count-${l.replace(/ /g, "-").toLowerCase()}`} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.sm, borderWidth: 1, borderColor: colors.border }}>
                <Row gap={6}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c }} /><Txt v="caption">{l}</Txt></Row>
                <Txt v="num">{n}</Txt>
              </View>
            ))}
          </Row>
          {markers.length ? <TrackMap markers={markers} height={320} testID="live-driver-map" /> : (
            <Card tone="grey"><Txt v="caption">No driver locations yet. Drivers appear here when they go online and allow location sharing.</Txt></Card>
          )}
          {d.pickup ? <Txt v="caption">Red pin = pickup ({d.booking?.pickup}). Numbers = nearest first. Grey = on another trip.</Txt> : <Txt v="caption">Numbers rank drivers; grey markers are on a trip. Tap a marker to highlight.</Txt>}
          {!d.drivers.length ? <Empty icon="car-outline" title="No drivers online" body="Online and on-trip drivers in this city appear here." /> : null}
          {d.drivers.map((r: any, i: number) => {
            const rank = located.findIndex((x: any) => x.driver_id === r.driver_id);
            return (
              <Card key={r.driver_id} testID={`live-driver-${i}`} onPress={() => setSel(r.driver_id)} style={{ gap: space.sm, borderColor: sel === r.driver_id ? colors.brandPrimary : colors.border, borderWidth: sel === r.driver_id ? 1.5 : 1 }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Row style={{ flex: 1 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: r.state === "on_trip" ? colors.muted : colors.surfaceInverse }}>
                      <Txt v="caption" color={colors.onSurfaceInverse} style={{ fontWeight: "800" }}>{rank >= 0 ? rank + 1 : "–"}</Txt>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt v="bodyBold" numberOfLines={1}>{r.name} {r.badge ? (r.badge === "gold" ? "🏆" : "🎖️") : ""}</Txt>
                      <Txt v="caption">{r.state === "on_trip" ? `On trip ${r.trip?.ref ?? ""}` : "Available"} · ★ {r.rating ?? "New"} · {ago(r.updated_secs_ago)}</Txt>
                    </View>
                  </Row>
                  {r.distance_km != null ? (
                    <View style={{ alignItems: "flex-end" }}>
                      <Txt v="num" color={colors.brandPrimary} testID={`live-driver-distance-${i}`}>{r.distance_km} km</Txt>
                      <Txt v="caption">~{r.eta_mins} min</Txt>
                    </View>
                  ) : null}
                </Row>
                {r.stale && r.location ? (
                  <Row gap={4}><Ionicons name="time-outline" size={14} color={colors.warning} /><Txt v="caption" color={colors.warning}>Location may be out of date</Txt></Row>
                ) : null}
                {booking && r.reason ? <Txt v="caption" color={colors.error}>{r.reason}</Txt> : null}
                <Row>
                  {r.phone ? <Btn small style={{ flex: 1 }} variant="outline" icon="call" title="Call" onPress={() => Linking.openURL(`tel:${r.phone}`)} testID={`live-driver-call-${i}`} /> : null}
                  {booking && ["AWAITING_ASSIGNMENT", "ASSIGNED"].includes(d.booking?.status) ? (
                    <Btn small style={{ flex: 1 }} title="Offer job" disabled={!!r.reason} loading={busy === r.driver_id} onPress={() => offer(r.driver_id)} testID={`live-driver-offer-${i}`} />
                  ) : (
                    <Btn small style={{ flex: 1 }} variant="ghost" title="Profile" onPress={() => router.push(`/erp/driver/${r.driver_id}` as any)} testID={`live-driver-profile-${i}`} />
                  )}
                </Row>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
