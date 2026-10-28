import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BACKEND_URL, api, authedUrl } from "@/src/api";
import { TIME_SLOTS, fmtDate, fmtTime, nextDays, useConfig, usePolling } from "@/src/hooks";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, ChipRow, Divider, ErrorView, Field, Header, KV, Loader, Row, Sheet, StatusBadge, Txt, money, useToast } from "@/src/ui";

const FLOW = ["AWAITING_ASSIGNMENT", "ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS", "COMPLETED"];
const FLOW_LABEL = ["Confirmed", "Driver assigned", "Driver arrived", "Trip started", "Completed"];

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const q = useQuery({ queryKey: ["booking", id], queryFn: () => api<any>(`/bookings/${id}`) });
  const cfg = useConfig();
  const [paying, setPaying] = useState(false);
  const [sheet, setSheet] = useState<"" | "cancel" | "reschedule" | "review" | "incident">("");
  const [text, setText] = useState("");
  const [rating, setRating] = useState(5);
  const [rDate, setRDate] = useState(nextDays(1)[0].iso);
  const [rTime, setRTime] = useState("10:00");
  const [busy, setBusy] = useState(false);
  const b = q.data;
  const live = b && !["COMPLETED", "CANCELLED"].includes(b.status);
  const poll = useCallback(() => q.refetch(), [q]);
  usePolling(poll, 10000, !!live);

  if (q.isLoading) return <Loader />;
  if (q.error || !b)
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <Header title="Booking" />
        <ErrorView message={(q.error as any)?.message ?? "Not found"} onRetry={() => q.refetch()} />
      </View>
    );

  const canPayAdvance = ["PAYMENT_PENDING", "QUOTED"].includes(b.status);
  const canPayBalance = !canPayAdvance && !["CANCELLED", "QUOTE_REQUESTED"].includes(b.status) && b.balance_due > 0;
  const step = FLOW.indexOf(b.status === "ASSIGNED" ? "AWAITING_ASSIGNMENT" : b.status);

  const pay = async () => {
    setPaying(true);
    try {
      const p = await api<any>("/payments/create", { body: { booking_id: b.id } });
      await WebBrowser.openBrowserAsync(`${BACKEND_URL}${p.checkout_path}`);
      for (let i = 0; i < 8; i++) {
        const s = await api<any>(`/payments/${p.id}`);
        if (s.status === "paid") {
          toast(p.kind === "advance" ? "Advance received — booking confirmed!" : "Payment received. Thank you!");
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
        if (i === 7) toast("Payment pending. Pull down to refresh shortly.", "err");
      }
      await q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setPaying(false);
    }
  };

  const act = async (path: string, body: any, msg: string) => {
    setBusy(true);
    try {
      await api(path, { body });
      toast(msg);
      setSheet("");
      setText("");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const f = b.fare ?? {};
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <Header title={b.service_name} subtitle={`Ref ${b.ref}`} right={<StatusBadge status={b.status} testID="booking-status-badge" />} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xxl }}
      >
        {canPayAdvance ? (
          <Card tone="dark" testID="advance-payment-card" style={{ gap: space.sm }}>
            <Txt v="label" color={colors.surfaceTertiary}>
              {b.status === "QUOTED" ? "Your quote is ready" : "Confirm your booking"}
            </Txt>
            <Txt v="numLg" color={colors.onSurfaceInverse} testID="advance-amount">
              {money(f.advance)}
            </Txt>
            <Txt v="body" color={colors.surfaceTertiary}>
              Pay the {f.advance_percent ?? 20}% advance to confirm. Your booking is confirmed only after payment succeeds.
            </Txt>
            {cfg.data && !cfg.data.payments_enabled ? (
              <Txt v="caption" color={colors.warning} testID="payments-not-configured">
                Online payment is being set up. Please pay the advance via WhatsApp support — our team will record it and confirm your booking.
              </Txt>
            ) : null}
            <Btn title={`Pay ${money(f.advance)} securely`} icon="lock-closed" loading={paying} disabled={cfg.data && !cfg.data.payments_enabled} onPress={pay} testID="pay-advance-button" />
          </Card>
        ) : null}
        {b.status === "QUOTE_REQUESTED" ? (
          <Card testID="quote-pending-card" tone="grey">
            <Txt v="h3">Quote requested</Txt>
            <Txt v="body" color={colors.muted}>Our team is preparing your quotation. You will get a notification when it is ready.</Txt>
          </Card>
        ) : null}

        {/* Progress */}
        {step >= 0 ? (
          <Card style={{ gap: space.md }}>
            <Txt v="h3">Trip progress</Txt>
            {FLOW.map((s, i) => (
              <Row key={s} gap={space.md}>
                <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: i <= step ? colors.brandPrimary : colors.surfaceSecondary }}>
                  {i <= step ? <Ionicons name="checkmark" size={14} color={colors.onBrandPrimary} /> : null}
                </View>
                <Txt v={i === step ? "bodyBold" : "body"} color={i <= step ? colors.onSurface : colors.muted}>
                  {FLOW_LABEL[i]}
                  {i === 0 && b.status === "ASSIGNED" ? " · driver offered" : ""}
                </Txt>
              </Row>
            ))}
          </Card>
        ) : null}

        {b.trip_otp && ["AWAITING_ASSIGNMENT", "ASSIGNED", "ACCEPTED", "DRIVER_ARRIVED"].includes(b.status) ? (
          <Card testID="trip-otp-card" style={{ alignItems: "center", gap: 4, borderColor: colors.brandPrimary, borderWidth: 1.5 }}>
            <Txt v="label">Trip start OTP</Txt>
            <Txt v="numLg" testID="trip-otp-value" style={{ letterSpacing: 10 }}>
              {b.trip_otp}
            </Txt>
            <Txt v="caption">Share only when your driver arrives.</Txt>
          </Card>
        ) : null}

        {b.driver ? (
          <Card testID="driver-card" style={{ gap: space.sm }}>
            <Row gap={space.md}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="person" size={22} color={colors.onSurfaceInverse} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt v="h3">{b.driver.name}</Txt>
                <Txt v="caption">
                  Verified driver · {b.driver.experience_years} yrs exp · ★ {b.driver.rating ?? "New"}
                </Txt>
              </View>
              {b.driver.phone ? (
                <Pressable testID="call-driver-button" onPress={() => Linking.openURL(`tel:${b.driver.phone}`)} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="call" size={20} color={colors.success} />
                </Pressable>
              ) : null}
            </Row>
          </Card>
        ) : null}

        <Card style={{ gap: 2 }}>
          <Txt v="h3" style={{ marginBottom: space.sm }}>
            Booking details
          </Txt>
          <KV k="When" v={`${fmtDate(b.date)} · ${fmtTime(b.time)}`} />
          <KV k="City" v={b.city_name ?? b.city_id} />
          <KV k="Pickup" v={b.pickup} />
          {b.destination ? <KV k="Destination" v={b.destination} /> : null}
          <KV k="Duration" v={b.service_id === "outstation" ? `${b.days} day(s)` : `${b.hours} hrs`} />
          <KV k="Vehicle" v={`${b.vehicle_type} · ${b.transmission}`} />
          {b.notes ? <KV k="Instructions" v={b.notes} /> : null}
        </Card>

        {f.total ? (
          <Card style={{ gap: 2 }}>
            <Row style={{ justifyContent: "space-between", marginBottom: space.sm }}>
              <Txt v="h3">Payment</Txt>
              <StatusBadge status={b.payment_status} testID="payment-status-badge" />
            </Row>
            {(f.lines ?? []).map((l: any) => (
              <KV key={l.label} k={l.label} v={money(l.amount)} />
            ))}
            {f.discount ? <KV k="Discount" v={`-${money(f.discount)}`} /> : null}
            <KV k={`GST (${f.tax_rate}%)`} v={money(f.tax)} />
            <Divider />
            <KV k="Total" v={money(f.total)} bold />
            <KV k="Paid" v={money(b.amount_paid)} testID="amount-paid" />
            <KV k="Balance due" v={money(b.balance_due)} testID="balance-due" />
            {b.payments?.map((p: any) => (
              <Row key={p.id} style={{ justifyContent: "space-between", paddingVertical: 4 }}>
                <Txt v="caption">
                  {p.kind} · {p.method} {p.razorpay_payment_id ? `· ${p.razorpay_payment_id}` : ""}
                </Txt>
                <StatusBadge status={p.status} />
              </Row>
            ))}
            {canPayBalance ? <Btn title={`Pay balance ${money(b.balance_due)}`} icon="card" loading={paying} onPress={pay} testID="pay-balance-button" style={{ marginTop: space.sm }} /> : null}
            {b.amount_paid ? (
              <Btn small variant="outline" title={b.invoice_number ? `Invoice ${b.invoice_number}` : "View receipt"} icon="document-text" testID="view-invoice-button" style={{ marginTop: space.sm }} onPress={async () => WebBrowser.openBrowserAsync(await authedUrl(`/invoices/${b.id}`))} />
            ) : null}
          </Card>
        ) : null}

        {b.status === "COMPLETED" && !b.review ? <Btn title="Rate your driver" icon="star" variant="dark" onPress={() => setSheet("review")} testID="rate-driver-button" /> : null}
        {b.review ? (
          <Card tone="grey">
            <Txt v="bodyBold">Your rating: {"★".repeat(b.review.rating)}</Txt>
            {b.review.comment ? <Txt v="caption">{b.review.comment}</Txt> : null}
          </Card>
        ) : null}

        <View style={{ gap: space.sm }}>
          {["PAYMENT_PENDING", "QUOTE_REQUESTED", "QUOTED", "AWAITING_ASSIGNMENT"].includes(b.status) ? (
            <Btn variant="outline" title="Reschedule" icon="calendar" onPress={() => setSheet("reschedule")} testID="reschedule-button" />
          ) : null}
          {!["IN_PROGRESS", "COMPLETED", "CANCELLED", "DRIVER_ARRIVED"].includes(b.status) ? (
            <Btn variant="ghost" title="Cancel booking" icon="close-circle" onPress={() => setSheet("cancel")} testID="cancel-booking-button" />
          ) : null}
          {!["PAYMENT_PENDING", "QUOTE_REQUESTED", "QUOTED"].includes(b.status) ? (
            <Btn variant="ghost" title="Report an issue / incident" icon="warning" onPress={() => setSheet("incident")} testID="report-incident-button" />
          ) : null}
          <Btn variant="ghost" title="Get help" icon="help-circle" onPress={() => router.push("/customer/support")} testID="booking-help-button" />
        </View>

        {b.events?.length ? (
          <Card style={{ gap: space.sm }}>
            <Txt v="h3">Activity</Txt>
            {b.events.map((e: any) => (
              <Row key={e.id} style={{ justifyContent: "space-between" }}>
                <Txt v="caption" style={{ color: colors.onSurface, flex: 1 }}>
                  {e.event.replace(/_/g, " ")} {e.note ? `· ${e.note}` : ""}
                </Txt>
                <Txt v="caption">{new Date(e.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</Txt>
              </Row>
            ))}
          </Card>
        ) : null}
      </ScrollView>

      <Sheet visible={sheet === "cancel"} onClose={() => setSheet("")} title="Cancel booking" testID="cancel-sheet">
        <View style={{ gap: space.md }}>
          <Txt v="body" color={colors.muted}>
            Free cancellation up to 2 hours before start. Any refund of your advance is reviewed by our finance team.
          </Txt>
          <Field placeholder="Reason (optional)" value={text} onChangeText={setText} testID="cancel-reason-input" />
          <Btn title="Confirm cancellation" loading={busy} onPress={() => act(`/bookings/${b.id}/cancel`, { reason: text }, "Booking cancelled")} testID="confirm-cancel-button" />
        </View>
      </Sheet>
      <Sheet visible={sheet === "reschedule"} onClose={() => setSheet("")} title="Reschedule" testID="reschedule-sheet">
        <View style={{ gap: space.md, marginHorizontal: -space.lg }}>
          <ChipRow>
            {nextDays(14).map((d) => (
              <Chip key={d.iso} label={d.label} selected={rDate === d.iso} onPress={() => setRDate(d.iso)} testID={`reschedule-date-${d.iso}`} />
            ))}
          </ChipRow>
          <ChipRow>
            {TIME_SLOTS.filter((_, i) => i >= 12 && i <= 46).map((t) => (
              <Chip key={t} label={fmtTime(t)} selected={rTime === t} onPress={() => setRTime(t)} testID={`reschedule-time-${t}`} />
            ))}
          </ChipRow>
          <View style={{ paddingHorizontal: space.lg }}>
            <Btn title="Save new time" loading={busy} onPress={() => act(`/bookings/${b.id}/reschedule`, { date: rDate, time: rTime }, "Booking rescheduled")} testID="confirm-reschedule-button" />
          </View>
        </View>
      </Sheet>
      <Sheet visible={sheet === "review"} onClose={() => setSheet("")} title="Rate your trip" testID="review-sheet">
        <View style={{ gap: space.md }}>
          <Row style={{ justifyContent: "center" }} gap={space.md}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} testID={`review-star-${n}`}>
                <Ionicons name={n <= rating ? "star" : "star-outline"} size={36} color={colors.warning} />
              </Pressable>
            ))}
          </Row>
          <Field placeholder="Tell us about your driver (optional)" multiline value={text} onChangeText={setText} testID="review-comment-input" />
          <Btn title="Submit rating" loading={busy} onPress={() => act(`/bookings/${b.id}/review`, { rating, comment: text }, "Thanks for your feedback!")} testID="submit-review-button" />
        </View>
      </Sheet>
      <Sheet visible={sheet === "incident"} onClose={() => setSheet("")} title="Report an issue" testID="incident-sheet">
        <View style={{ gap: space.md }}>
          <Txt v="body" color={colors.muted}>
            Delay, no-show, safety concern or billing problem — our operations team will respond with priority.
          </Txt>
          <Field placeholder="Describe what happened" multiline value={text} onChangeText={setText} testID="incident-text-input" />
          <Btn
            title="Send report"
            loading={busy}
            disabled={!text.trim()}
            onPress={() => act("/tickets", { subject: `Issue on ${b.ref}`, message: text, category: "incident", booking_id: b.id }, "Report sent to support")}
            testID="submit-incident-button"
          />
        </View>
      </Sheet>
    </View>
  );
}
