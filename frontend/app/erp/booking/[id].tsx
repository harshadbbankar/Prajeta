import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { fmtDate, fmtTime } from "@/src/hooks";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, Divider, Field, Header, KV, Loader, Row, Sheet, StatusBadge, Txt, money, useToast } from "@/src/ui";

export default function AdminBooking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin-booking", id], queryFn: () => api<any>(`/admin/bookings/${id}`) });
  const [sheet, setSheet] = useState<"" | "status" | "quote" | "cash" | "adjust">("");
  const [st, setSt] = useState("CANCELLED");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState("");
  const b = q.data;
  if (!b) return <Loader />;
  const act = async (path: string, body: any, msg: string, key = path) => {
    setBusy(key);
    try {
      await api(`/admin/bookings/${id}/${path}`, { body });
      toast(msg);
      setSheet("");
      setReason("");
      setAmount("");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy("");
    }
  };
  const rupees = Math.round(Number(amount || 0) * 100);
  const f = b.fare ?? {};
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title={b.ref} subtitle={`${b.service_name} · ${b.city_name ?? b.city_id}`} right={<StatusBadge status={b.status} testID="admin-booking-status" />} />
      <ScrollView refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
        {b.status === "QUOTE_REQUESTED" || b.status === "QUOTED" ? (
          <Card style={{ gap: space.sm, borderColor: colors.warning, borderWidth: 1.5 }}>
            <Txt v="h3">Manual quotation</Txt>
            <Txt v="caption">Enter pre-tax amount in ₹. GST and 20% advance are calculated automatically.</Txt>
            <Btn title={b.status === "QUOTED" ? "Revise quote" : "Send quote"} onPress={() => setSheet("quote")} testID="admin-send-quote-button" />
          </Card>
        ) : null}

        {["AWAITING_ASSIGNMENT", "ASSIGNED", "ACCEPTED"].includes(b.status) ? (
          <Card style={{ gap: space.sm }} testID="eligible-drivers-card">
            <Txt v="h3">{b.status === "ACCEPTED" ? "Reassign driver" : "Assign a driver"}</Txt>
            {b.status === "ACCEPTED" ? <Txt v="caption">Current: {b.driver_name}</Txt> : null}
            <Btn small variant="outline" icon="map" title="See nearest drivers on map" onPress={() => router.push(`/erp/live-map?booking=${b.id}` as any)} testID="open-live-map-button" />
            {!b.eligible_drivers?.length ? <Txt v="caption">{b.status === "ACCEPTED" ? "Open again after driver no-show to reassign." : "No approved drivers in this city."}</Txt> : null}
            {(b.eligible_drivers ?? []).map((d: any) => (
              <Row key={d.user_id} style={{ justifyContent: "space-between", paddingVertical: 6 }}>
                <View style={{ flex: 1 }}>
                  <Txt v="bodyBold">{d.name} {d.online ? "· Online" : ""} {d.badge ? (d.badge === "gold" ? "🏆" : "🎖️") : ""}</Txt>
                  <Txt v="caption" color={d.eligible ? colors.muted : colors.error}>
                    {d.eligible ? `★ ${d.rating ?? "—"} · ${d.experience_years} yrs${d.distance_km != null ? ` · ${d.distance_km} km away` : ""}` : d.reason}
                  </Txt>
                </View>
                <Btn small title="Offer" disabled={!d.eligible} loading={busy === d.user_id} onPress={() => act("assign", { driver_id: d.user_id }, "Offer sent to driver", d.user_id)} testID={`assign-driver-${d.user_id}`} />
              </Row>
            ))}
          </Card>
        ) : null}

        <Card style={{ gap: 2 }}>
          <Txt v="h3" style={{ marginBottom: space.sm }}>Details</Txt>
          <KV k="Customer" v={`${b.customer_name ?? ""} ${b.customer_phone}`} />
          <KV k="When" v={`${fmtDate(b.date)} · ${fmtTime(b.time)}`} />
          <KV k="Pickup" v={b.pickup} />
          {b.destination ? <KV k="Destination" v={b.destination} /> : null}
          <KV k="Duration" v={b.service_id === "outstation" ? `${b.days} day(s)` : `${b.hours} hrs`} />
          <KV k="Vehicle" v={b.vehicle ? `${b.vehicle.make} ${b.vehicle.model} · ${b.vehicle.reg_number} · ${b.transmission}` : `${b.vehicle_type} · ${b.transmission}`} testID="erp-booking-vehicle" />
          {b.notes ? <KV k="Notes" v={b.notes} /> : null}
          <KV k="Driver" v={b.driver_name ?? "—"} />
          {b.cancel_reason ? <KV k="Cancel reason" v={b.cancel_reason} /> : null}
        </Card>

        <Card style={{ gap: 2 }}>
          <Row style={{ justifyContent: "space-between", marginBottom: space.sm }}>
            <Txt v="h3">Fare & payments</Txt>
            <StatusBadge status={b.payment_status} />
          </Row>
          {(f.lines ?? []).map((l: any, i: number) => <KV key={i} k={l.label} v={money(l.amount)} />)}
          <KV k={`GST ${f.tax_rate ?? 18}%`} v={money(f.tax)} />
          <KV k="Total" v={money(f.total)} bold />
          <KV k="Advance (20%)" v={money(f.advance)} />
          <KV k="Paid" v={money(b.amount_paid)} />
          <KV k="Balance due" v={money(b.balance_due)} />
          <KV k="Driver payout" v={money((b.driver_payout ?? 0) + (b.driver_adjustment ?? 0))} />
          <KV k="Tariff version" v={String(f.tariff_version ?? "—")} />
          <Divider />
          {(b.payments ?? []).map((p: any) => (
            <Row key={p.id} style={{ justifyContent: "space-between", paddingVertical: 4 }}>
              <Txt v="caption">{p.kind} · {p.method} · {money(p.amount)} {p.razorpay_order_id ? `· ${p.razorpay_order_id}` : ""}</Txt>
              <StatusBadge status={p.status} />
            </Row>
          ))}
          <Row style={{ marginTop: space.sm, flexWrap: "wrap" }}>
            <Btn small variant="outline" title="Record cash" icon="cash" onPress={() => setSheet("cash")} testID="admin-record-cash-button" />
            <Btn small variant="outline" title="Adjust fare" icon="create" onPress={() => setSheet("adjust")} testID="admin-adjust-fare-button" />
          </Row>
        </Card>

        {!["COMPLETED", "CANCELLED"].includes(b.status) ? <Btn variant="dark" title="Update status / exception" icon="alert-circle" onPress={() => setSheet("status")} testID="admin-update-status-button" /> : null}

        <Card style={{ gap: space.sm }}>
          <Txt v="h3">Offers</Txt>
          {(b.offers ?? []).length ? b.offers.map((o: any) => (
            <Row key={o.id} style={{ justifyContent: "space-between" }}>
              <Txt v="caption" style={{ color: colors.onSurface }}>{o.driver_name} · {o.mode}</Txt>
              <StatusBadge status={o.status} />
            </Row>
          )) : <Txt v="caption">No offers yet</Txt>}
        </Card>
        <Card style={{ gap: space.sm }}>
          <Txt v="h3">Trip events</Txt>
          {(b.events ?? []).map((e: any) => (
            <Txt key={e.id} v="caption" style={{ color: colors.onSurface }}>
              {new Date(e.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {e.event.replace(/_/g, " ")} · {e.actor_role}{e.actor_name ? ` (${e.actor_name})` : ""}{e.note ? ` — ${e.note}` : ""}
            </Txt>
          ))}
        </Card>
      </ScrollView>

      <Sheet visible={sheet === "status"} onClose={() => setSheet("")} title="Update status" testID="admin-status-sheet">
        <View style={{ gap: space.md }}>
          <Row style={{ flexWrap: "wrap" }}>
            {[["CANCELLED", "Cancel"], ["NO_SHOW_CUSTOMER", "Customer no-show"], ["NO_SHOW_DRIVER", "Driver no-show (reassign)"], ["ESCALATED", "Escalate"], ["COMPLETED", "Mark completed"]].map(([k, l]) => (
              <Chip key={k} label={l} selected={st === k} onPress={() => setSt(k)} testID={`admin-status-${k}`} />
            ))}
          </Row>
          <Field placeholder="Reason (required for exceptions)" value={reason} onChangeText={setReason} testID="admin-status-reason-input" />
          <Btn title="Apply" loading={busy === "status"} onPress={() => act("status", { status: st, reason }, "Status updated")} testID="admin-status-apply-button" />
        </View>
      </Sheet>
      <Sheet visible={sheet === "quote"} onClose={() => setSheet("")} title="Send quote" testID="admin-quote-sheet">
        <View style={{ gap: space.md }}>
          <Field label="Amount before GST (₹)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} testID="admin-quote-amount-input" />
          <Field label="Note to customer" value={reason} onChangeText={setReason} testID="admin-quote-note-input" />
          <Btn title="Send quote" loading={busy === "quote"} disabled={!rupees} onPress={() => act("quote", { amount: rupees, note: reason }, "Quote sent")} testID="admin-quote-submit-button" />
        </View>
      </Sheet>
      <Sheet visible={sheet === "cash"} onClose={() => setSheet("")} title="Record cash payment" testID="admin-cash-sheet">
        <View style={{ gap: space.md }}>
          <Field label="Amount (₹)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} testID="admin-cash-amount-input" />
          <Field label="Receipt / reference" value={reason} onChangeText={setReason} testID="admin-cash-ref-input" />
          <Btn title="Record" loading={busy === "cash"} disabled={!rupees} onPress={() => act("cash", { amount: rupees, reference: reason }, "Payment recorded")} testID="admin-cash-submit-button" />
        </View>
      </Sheet>
      <Sheet visible={sheet === "adjust"} onClose={() => setSheet("")} title="Fare adjustment" testID="admin-adjust-sheet">
        <View style={{ gap: space.md }}>
          <Field label="Customer amount before GST (₹, negative to reduce)" keyboardType="numbers-and-punctuation" value={amount} onChangeText={setAmount} testID="admin-adjust-amount-input" />
          <Field label="Reason (audited)" value={reason} onChangeText={setReason} testID="admin-adjust-reason-input" />
          <Btn title="Apply adjustment" loading={busy === "adjust"} disabled={!rupees || !reason.trim()} onPress={() => act("adjust", { amount: rupees, driver_amount: 0, reason }, "Fare adjusted")} testID="admin-adjust-submit-button" />
        </View>
      </Sheet>
    </View>
  );
}
