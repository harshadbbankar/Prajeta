import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { useState } from "react";
import { Platform, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { LocationShare } from "@/src/components/LocationShare";
import { SosButton } from "@/src/components/SosButton";
import { fmtDate, fmtTime } from "@/src/hooks";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Btn, Card, CardTitle, Chip, Field, Header, IconTile, KV, Loader, OtpBoxes, Plate, Row, RouteLine, Sheet, StatusBadge, StepBar, Txt, money, useToast } from "@/src/ui";

const STEPS = [
  ["ACCEPTED", "Accepted"],
  ["DRIVER_ARRIVED", "Arrived"],
  ["IN_PROGRESS", "Started"],
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
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header eyebrow={`#${j.ref}`} title={j.service_name} subtitle={j.city_name ?? undefined} right={<StatusBadge status={j.status} testID="trip-status-badge" />} />
      <ScrollView refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
        <Card style={{ gap: space.md }}>
          <StepBar steps={STEPS.map(([, l]) => l)} current={j.status === "COMPLETED" ? 4 : idx + 1} testID="trip-step-bar" />
        </Card>

        <Card style={{ gap: space.md }} testID="trip-customer-card">
          <Row gap={space.md}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="person-outline" size={24} color={colors.onSurface} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="h2" style={{ fontFamily: fonts.bold }}>{j.customer_name || "Customer"}</Txt>
              <Txt v="caption">Vehicle owner · {fmtDate(j.date)} · {fmtTime(j.time)}</Txt>
            </View>
            {j.customer_phone && j.status !== "COMPLETED" ? (
              <Pressable testID="trip-call-customer-button" onPress={() => Linking.openURL(`tel:${j.customer_phone}`)} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="call-outline" size={20} color={colors.onSurface} />
              </Pressable>
            ) : null}
          </Row>
          <Row gap={space.md} style={{ backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder, borderRadius: radius.md, padding: space.md }}>
            <IconTile icon="car-outline" tone="plain" />
            <View style={{ flex: 1 }}>
              <Row style={{ flexWrap: "wrap" }} gap={6}>
                <Txt v="h3" style={{ fontFamily: fonts.bold }} testID="trip-vehicle">{j.vehicle ? `${j.vehicle.make} ${j.vehicle.model}` : j.vehicle_type}</Txt>
                {j.vehicle?.reg_number ? <Plate reg={j.vehicle.reg_number} /> : null}
              </Row>
              <Txt v="caption">{j.vehicle?.color ? `${j.vehicle.color} · ` : ""}{j.transmission}</Txt>
            </View>
          </Row>
          <RouteLine
            stops={[
              { label: "Pickup address", title: j.pickup || j.pickup_area || "Shared after acceptance" },
              ...(j.destination ? [{ label: "Destination", title: j.destination, sub: j.service_id === "outstation" ? `${j.days} day(s)` : `${j.hours} hrs package` }] : []),
            ]}
          />
        </Card>

        {["ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"].includes(j.status) ? <LocationShare bookingId={j.id} /> : null}
        {j.status === "ACCEPTED" ? (
          <View style={{ gap: space.md }}>
            <Btn variant="dark" title="Navigate to pickup" icon="navigate" onPress={navigate} testID="trip-navigate-button" />
            <Btn title="I've arrived" icon="location" loading={busy} onPress={() => act("arrive", {}, "Customer notified of your arrival")} testID="trip-arrive-button" />
          </View>
        ) : null}
        {j.status === "DRIVER_ARRIVED" ? (
          <Card style={{ gap: space.md, borderColor: colors.surfaceInverse, borderWidth: 2 }} testID="trip-otp-card">
            <Row gap={6} style={{ justifyContent: "center" }}>
              <Ionicons name="keypad-outline" size={18} color={colors.onSurface} />
              <Txt v="h3" style={{ fontFamily: fonts.bold, letterSpacing: 0.5 }}>TRIP-START OTP</Txt>
            </Row>
            <Txt v="caption" center>Ask the customer for the 4-digit security code before ignition handover.</Txt>
            <OtpBoxes value={otp} onChange={setOtp} testID="trip-otp-input" />
            <Btn variant="dark" title="Verify OTP & Start Trip" icon="play" loading={busy} disabled={otp.length !== 4} onPress={() => act("start", { otp }, "Trip started")} testID="trip-start-button" />
          </Card>
        ) : null}
        {j.status === "IN_PROGRESS" ? (
          <View style={{ gap: space.md }}>
            {j.destination ? <Btn variant="dark" title="Navigate to destination" icon="navigate" onPress={navigate} testID="trip-navigate-dest-button" /> : null}
            <Btn title="Complete trip & handover" icon="flag" variant="dark" onPress={() => setSheet("complete")} testID="trip-complete-button" />
          </View>
        ) : null}
        {j.status === "COMPLETED" ? (
          <Card testID="trip-completed-card" style={{ alignItems: "center", gap: space.sm }}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            <Txt v="h2">Trip completed</Txt>
            <Txt v="body" color={colors.muted}>Earnings: {money(j.driver_payout)}</Txt>
          </Card>
        ) : null}
        {["ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"].includes(j.status) ? <SosButton bookingId={j.id} role="driver" /> : null}

        <Card style={{ gap: 2 }}>
          <CardTitle icon="wallet-outline" title="Assignment & payout" />
          <View style={{ height: space.sm }} />
          <KV k="When" v={`${fmtDate(j.date)} · ${fmtTime(j.time)}`} />
          <KV k="Duration" v={j.service_id === "outstation" ? `${j.days} day(s)` : `${j.hours} hrs`} />
          {j.notes ? <KV k="Instructions" v={j.notes} /> : null}
          <KV k="Your payout" v={money(j.driver_payout)} bold />
          {j.balance_due ? <KV k="Customer balance due" v={money(j.balance_due)} /> : null}
        </Card>
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
