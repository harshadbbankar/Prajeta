import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { TrackMap } from "@/src/components/TrackMap";
import { usePolling } from "@/src/hooks";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, ChipRow, Empty, ErrorView, Field, Header, Loader, Row, Sheet, Txt, useToast } from "@/src/ui";

const FILTERS = [["active", "Active"], ["resolved", "Resolved"], ["all", "All"]];
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function SosAlerts() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [filter, setFilter] = useState("active");
  const [resolving, setResolving] = useState<any>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const q = useQuery({ queryKey: ["admin-sos", filter], queryFn: () => api<any>(`/admin/sos?status=${filter}`), retry: false });
  const poll = useCallback(() => q.refetch(), [q]);
  usePolling(poll, 10000);

  const act = async (id: string, action: string, n = "") => {
    setBusy(id + action);
    try {
      await api(`/admin/sos/${id}`, { body: { action, note: n } });
      toast(action === "resolve" ? "SOS resolved" : "Acknowledged — the person is told help is coming");
      setResolving(null);
      setNote("");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy("");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="SOS alerts" subtitle="Call first, then acknowledge and resolve" />
      <View style={{ backgroundColor: colors.surface }}>
        <ChipRow>{FILTERS.map(([k, l]) => <Chip key={k} label={l} selected={filter === k} onPress={() => setFilter(k)} testID={`sos-filter-${k}`} />)}</ChipRow>
      </View>
      {q.isLoading ? <Loader /> : q.error ? <ErrorView message={(q.error as any).message} onRetry={() => q.refetch()} /> : (
        <ScrollView refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />} contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}>
          {!q.data.items.length ? <Empty icon="shield-checkmark-outline" title="No SOS alerts" body="Alerts raised by customers or drivers during live trips appear here." /> : null}
          {q.data.items.map((a: any, i: number) => {
            const tone = a.status === "OPEN" ? colors.error : a.status === "ACKNOWLEDGED" ? colors.warning : colors.success;
            return (
              <Card key={a.id} testID={`sos-alert-${i}`} style={{ gap: space.sm, borderColor: tone, borderWidth: a.status === "RESOLVED" ? 1 : 2 }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Row style={{ flex: 1 }}>
                    <Ionicons name="alert-circle" size={20} color={tone} />
                    <Txt v="h3">{a.ref}</Txt>
                  </Row>
                  <Txt v="label" color={tone} testID={`sos-alert-status-${i}`}>{a.status}</Txt>
                </Row>
                <Txt v="caption">Raised by {a.raised_by_role} {a.raised_by_name ?? ""} · {when(a.created_at)} · trip {a.trip_status.replace(/_/g, " ").toLowerCase()}</Txt>
                {a.note ? <Txt v="body">“{a.note}”</Txt> : null}
                <Txt v="caption">Customer: {a.customer_name ?? "—"} · Driver: {a.driver_name ?? "—"}</Txt>
                {a.location ? (
                  <>
                    <TrackMap markers={[{ ...a.location, kind: a.location.source === "device" && a.raised_by_role === "customer" ? "pickup" : "driver" }]} height={160} testID={`sos-map-${i}`} />
                    <Txt v="caption">{a.location.source === "device" ? "Location from the person's phone" : "Driver's last known location"} · {when(a.location.at)}</Txt>
                  </>
                ) : <Txt v="caption">No location available</Txt>}
                <Row>
                  {a.customer_phone ? <Btn small style={{ flex: 1 }} variant={a.raised_by_role === "customer" && a.status !== "RESOLVED" ? "danger" : "outline"} icon="call" title="Customer" onPress={() => Linking.openURL(`tel:${a.customer_phone}`)} testID={`sos-call-customer-${i}`} /> : null}
                  {a.driver_phone ? <Btn small style={{ flex: 1 }} variant={a.raised_by_role === "driver" && a.status !== "RESOLVED" ? "danger" : "outline"} icon="call" title="Driver" onPress={() => Linking.openURL(`tel:${a.driver_phone}`)} testID={`sos-call-driver-${i}`} /> : null}
                </Row>
                {a.status === "OPEN" ? <Btn title="Acknowledge — I'm handling it" icon="hand-left" variant="dark" loading={busy === a.id + "acknowledge"} onPress={() => act(a.id, "acknowledge")} testID={`sos-ack-${i}`} /> : null}
                {a.status !== "RESOLVED" ? <Btn title="Mark resolved" icon="checkmark-circle" variant="success" onPress={() => setResolving(a)} testID={`sos-resolve-${i}`} /> : null}
                {a.acknowledged_by ? <Txt v="caption">Acknowledged by {a.acknowledged_by} · {when(a.acknowledged_at)}</Txt> : null}
                {a.resolution ? <Txt v="caption">Resolved by {a.resolved_by}: {a.resolution}</Txt> : null}
                <Btn small variant="ghost" title="Open booking" onPress={() => router.push(`/erp/booking/${a.booking_id}` as any)} testID={`sos-open-booking-${i}`} />
              </Card>
            );
          })}
        </ScrollView>
      )}
      <Sheet visible={!!resolving} onClose={() => { setResolving(null); setNote(""); }} title="Resolve SOS" testID="sos-resolve-sheet">
        <View style={{ gap: space.md }}>
          <Field placeholder="What happened and how was it resolved?" value={note} onChangeText={setNote} multiline testID="sos-resolve-note" />
          <Btn title="Resolve" variant="success" disabled={!note.trim()} loading={!!resolving && busy === resolving.id + "resolve"} onPress={() => act(resolving.id, "resolve", note)} testID="sos-resolve-confirm" />
        </View>
      </Sheet>
    </View>
  );
}
