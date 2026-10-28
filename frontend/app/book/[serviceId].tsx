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
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Btn, Card, CardTitle, Chip, ChipRow, Divider, Field, Header, IconTile, KV, Loader, OptionBox, Row, Tag, Txt, money, useToast } from "@/src/ui";

const VEHICLES = ["Hatchback", "Sedan", "SUV", "Luxury", "MUV"];
const VEHICLE_LABEL: Record<string, string> = { Hatchback: "Hatchback", Sedan: "Sedan / Compact SUV", SUV: "Full Size SUV", Luxury: "Luxury / German", MUV: "MUV / 7-Seater" };

export default function BookWizard() {
  const p = useLocalSearchParams<{ serviceId: string; city?: string; date?: string; time?: string; trans?: string }>();
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
  const [vehicleId, setVehicleId] = useState("");
  const garage = useQuery({ queryKey: ["garage"], queryFn: () => api<any>("/me/vehicles"), enabled: !!user && ["customer", "corporate"].includes(user.role) });
  const [trans, setTrans] = useState(p.trans === "Automatic" ? "Automatic" : "Manual");
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
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <Header title="Book a driver" />
        <Txt v="body" style={{ padding: space.lg }}>Bookings are made from a customer account.</Txt>
      </View>
    );

  const needsDest = ["pickup-drop", "outstation"].includes(service.id);
  const now = new Date();
  const todaySel = date === nextDays(1)[0].iso;
  const slots = TIME_SLOTS.filter((t) => !todaySel || Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) > now.getHours() * 60 + now.getMinutes() + 60);
  // If the chosen slot has passed for today, fall back to the first available one (what the user sees selected)
  const effTime = slots.includes(time) ? time : (slots[0] ?? time);
  const daily = service.pricing_mode === "daily";
  const maxH = service.max_hours || 12;
  const presets = daily ? [1, 2, 3, 5] : Array.from(new Set([service.min_hours, service.base_hours, service.base_hours + 2, service.base_hours + 4].map((h) => Math.min(maxH, Math.max(service.min_hours, h)))));

  const submit = async () => {
    setErr("");
    if (!pickup.trim()) return setErr("Please enter the pickup address");
    if (needsDest && !dest.trim()) return setErr("Please enter the destination");
    if (!agree) return setErr("Please accept the charges & cancellation terms");
    setBusy(true);
    try {
      const b = await api<any>("/bookings", {
        body: { service_id: service.id, city_id: cityId, pickup, destination: dest, date, time: effTime, hours: hrs, days, vehicle_type: vehicle, transmission: trans, vehicle_id: vehicleId || null, notes, coupon: appliedCoupon || null, contact_name: name, idempotency_key: idem },
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
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header eyebrow={quote ? "Step 2 of 3: Requirement" : "Step 2 of 3: Details & Fare"} title={quote ? "Request a Quote" : "Configure Your Booking"} />
      <KeyboardAwareScrollView bottomOffset={120} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 170 }}>
        <Card style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
          <IconTile icon={service.icon.replace("-outline", "")} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <Txt v="h3" style={{ fontFamily: fonts.bold, fontSize: 17 }} testID="book-service-name">{service.name}</Txt>
              <Tag tone="tint" icon="car-outline" label="Your own car" />
            </Row>
            <Txt v="caption">{service.tagline}</Txt>
          </View>
        </Card>

        <Card style={{ gap: space.md }}>
          <CardTitle icon="options-outline" title="Trip Specifications" />
          <Txt v="bodyBold">City</Txt>
          <View style={{ marginHorizontal: -space.lg }}>
            <ChipRow>
              {cities.map((c) => (
                <Chip key={c.id} label={c.name} selected={cityId === c.id} onPress={() => setCity(c.id)} testID={`book-city-${c.id}`} />
              ))}
            </ChipRow>
          </View>
          <Field label="Pickup address" placeholder="House / building, street, area" value={pickup} onChangeText={setPickup} testID="book-pickup-input" />
          {needsDest ? <Field label="Destination" placeholder="Where are you going?" value={dest} onChangeText={setDest} testID="book-destination-input" /> : null}
          <Row style={{ justifyContent: "space-between" }}>
            <Txt v="bodyBold">Scheduled start</Txt>
            <Txt v="bodyBold" testID="book-start-summary">{nextDays(14).find((d) => d.iso === date)?.label ?? date}, {fmtTime(effTime)}</Txt>
          </Row>
          <View style={{ marginHorizontal: -space.lg, marginTop: -space.sm }}>
            <ChipRow>
              {nextDays(14).map((d) => (
                <Chip key={d.iso} label={d.label} selected={date === d.iso} onPress={() => setDate(d.iso)} testID={`book-date-${d.iso}`} />
              ))}
            </ChipRow>
            <ChipRow>
              {slots.map((t) => (
                <Chip key={t} label={fmtTime(t)} selected={effTime === t} onPress={() => setTime(t)} testID={`book-time-${t}`} />
              ))}
            </ChipRow>
          </View>
          {!quote ? (
            <>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt v="bodyBold">{daily ? "Number of days" : "Estimated duration"}</Txt>
                <Txt v="caption">{daily ? "Up to 30 days" : `Extend anytime @ ${money(service.extra_hour_rate)}/hr`}</Txt>
              </Row>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {presets.map((h) => (
                  <OptionBox
                    key={h}
                    style={{ flexBasis: "46%", alignItems: "flex-start", minHeight: 56 }}
                    title={daily ? `${h} Day${h > 1 ? "s" : ""}` : `${h} Hours`}
                    sub={h === (daily ? 1 : service.base_hours) ? "Base package" : undefined}
                    badge={h === (daily ? 1 : service.base_hours) ? "RECOMMENDED" : undefined}
                    selected={(daily ? days : hrs) === h}
                    onPress={() => (daily ? setDays(h) : setHours(h))}
                    testID={`book-duration-preset-${h}`}
                  />
                ))}
              </View>
              <Row style={{ justifyContent: "space-between", backgroundColor: colors.tint, borderRadius: radius.md, padding: space.sm, paddingLeft: space.md }}>
                <View>
                  <Txt v="label">{daily ? "Days" : "Duration"}</Txt>
                  <Txt v="num" testID="book-duration-value">
                    {daily ? `${days} day${days > 1 ? "s" : ""}` : `${hrs} hrs`}
                  </Txt>
                </View>
                <Row>
                  <Stepper icon="remove" testID="book-duration-minus" onPress={() => (daily ? setDays(Math.max(1, days - 1)) : setHours(Math.max(service.min_hours, hrs - 1)))} />
                  <Stepper icon="add" testID="book-duration-plus" onPress={() => (daily ? setDays(Math.min(30, days + 1)) : setHours(Math.min(maxH, hrs + 1)))} />
                </Row>
              </Row>
            </>
          ) : null}
        </Card>

        <Card style={{ gap: space.md }}>
          <CardTitle icon="car-sport-outline" title="Your Vehicle Details" right={<Txt v="caption" style={{ fontFamily: fonts.semibold }}>Insurance safe</Txt>} />
          {(garage.data?.items ?? []).length ? (
            <>
              <Txt v="bodyBold">From your garage</Txt>
              <View style={{ marginHorizontal: -space.lg }}>
                <ChipRow>
                  {garage.data.items.map((g: any) => (
                    <Chip
                      key={g.id}
                      icon="car-sport"
                      label={`${g.make} ${g.model} · ${g.reg_number}`}
                      selected={vehicleId === g.id}
                      onPress={() => {
                        if (vehicleId === g.id) return setVehicleId("");
                        setVehicleId(g.id);
                        if (VEHICLES.includes(g.body_type)) setVehicle(g.body_type);
                        setTrans(g.transmission === "Manual" ? "Manual" : "Automatic");
                      }}
                      testID={`book-garage-${g.reg_number}`}
                    />
                  ))}
                </ChipRow>
              </View>
            </>
          ) : null}
          <Txt v="bodyBold">Transmission type</Txt>
          <Row>
            {["Manual", "Automatic"].map((t) => (
              <OptionBox key={t} icon="cog-outline" title={`${t} Transmission`} selected={trans === t} onPress={() => setTrans(t)} testID={`book-transmission-${t}`} />
            ))}
          </Row>
          <Txt v="bodyBold">Vehicle segment</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {VEHICLES.map((v) => (
              <OptionBox key={v} style={{ flexGrow: 0, flexBasis: "auto" }} icon={vehicle === v ? "checkmark" : undefined} title={VEHICLE_LABEL[v]} selected={vehicle === v} onPress={() => setVehicle(v)} testID={`book-vehicle-${v}`} />
            ))}
          </View>
          <Txt v="caption">Ensures your driver is matched with the right cockpit experience.</Txt>
        </Card>

        <Card style={{ gap: space.md }}>
          <CardTitle icon="person-outline" title="Contact & Instructions" right={<Txt v="caption" style={{ fontFamily: fonts.semibold }}>At no extra cost</Txt>} />
          <Field label="Contact name" value={name} onChangeText={setName} testID="book-name-input" />
          <Field label="Instructions for driver (optional)" multiline placeholder={quote ? "Hours per day, days per week, start date, preferences…" : "Non-smoker, language, parking spot, landmark…"} value={notes} onChangeText={setNotes} testID="book-notes-input" />
          {!quote ? (
            <Row style={{ alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}>
                <Field label="Coupon or referral code" placeholder="e.g. WELCOME10" autoCapitalize="characters" value={coupon} onChangeText={setCoupon} testID="book-coupon-input" />
              </View>
              <Btn small variant="outline" title={appliedCoupon ? "Remove" : "Apply"} testID="book-coupon-apply" onPress={() => setAppliedCoupon(appliedCoupon ? "" : coupon.trim().toUpperCase())} style={{ marginBottom: 6 }} />
            </Row>
          ) : null}
        </Card>

        {/* Fare */}
        <Card testID="fare-estimate-card" style={{ gap: 2 }}>
          <CardTitle icon="receipt-outline" title={quote ? "Pricing" : "Transparent Fare Breakdown"} right={!quote ? <Tag tone="success" icon="checkmark-circle-outline" label="No surge" /> : undefined} />
          <View style={{ height: space.sm }} />
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
              <KV k={`Applicable GST (${f.tax_rate}%)`} v={money(f.tax)} />
              {f.discount ? (
                <Row testID="fare-discount-row" style={{ justifyContent: "space-between", backgroundColor: colors.successSoft, borderWidth: 1, borderColor: colors.successBorder, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, marginVertical: 4 }}>
                  <Row gap={6} style={{ flex: 1 }}>
                    <Ionicons name="pricetag-outline" size={14} color={colors.successText} />
                    <Txt v="bodyBold" color={colors.successText} style={{ flex: 1 }}>{f.referral ? f.referral.label : f.coupon ? `Promo discount (${f.coupon})` : "Referral reward credit"}</Txt>
                  </Row>
                  <Txt v="bodyBold" color={colors.successText} testID="fare-discount">-{money(f.discount - (f.coupon ? f.credit_used || 0 : 0))}</Txt>
                </Row>
              ) : null}
              {f.coupon && f.credit_used ? <KV k="Referral reward credit" v={`-${money(f.credit_used)}`} testID="fare-credit" /> : null}
              <Divider />
              <Row style={{ justifyContent: "space-between" }}>
                <View>
                  <Txt v="h3" style={{ fontFamily: fonts.bold }}>Total Estimated Fare</Txt>
                  <Txt v="caption">Includes taxes · fuel, tolls & parking extra</Txt>
                </View>
                <Txt v="numLg" testID="fare-total">{money(f.total)}</Txt>
              </Row>
              <View style={{ backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder, borderRadius: radius.md, padding: space.md, marginTop: space.md }}>
                <KV k={`Pay now to confirm (${f.advance_percent}%)`} v={money(f.advance)} bold testID="fare-advance" />
                <Txt v="caption">Balance {money(f.total - f.advance)} payable after the trip.</Txt>
              </View>
            </>
          ) : null}
        </Card>

        <Card style={{ gap: 4 }}>
          <CardTitle icon="document-text-outline" title="Additional charges & cancellation" />
          {!quote ? (
            <>
              <Txt v="caption">• Extra time: {money(service.extra_hour_rate)}/hr · Waiting: {money(service.waiting_per_hour)}/hr</Txt>
              <Txt v="caption">• Late cancellation (within 2 hrs of start): {money(service.cancellation_fee)}</Txt>
            </>
          ) : null}
          <Txt v="caption">• Fuel, tolls, parking and permits are paid by you.</Txt>
          <Txt v="caption">• Free cancellation up to 2 hours before start.</Txt>
          <Pressable testID="book-terms-checkbox" onPress={() => setAgree(!agree)} style={{ flexDirection: "row", gap: space.sm, alignItems: "center", marginTop: space.sm, minHeight: 44 }}>
            <Ionicons name={agree ? "checkbox" : "square-outline"} size={22} color={agree ? colors.onSurface : colors.muted} />
            <Txt v="bodyBold" style={{ flex: 1 }}>
              I accept the charges and cancellation terms
            </Txt>
          </Pressable>
        </Card>
        <Row gap={6} style={{ justifyContent: "center" }}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.success} />
          <Txt v="caption" style={{ fontFamily: fonts.semibold, color: colors.onSurface }}>All drivers undergo document & background verification</Txt>
        </Row>
        {err ? (
          <Txt v="bodyBold" color={colors.error} testID="book-error">
            {err}
          </Txt>
        ) : null}
      </KeyboardAwareScrollView>
      <KeyboardStickyView offset={{ opened: 0, closed: 0 }} style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
        <View style={{ padding: space.lg, paddingTop: space.md, gap: space.sm, paddingBottom: insets.bottom + space.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
          {!quote && f ? (
            <Row style={{ justifyContent: "space-between" }}>
              <Txt v="caption">Payable now ({f.advance_percent}% advance)</Txt>
              <Txt v="num">{money(f.advance)}</Txt>
            </Row>
          ) : null}
          <Btn
            title={quote ? "Request quote" : f ? `Review & Pay ${money(f.advance)} Advance` : "Continue"}
            icon="lock-closed"
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

function Stepper({ icon, onPress, testID }: { icon: string; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon as any} size={20} color={colors.onSurface} />
    </Pressable>
  );
}
