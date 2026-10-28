import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { TIME_SLOTS, fmtTime, nextDays, useConfig } from "@/src/hooks";
import { radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, ChipRow, Divider, Field, Header, KV, Loader, Row, Txt, money, useToast } from "@/src/ui";

const VEHICLES = ["Hatchback", "Sedan", "SUV", "Luxury", "MUV"];

export default function BookWizard() {
  const p = useLocalSearchParams<{ serviceId: string; city?: string; date?: string; time?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, ready } = useAuth();
  const cfg = useConfig();
  const idem = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`).current;
  const service = cfg.data?.services.find((s) => s.id === p.serviceId);
  const cities = cfg.data?.cities ?? [];
  const [city, setCity] = useState(p.city ?? "");
  const [date, setDate] = useState(p.date ?? nextDays(1)[0].iso);
  const [time, setTime] = useState(p.time ?? "10:00");
  const [hours, setHours] = useState<number | null>(null);
  const [days, setDays] = useState(1);
  const [pickup, setPickup] = useState("");
  const [dest, setDest] = useState("");
  const [vehicle, setVehicle] = useState("Sedan");
  const [trans, setTrans] = useState("Manual");
  const [notes, setNotes] = useState("");
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [name, setName] = useState(user?.name ?? "");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const cityId = city || cities[0]?.id || "";
  const hrs = hours ?? service?.base_hours ?? 0;
  const quote = service?.pricing_mode === "quote";
  const fare = useQuery({
    queryKey: ["fare", service?.id, cityId, time, hrs, days, appliedCoupon],
    enabled: !!service && !!cityId && !quote,
    queryFn: () => api<any>("/public/fare-estimate", { body: { service_id: service!.id, city_id: cityId, date, time, hours: hrs, days, coupon: appliedCoupon || null } }),
    retry: false,
  });

  if (!ready || !cfg.data) return <Loader />;
  if (!user) return <Redirect href={`/login?next=${encodeURIComponent(`/book/${p.serviceId}?city=${cityId}&date=${date}&time=${time}`)}` as any} />;
  if (!service) return <Loader />;
  if (!["customer", "corporate"].includes(user.role))
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <Header title="Book a driver" />
        <Txt v="body" style={{ padding: space.lg }}>Bookings are made from a customer account.</Txt>
      </View>
    );

  const needsDest = ["pickup-drop", "outstation"].includes(service.id);
  const now = new Date();
  const todaySel = date === nextDays(1)[0].iso;
  const slots = TIME_SLOTS.filter((t) => !todaySel || Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) > now.getHours() * 60 + now.getMinutes() + 60);

  const submit = async () => {
    setErr("");
    if (!pickup.trim()) return setErr("Please enter the pickup address");
    if (needsDest && !dest.trim()) return setErr("Please enter the destination");
    if (!agree) return setErr("Please accept the charges & cancellation terms");
    setBusy(true);
    try {
      const b = await api<any>("/bookings", {
        body: { service_id: service.id, city_id: cityId, pickup, destination: dest, date, time, hours: hrs, days, vehicle_type: vehicle, transmission: trans, notes, coupon: appliedCoupon || null, contact_name: name, idempotency_key: idem },
      });
      toast(quote ? "Quote requested" : "Booking created — pay advance to confirm");
      router.replace(`/booking/${b.id}` as any);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const f = fare.data;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Header title={service.name} subtitle={quote ? "Request a quote" : "Book a driver for your car"} />
      <KeyboardAwareScrollView bottomOffset={120} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: space.lg, gap: space.lg, paddingBottom: 140 }}>
        <Block title="City">
          <ChipRow>
            {cities.map((c) => (
              <Chip key={c.id} label={c.name} selected={cityId === c.id} onPress={() => setCity(c.id)} testID={`book-city-${c.id}`} />
            ))}
          </ChipRow>
        </Block>
        <Block title="Date">
          <ChipRow>
            {nextDays(14).map((d) => (
              <Chip key={d.iso} label={d.label} selected={date === d.iso} onPress={() => setDate(d.iso)} testID={`book-date-${d.iso}`} />
            ))}
          </ChipRow>
        </Block>
        <Block title="Start time">
          <ChipRow>
            {slots.map((t) => (
              <Chip key={t} label={fmtTime(t)} selected={time === t} onPress={() => setTime(t)} testID={`book-time-${t}`} />
            ))}
          </ChipRow>
        </Block>
        {!quote ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <Card tone="grey">
              <Row style={{ justifyContent: "space-between" }}>
                <View>
                  <Txt v="label">{service.pricing_mode === "daily" ? "Number of days" : "Duration"}</Txt>
                  <Txt v="num" testID="book-duration-value">
                    {service.pricing_mode === "daily" ? `${days} day${days > 1 ? "s" : ""}` : `${hrs} hrs`}
                  </Txt>
                </View>
                <Row>
                  <Stepper icon="remove" testID="book-duration-minus" onPress={() => (service.pricing_mode === "daily" ? setDays(Math.max(1, days - 1)) : setHours(Math.max(service.min_hours, hrs - 1)))} />
                  <Stepper icon="add" testID="book-duration-plus" onPress={() => (service.pricing_mode === "daily" ? setDays(Math.min(30, days + 1)) : setHours(Math.min(service.max_hours || 12, hrs + 1)))} />
                </Row>
              </Row>
            </Card>
          </View>
        ) : null}
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          <Field label="Pickup address" placeholder="House / building, street, area" value={pickup} onChangeText={setPickup} testID="book-pickup-input" />
          {needsDest ? <Field label="Destination" placeholder="Where are you going?" value={dest} onChangeText={setDest} testID="book-destination-input" /> : null}
        </View>
        <Block title="Your vehicle">
          <ChipRow>
            {VEHICLES.map((v) => (
              <Chip key={v} label={v} selected={vehicle === v} onPress={() => setVehicle(v)} testID={`book-vehicle-${v}`} />
            ))}
            {["Manual", "Automatic"].map((t) => (
              <Chip key={t} label={t} icon="cog" selected={trans === t} onPress={() => setTrans(t)} testID={`book-transmission-${t}`} />
            ))}
          </ChipRow>
        </Block>
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          <Field label="Contact name" value={name} onChangeText={setName} testID="book-name-input" />
          <Field label="Instructions for driver (optional)" multiline placeholder={quote ? "Hours per day, days per week, start date, preferences…" : "Parking spot, landmark, preferences…"} value={notes} onChangeText={setNotes} testID="book-notes-input" />
          {!quote ? (
            <Row style={{ alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}>
                <Field label="Coupon" placeholder="e.g. WELCOME10" autoCapitalize="characters" value={coupon} onChangeText={setCoupon} testID="book-coupon-input" />
              </View>
              <Btn small variant="outline" title={appliedCoupon ? "Remove" : "Apply"} testID="book-coupon-apply" onPress={() => setAppliedCoupon(appliedCoupon ? "" : coupon.trim().toUpperCase())} style={{ marginBottom: 5 }} />
            </Row>
          ) : null}

          {/* Fare */}
          <Card testID="fare-estimate-card" style={{ gap: 2 }}>
            <Txt v="h3" style={{ marginBottom: space.sm }}>
              {quote ? "Pricing" : "Fare estimate"}
            </Txt>
            {quote ? (
              <Txt v="body" color={colors.muted}>
                This service needs a custom quote. Our team will send your quotation; pay the 20% advance to confirm once you accept it.
              </Txt>
            ) : fare.isLoading ? (
              <Loader label="Calculating fare…" />
            ) : fare.error ? (
              <Txt v="bodyBold" color={colors.error} testID="fare-error">
                {(fare.error as any).message}
              </Txt>
            ) : f ? (
              <>
                {f.lines.map((l: any) => (
                  <KV key={l.label} k={l.label} v={money(l.amount)} />
                ))}
                {f.discount ? (
                  <KV
                    k={f.referral ? f.referral.label : f.coupon ? `Coupon ${f.coupon}` : "Referral reward credit"}
                    v={`-${money(f.discount - (f.coupon ? f.credit_used || 0 : 0))}`}
                    testID="fare-discount"
                  />
                ) : null}
                {f.coupon && f.credit_used ? <KV k="Referral reward credit" v={`-${money(f.credit_used)}`} testID="fare-credit" /> : null}
                <KV k={`GST (${f.tax_rate}%)`} v={money(f.tax)} />
                <Divider />
                <KV k="Estimated total" v={money(f.total)} bold testID="fare-total" />
                <View style={{ backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: space.md, marginTop: space.sm }}>
                  <KV k={`Pay now to confirm (${f.advance_percent}%)`} v={money(f.advance)} bold testID="fare-advance" />
                  <Txt v="caption">Balance {money(f.total - f.advance)} payable after the trip.</Txt>
                </View>
              </>
            ) : null}
          </Card>
          <Card tone="grey" style={{ gap: 4 }}>
            <Txt v="bodyBold">Additional charges & cancellation</Txt>
            {!quote ? (
              <>
                <Txt v="caption">• Extra time: {money(service.extra_hour_rate)}/hr · Waiting: {money(service.waiting_per_hour)}/hr</Txt>
                <Txt v="caption">• Late cancellation (within 2 hrs of start): {money(service.cancellation_fee)}</Txt>
              </>
            ) : null}
            <Txt v="caption">• Fuel, tolls, parking and permits are paid by you.</Txt>
            <Txt v="caption">• Free cancellation up to 2 hours before start.</Txt>
            <Pressable testID="book-terms-checkbox" onPress={() => setAgree(!agree)} style={{ flexDirection: "row", gap: space.sm, alignItems: "center", marginTop: space.sm, minHeight: 44 }}>
              <Ionicons name={agree ? "checkbox" : "square-outline"} size={22} color={agree ? colors.brandPrimary : colors.muted} />
              <Txt v="bodyBold" style={{ flex: 1 }}>
                I accept the charges and cancellation terms
              </Txt>
            </Pressable>
          </Card>
          {err ? (
            <Txt v="bodyBold" color={colors.error} testID="book-error">
              {err}
            </Txt>
          ) : null}
        </View>
      </KeyboardAwareScrollView>
      <KeyboardStickyView offset={{ opened: 0, closed: 0 }} style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
        <View style={{ padding: space.lg, paddingBottom: insets.bottom + space.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Btn
            title={quote ? "Request quote" : f ? `Continue · Pay ${money(f.advance)} advance` : "Continue"}
            loading={busy}
            disabled={!quote && !f}
            onPress={submit}
            testID="book-submit-button"
          />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <View style={{ paddingHorizontal: space.lg }}>
        <Txt v="label">{title}</Txt>
      </View>
      {children}
    </View>
  );
}

function Stepper({ icon, onPress, testID }: { icon: string; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon as any} size={20} color={colors.onSurface} />
    </Pressable>
  );
}
