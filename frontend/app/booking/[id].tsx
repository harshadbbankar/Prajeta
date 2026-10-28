import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BACKEND_URL, api } from "@/src/api";
import { LiveTracking } from "@/src/components/LiveTracking";
import { ShareTrip } from "@/src/components/ShareTrip";
import { SosButton } from "@/src/components/SosButton";
import { downloadInvoice } from "@/src/invoice";
import { TIME_SLOTS, fmtDate, fmtTime, nextDays, useConfig, usePolling } from "@/src/hooks";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Btn, Card, CardTitle, Chip, ChipRow, Divider, ErrorView, Field, Header, KV, Loader, PinDisplay, Row, RouteLine, Sheet, StatusBadge, StepBar, Tag, Txt, money, useToast } from "@/src/ui";

const FLOW = ["AWAITING_ASSIGNMENT", "ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS", "COMPLETED"];
const REVIEW_TAGS = ["Punctual", "Safe driving", "Polite", "Well dressed", "Knows routes", "Careful with car"];
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
  const [tags, setTags] = useState<string[]>([]);
  const [dl, setDl] = useState(false);
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
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
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
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header eyebrow={`Booking ID #${b.ref}`} title={b.service_name} subtitle={b.city_name ?? b.city_id} right={<StatusBadge status={b.status} testID="booking-status-badge" />} />
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
          <Card style={{ gap: space.md }} testID="trip-progress-card">
            <Row style={{ justifyContent: "space-between" }}>
              <Row gap={6} style={{ flex: 1 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: ["DRIVER_ARRIVED", "IN_PROGRESS"].includes(b.status) ? colors.success : colors.brandPrimary }} />
                <Txt v="h3" style={{ fontFamily: fonts.bold, flex: 1 }} numberOfLines={1}>
                  {FLOW_LABEL[step]}
                  {step === 0 && b.status === "ASSIGNED" ? " · driver offered" : ""}
                </Txt>
              </Row>
              <Txt v="caption">{fmtDate(b.date)} · {fmtTime(b.time)}</Txt>
            </Row>
            <StepBar steps={["Confirmed", "Assigned", "Arrived", "Started", "Complete"]} current={b.status === "COMPLETED" ? 5 : step} />
          </Card>
        ) : null}

        {["ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"].includes(b.status) ? <LiveTracking bookingId={b.id} /> : null}

        {b.trip_otp && ["AWAITING_ASSIGNMENT", "ASSIGNED", "ACCEPTED", "DRIVER_ARRIVED"].includes(b.status) ? (
          <Card tone="tint" testID="trip-otp-card" style={{ alignItems: "center", gap: space.sm }}>
            <Row gap={6}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.onSurface} />
              <Txt v="h3" style={{ fontFamily: fonts.bold }}>Start Trip Verification PIN</Txt>
            </Row>
            <Txt v="caption" center>
              Share this PIN with {b.driver?.name?.split(" ")[0] ?? "your driver"} only when they arrive and you are ready to depart.
            </Txt>
            <PinDisplay value={b.trip_otp} testID="trip-otp-value" />
          </Card>
        ) : null}

        {b.end_otp && b.status === "IN_PROGRESS" ? (
          <Card tone="tint" testID="end-pin-card" style={{ alignItems: "center", gap: space.sm }}>
            <Row gap={6}>
              <Ionicons name="key-outline" size={18} color={colors.onSurface} />
              <Txt v="h3" style={{ fontFamily: fonts.bold }}>Trip-End Handover PIN</Txt>
            </Row>
            <Txt v="caption" center>Share only after you get your car and keys back in good condition.</Txt>
            <PinDisplay value={b.end_otp} label="PIN" testID="end-pin-value" />
          </Card>
        ) : null}

        {b.driver ? (
          <Card testID="driver-card" style={{ gap: space.md }}>
            <Row gap={space.md} style={{ alignItems: "flex-start" }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.tint, borderWidth: 2, borderColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="person" size={28} color={colors.onSurface} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="h2" style={{ fontFamily: fonts.bold }}>{b.driver.name}</Txt>
                <Txt v="caption" style={{ color: colors.onSurface }}>
                  ☆ {b.driver.rating ?? "New"} · {b.driver.experience_years} yrs experience
                </Txt>
                {b.driver.badge_label ? (
                  <Txt v="label" color={colors.warningText} testID="driver-badge">
                    {b.driver.badge === "gold" ? "🏆" : "🎖️"} {b.driver.badge_label}
                  </Txt>
                ) : null}
              </View>
            </Row>
            {b.driver.phone ? (
              <Row>
                <Btn style={{ flex: 1 }} variant="outline" icon="call-outline" title="Call driver" onPress={() => Linking.openURL(`tel:${b.driver.phone}`)} testID="call-driver-button" />
                <Btn style={{ flex: 1 }} variant="dark" icon="chatbox-ellipses-outline" title="Message" onPress={() => Linking.openURL(`sms:${b.driver.phone}`)} testID="message-driver-button" />
              </Row>
            ) : null}
            <Divider />
            <Row style={{ flexWrap: "wrap" }}>
              <Tag tone="tint" icon="shield-checkmark-outline" label="Police verified chauffeur" />
              <Tag tone="tint" icon="ribbon-outline" label={`${b.driver.experience_years}+ years exp`} />
              <Tag tone="tint" icon="cog-outline" label={`${b.transmission} specialist`} />
            </Row>
          </Card>
        ) : null}

        <Card style={{ gap: space.md }}>
          <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Txt v="label">Registered vehicle</Txt>
              <Txt v="h3" style={{ fontFamily: fonts.bold }} testID="booking-vehicle">
                {b.vehicle ? `${b.vehicle.make} ${b.vehicle.model} (${b.vehicle.reg_number})` : `${b.vehicle_type} · your car`}
              </Txt>
            </View>
            <Tag tone="tint" label={`${b.transmission} · ${b.vehicle?.body_type ?? b.vehicle_type}`} />
          </Row>
          <Divider />
          <RouteLine
            stops={[
              { label: "Pickup location", title: b.pickup, sub: b.city_name ?? b.city_id },
              { label: "Drop location", title: b.destination || "Multiple stops / as directed" },
            ]}
          />
          <Row style={{ alignItems: "stretch" }}>
            <View style={{ flex: 1, backgroundColor: colors.tint, borderRadius: radius.md, padding: space.md, gap: 2 }}>
              <Txt v="caption">Selected package</Txt>
              <Txt v="bodyBold">{b.service_id === "outstation" ? `${b.days} day(s)` : `${b.hours} hrs`} {b.service_name}</Txt>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.tint, borderRadius: radius.md, padding: space.md, gap: 2 }}>
              <Txt v="caption">Estimated bill</Txt>
              <Txt v="num">{f.total ? money(f.total) : "On quote"}</Txt>
            </View>
          </Row>
          {b.notes ? <KV k="Instructions" v={b.notes} /> : null}
        </Card>

        {["AWAITING_ASSIGNMENT", "ASSIGNED", "ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"].includes(b.status) ? <ShareTrip booking={b} onChange={() => q.refetch()} /> : null}

        {["ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"].includes(b.status) ? (
          <Card style={{ gap: space.md }} testID="safety-support-card">
            <CardTitle icon="shield-outline" title="Concierge & Safety Support" />
            <Pressable onPress={() => router.push("/customer/support")} style={{ flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder, borderRadius: radius.md, padding: space.md }}>
              <Ionicons name="headset-outline" size={20} color={colors.onSurface} />
              <View style={{ flex: 1 }}>
                <Txt v="bodyBold">Safety concierge</Txt>
                <Txt v="caption">Priority support for live trips</Txt>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
            <SosButton bookingId={b.id} role="customer" />
          </Card>
        ) : null}

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
            <KV k={`Booking advance (${f.advance_percent ?? 20}%)`} v={money(f.advance)} testID="advance-row" />
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
              <Btn
                small
                variant="outline"
                title={b.invoice_number ? `Download invoice ${b.invoice_number}` : "Download receipt"}
                icon="download"
                loading={dl}
                testID="view-invoice-button"
                style={{ marginTop: space.sm }}
                onPress={async () => {
                  setDl(true);
                  try {
                    await downloadInvoice(b.id, b.ref);
                  } catch (e: any) {
                    toast(e.message ?? "Could not create receipt", "err");
                  } finally {
                    setDl(false);
                  }
                }}
              />
            ) : null}
          </Card>
        ) : null}

        {b.status === "COMPLETED" && !b.review ? <Btn title="Rate your driver" icon="star" variant="dark" onPress={() => setSheet("review")} testID="rate-driver-button" /> : null}
        {b.review ? (
          <Card tone="grey">
            <Txt v="bodyBold" testID="your-rating">Your rating: {"★".repeat(b.review.rating)}</Txt>
            {b.review.tags?.length ? <Txt v="caption">{b.review.tags.join(" · ")}</Txt> : null}
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
          <Row style={{ flexWrap: "wrap", justifyContent: "center" }}>
            {REVIEW_TAGS.map((t) => (
              <Chip key={t} label={t} selected={tags.includes(t)} onPress={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))} testID={`review-tag-${t.replace(/ /g, "-")}`} />
            ))}
          </Row>
          <Field placeholder="Tell us about your driver (optional)" multiline value={text} onChangeText={setText} testID="review-comment-input" />
          <Btn title="Submit rating" loading={busy} onPress={() => act(`/bookings/${b.id}/review`, { rating, comment: text, tags }, "Thanks for your feedback!")} testID="submit-review-button" />
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
