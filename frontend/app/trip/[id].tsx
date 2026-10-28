import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { useState } from "react";
import { Platform, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { LocationShare } from "@/src/components/LocationShare";
import { SosButton } from "@/src/components/SosButton";
import { fmtDate, fmtTime } from "@/src/hooks";
import { radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, Field, Header, KV, Loader, Row, Sheet, StatusBadge, Txt, money, useToast } from "@/src/ui";

const STEPS = [
  ["ACCEPTED", "Accepted"],
  ["DRIVER_ARRIVED", "Arrived at pickup"],
  ["IN_PROGRESS", "Trip started (OTP)"],
  ["COMPLETED", "Completed"],
];

export default function Trip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const q = useQuery({ queryKey: ["trip", id], queryFn: () => api<any>(`/driver/jobs/${id}`) });
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<"" | "event" | "complete">("");
  const [endPin, setEndPin] = useState("");
  const [sheetErr, setSheetErr] = useState("");
  const [evType, setEvType] = useState("DELAY");
  const [note, setNote] = useState("");
  const j = q.data;
  if (!j) return <Loader />;
  const idx = STEPS.findIndex(([s]) => s === j.status);

  const act = async (path: string, body: any, msg: string) => {
    setBusy(true);
    try {
      await api(`/driver/jobs/${id}/${path}`, { body });
      toast(msg);
      setSheet("");
      setNote("");
      setOtp("");
      q.refetch();
    } catch (e: any) {
      if (sheet) setSheetErr(e.message);
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  const navigate = () => {
    const dest = encodeURIComponent(j.status === "IN_PROGRESS" && j.destination ? j.destination : j.pickup ?? "");
    Linking.openURL(Platform.OS === "ios" ? `maps://?daddr=${dest}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}`),
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <Header title={j.service_name} subtitle={j.ref} right={<StatusBadge status={j.status} testID="trip-status-badge" />} />
      <ScrollView refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
        <Card style={{ gap: space.md }}>
          {STEPS.map(([s, l], i) => (
            <Row key={s} gap={space.md}>
              <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: i <= idx ? colors.surfaceInverse : colors.surfaceSecondary }}>
                {i <= idx ? <Ionicons name="checkmark" size={16} color={colors.onSurfaceInverse} /> : <Txt v="caption">{i + 1}</Txt>}
              </View>
              <Txt v={i === idx + 1 ? "h3" : "body"} color={i <= idx + 1 ? colors.onSurface : colors.muted}>{l}</Txt>
            </Row>
          ))}
        </Card>

        {["ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"].includes(j.status) ? <LocationShare bookingId={j.id} /> : null}
        {["ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"].includes(j.status) ? <SosButton bookingId={j.id} role="driver" /> : null}
        {j.status === "ACCEPTED" ? (
          <View style={{ gap: space.md }}>
            <Btn variant="dark" title="Navigate to pickup" icon="navigate" onPress={navigate} testID="trip-navigate-button" />
            <Btn title="I've arrived" icon="location" loading={busy} onPress={() => act("arrive", {}, "Customer notified of your arrival")} testID="trip-arrive-button" />
          </View>
        ) : null}
        {j.status === "DRIVER_ARRIVED" ? (
          <Card style={{ gap: space.md, borderColor: colors.brandPrimary, borderWidth: 1.5 }}>
            <Txt v="h3">Enter the customer trip OTP</Txt>
            <Field placeholder="4-digit OTP" keyboardType="number-pad" maxLength={4} value={otp} onChangeText={setOtp} testID="trip-otp-input" style={{ fontSize: 28, letterSpacing: 12, textAlign: "center" }} />
            <Btn title="Verify OTP & start trip" icon="play" loading={busy} disabled={otp.length !== 4} onPress={() => act("start", { otp }, "Trip started")} testID="trip-start-button" />
          </Card>
        ) : null}
        {j.status === "IN_PROGRESS" ? (
          <View style={{ gap: space.md }}>
            {j.destination ? <Btn variant="dark" title="Navigate to destination" icon="navigate" onPress={navigate} testID="trip-navigate-dest-button" /> : null}
            <Btn title="Complete trip" icon="flag" variant="success" onPress={() => setSheet("complete")} testID="trip-complete-button" />
          </View>
        ) : null}
        {j.status === "COMPLETED" ? (
          <Card testID="trip-completed-card" style={{ alignItems: "center", gap: space.sm }}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            <Txt v="h2">Trip completed</Txt>
            <Txt v="body" color={colors.muted}>Earnings: {money(j.driver_payout)}</Txt>
          </Card>
        ) : null}

        <Card style={{ gap: 2 }}>
          <Txt v="h3" style={{ marginBottom: space.sm }}>Assignment</Txt>
          <KV k="When" v={`${fmtDate(j.date)} · ${fmtTime(j.time)}`} />
          <KV k="Duration" v={j.service_id === "outstation" ? `${j.days} day(s)` : `${j.hours} hrs`} />
          {j.pickup ? <KV k="Pickup" v={j.pickup} /> : null}
          {j.destination ? <KV k="Destination" v={j.destination} /> : null}
          <KV k="Vehicle" v={j.vehicle ? `${j.vehicle.make} ${j.vehicle.model} · ${j.vehicle.reg_number} · ${j.transmission}` : `${j.vehicle_type} · ${j.transmission}`} testID="trip-vehicle" />
          {j.notes ? <KV k="Instructions" v={j.notes} /> : null}
          {j.customer_name ? <KV k="Customer" v={j.customer_name} /> : null}
          <KV k="Your payout" v={money(j.driver_payout)} bold />
          {j.balance_due ? <KV k="Customer balance due" v={money(j.balance_due)} /> : null}
        </Card>
        {j.customer_phone && j.status !== "COMPLETED" ? <Btn variant="outline" title="Call customer" icon="call" onPress={() => Linking.openURL(`tel:${j.customer_phone}`)} testID="trip-call-customer-button" /> : null}
        {j.status !== "COMPLETED" ? <Btn variant="ghost" title="Report delay / no-show / incident" icon="warning" onPress={() => setSheet("event")} testID="trip-report-button" /> : null}
        <Btn variant="ghost" title="Contact support" icon="headset" onPress={() => router.push("/support")} testID="trip-support-button" />

        <Card style={{ gap: space.sm }}>
          <Txt v="h3">Trip log</Txt>
          {(j.events ?? []).map((e: any) => (
            <Row key={e.id} style={{ justifyContent: "space-between" }}>
              <Txt v="caption" style={{ color: colors.onSurface, flex: 1 }}>{e.event.replace(/_/g, " ")} {e.note ? `· ${e.note}` : ""}</Txt>
              <Txt v="caption">{new Date(e.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</Txt>
            </Row>
          ))}
        </Card>
      </ScrollView>

      <Sheet visible={sheet === "event"} onClose={() => setSheet("")} title="Report" testID="trip-event-sheet">
        <View style={{ gap: space.md }}>
          <Row style={{ flexWrap: "wrap" }}>
            {[["DELAY", "Running late"], ["CUSTOMER_NO_SHOW", "Customer no-show"], ["INCIDENT", "Incident"]].map(([k, l]) => (
              <Chip key={k} label={l} selected={evType === k} onPress={() => setEvType(k)} testID={`trip-event-${k}`} />
            ))}
          </Row>
          <Field placeholder="Details" multiline value={note} onChangeText={setNote} testID="trip-event-note-input" />
          <Btn title="Send" loading={busy} onPress={() => act("event", { type: evType, note }, "Reported")} testID="trip-event-submit" />
        </View>
      </Sheet>
      <Sheet visible={sheet === "complete"} onClose={() => setSheet("")} title="Complete trip" testID="trip-complete-sheet">
        <View style={{ gap: space.md }}>
          <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: space.md }}>
            <KV k="Customer balance due" v={money(j.balance_due)} bold />
          </View>
          {j.end_pin_required ? (
            <Field
              label="Handover PIN from customer"
              placeholder="4-digit PIN"
              keyboardType="number-pad"
              maxLength={4}
              value={endPin}
              onChangeText={(t) => {
                setSheetErr("");
                setEndPin(t.replace(/\D/g, ""));
              }}
              error={sheetErr || undefined}
              testID="trip-end-pin-input"
            />
          ) : null}
          {j.end_pin_required && endPin.length !== 4 ? (
            <Txt v="caption">Return the car and keys, then ask the customer for the trip-end PIN in their app.</Txt>
          ) : j.balance_due ? (
            <>
              <Btn title={`Collected ${money(j.balance_due)} in cash`} icon="cash" variant="dark" loading={busy} onPress={() => act("complete", { cash_collected: true, end_pin: endPin }, "Trip completed · cash recorded")} testID="trip-complete-cash-button" />
              <Btn title="Customer will pay online" variant="outline" loading={busy} onPress={() => act("complete", { cash_collected: false, end_pin: endPin }, "Trip completed")} testID="trip-complete-online-button" />
            </>
          ) : (
            <Btn title="Confirm completion" variant="success" loading={busy} onPress={() => act("complete", { cash_collected: false, end_pin: endPin }, "Trip completed")} testID="trip-complete-confirm-button" />
          )}
        </View>
      </Sheet>
    </View>
  );
}
