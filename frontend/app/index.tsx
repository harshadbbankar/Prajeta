import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, router } from "expo-router";
import * as Linking from "expo-linking";
import { useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { homeFor, useAuth } from "@/src/auth";
import { fmtTime, nextDays, priceParts, useConfig } from "@/src/hooks";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { BrandLogo, Btn, Card, Chip, ErrorView, IconTile, Loader, Row, Tag, Txt } from "@/src/ui";
import { RetainerCalculator } from "@/src/components/RetainerCalculator";

const HERO = "https://images.unsplash.com/photo-1503376780353-7e6692767b70?crop=entropy&cs=srgb&fm=jpg&q=70&w=1200";

const STEPS = [
  { icon: "list", t: "Choose a service", d: "Hourly, full-day, outstation, monthly and more." },
  { icon: "calendar", t: "Pick date & time", d: "See a clear fare estimate before you book." },
  { icon: "card", t: "Pay 20% advance", d: "Your booking is confirmed instantly and securely." },
  { icon: "shield-checkmark", t: "Verified driver arrives", d: "Start the trip only with your 4-digit OTP." },
];

const TRUST = [
  { icon: "shield-checkmark-outline", t: "Document Verified", d: "ID, licence & address manually checked" },
  { icon: "finger-print-outline", t: "Police Verified", d: "Court record & police clearance checked" },
  { icon: "car-sport-outline", t: "Luxury AT Specialists", d: "EV, DCT & ADAS trained drivers" },
  { icon: "receipt-outline", t: "GST 18% ITC", d: "Corporate compliant tax invoices" },
];

const STATS = [
  ["1,500+", "Cars handled", "Sedans, SUVs & luxury"],
  ["4-digit", "OTP secured", "Trip start & handover PIN"],
  ["100%", "Police & ID verified", "Manual document review"],
  ["GST", "Tax invoices", "Input tax credit for companies"],
];

const COMPARE = [
  ["Monthly cost basis", "₹30,000 – ₹38,000 salary + PF/ESI", "Flat monthly retainer invoice"],
  ["GST input tax credit", "0% (ineligible wage expense)", "100% eligible (B2B tax invoicing)"],
  ["Absenteeism & leave", "Owner left stranded without backup", "Verified replacement driver"],
  ["Background verification", "Self-managed, prone to lapse", "Continuous police & document audit"],
];

const TESTIMONIALS = [
  ["“Entrusting my car to an outside driver was unthinkable until Prajeta. Their chauffeurs handle the automatic gearbox and city traffic flawlessly.”", "Arvind Krishnamurthy", "Managing Partner"],
  ["“We moved our entire senior executive pool to Prajeta retainers. Zero attendance disputes and the GST ITC savings are substantial.”", "Shalini Mehta", "Chief HR Officer"],
  ["“The strict OTP handover, clean attire and discreet demeanour make Prajeta an invaluable enterprise asset.”", "Vikramaditya Roy", "Senior Vice President"],
];

export default function Landing() {
  const { user, ready } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cfg = useConfig();
  const [svc, setSvc] = useState("hourly");
  const [city, setCity] = useState("");
  const [day, setDay] = useState(nextDays(1)[0].iso);
  const [time, setTime] = useState("10:00");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  if (!ready) return <Loader />;
  if (user) return <Redirect href={homeFor(user.role) as any} />;

  const wide = width >= 900;
  const s = cfg.data?.settings ?? {};
  const services = cfg.data?.services ?? [];
  const cities = cfg.data?.cities ?? [];
  const cityId = city || cities[0]?.id || "";
  const cityName = cities.find((c) => c.id === cityId)?.name ?? "your city";
  const sel = services.find((x) => x.id === svc);
  const pp = sel ? priceParts(sel) : null;
  const company = s.company_name ?? "Prajeta";
  const tabs = ["hourly", "outstation", "monthly"].filter((id) => services.some((x) => x.id === id));
  const W = { maxWidth: 1180, width: "100%" as const, alignSelf: "center" as const };

  const dispatchCard = services.length ? (
    <Card testID="quick-booking-form" style={{ gap: space.md, flex: wide ? 1 : undefined }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt v="h3" style={{ fontFamily: fonts.bold, fontSize: 17 }}>Instant Dispatch</Txt>
        <Tag tone="success" label="Available now" />
      </Row>
      <Row gap={4} style={{ backgroundColor: colors.tint, borderRadius: radius.md, padding: 4 }}>
        {tabs.map((id) => {
          const x = services.find((y) => y.id === id)!;
          const on = svc === id;
          return (
            <Pressable key={id} testID={`quick-tab-${id}`} onPress={() => setSvc(id)} style={{ flex: 1, minHeight: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.surfaceInverse : "transparent" }}>
              <Txt v="caption" style={{ fontFamily: fonts.semibold, color: on ? colors.onSurfaceInverse : colors.onSurface }} numberOfLines={1}>
                {x.name.replace(" Driver", " Hire")}
              </Txt>
            </Pressable>
          );
        })}
      </Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ flexGrow: 0 }}>
        {services.map((x) => (
          <Chip key={x.id} label={x.name} selected={svc === x.id} onPress={() => setSvc(x.id)} testID={`quick-service-${x.id}`} />
        ))}
      </ScrollView>
      <Txt v="caption" style={{ fontFamily: fonts.semibold, color: colors.onSurface }}>Pick-up city</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ flexGrow: 0 }}>
        {cities.map((c) => (
          <Chip key={c.id} icon="location-outline" label={c.name} selected={cityId === c.id} onPress={() => setCity(c.id)} testID={`quick-city-${c.id}`} />
        ))}
      </ScrollView>
      <Txt v="caption" style={{ fontFamily: fonts.semibold, color: colors.onSurface }}>Start date & time</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ flexGrow: 0 }}>
        {nextDays(7).map((d) => (
          <Chip key={d.iso} label={d.label} selected={day === d.iso} onPress={() => setDay(d.iso)} testID={`quick-date-${d.iso}`} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ flexGrow: 0 }}>
        {["07:00", "09:00", "10:00", "12:00", "15:00", "18:00", "20:00", "22:00"].map((t) => (
          <Chip key={t} label={fmtTime(t)} selected={time === t} onPress={() => setTime(t)} testID={`quick-time-${t}`} />
        ))}
      </ScrollView>
      {pp ? (
        <Row style={{ justifyContent: "space-between", backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder, borderRadius: radius.md, padding: space.md }}>
          <View>
            <Txt v="caption">Guaranteed all-inclusive rate</Txt>
            <Row gap={4} style={{ alignItems: "flex-end" }}>
              <Txt v="numLg" testID="quick-rate">{pp.amount}</Txt>
              <Txt v="caption">{pp.unit}</Txt>
            </Row>
          </View>
          <Tag tone="success" label="No surge ever" />
        </Row>
      ) : null}
      <Btn
        title={sel?.pricing_mode === "quote" ? "Request a quote" : "Get Guaranteed Quote & Assign Driver"}
        icon="arrow-forward"
        testID="quick-booking-submit-button"
        onPress={() => router.push(`/book/${svc}?city=${cityId}&date=${day}&time=${time}` as any)}
      />
      <Txt v="caption" center>Free cancellation up to 2 hours prior to booking.</Txt>
    </Card>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {/* Sticky nav */}
      <View style={{ paddingTop: insets.top + space.sm, paddingBottom: space.sm, paddingHorizontal: space.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Row style={[W, { justifyContent: "space-between" }]}>
          <BrandLogo name={company} />
          {wide ? (
            <Row gap={space.xl}>
              {[["Services", "/service/hourly"], ["Corporate", "/enquiry?type=corporate"], ["Safety", "/page/safety"], ["FAQs", "/page/faq"]].map(([l, h]) => (
                <Pressable key={l} onPress={() => router.push(h as any)}>
                  <Txt v="bodyBold">{l}</Txt>
                </Pressable>
              ))}
            </Row>
          ) : null}
          <Row>
            <Btn small variant="ghost" title="Track" testID="nav-track-button" onPress={() => router.push("/track")} />
            <Btn small variant="dark" title="Log in" testID="nav-login-button" onPress={() => router.push("/login")} />
          </Row>
        </Row>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom }}>
        {/* Hero */}
        <View style={[W, { padding: space.lg, gap: space.lg, flexDirection: wide ? "row" : "column", alignItems: wide ? "flex-start" : "stretch", paddingTop: wide ? space.xxl : space.lg }]}>
          <View style={{ gap: space.md, flex: wide ? 1.3 : undefined }}>
            <Row gap={6} style={{ alignSelf: "flex-start", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success }} />
              <Txt v="caption" style={{ fontFamily: fonts.semibold, color: colors.onSurface }}>White-glove private chauffeurs</Txt>
            </Row>
            <Txt v="display" testID="hero-headline" style={wide ? { fontSize: 44, lineHeight: 52 } : { fontSize: 30, lineHeight: 38 }}>
              Executive Chauffeurs For Your Own Car
            </Txt>
            <Txt v="body" color={colors.muted} style={{ fontSize: 15, lineHeight: 22 }}>
              {s.tagline ?? "Find a Trusted Driver, Wherever You Need One."} Entrust your sedan, SUV or luxury car to vetted, document-verified drivers in {cityName} — by the hour, day, night, outstation or month.
            </Txt>
            <View style={{ borderRadius: radius.lg, overflow: "hidden", height: wide ? 300 : 200, backgroundColor: colors.surfaceInverse }}>
              <Image source={{ uri: HERO }} style={{ position: "absolute", width: "100%", height: "100%" }} contentFit="cover" />
              <LinearGradient colors={["transparent", "rgba(0,0,0,0.75)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "70%" }} />
              <Row style={{ position: "absolute", left: space.md, right: space.md, bottom: space.md, justifyContent: "space-between", alignItems: "flex-end" }}>
                <View style={{ gap: 4, flex: 1 }}>
                  <Tag tone="success" icon="shield-checkmark" label="Verified authority" />
                  <Txt v="h3" color={colors.onSurfaceInverse} style={{ fontFamily: fonts.bold }}>Bespoke In-Car Experience</Txt>
                </View>
                <View style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", backgroundColor: "rgba(0,0,0,0.45)", borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center" }}>
                  <Txt v="label" color={colors.surfaceTertiary}>Book in</Txt>
                  <Txt v="num" color={colors.onSurfaceInverse}>2 Mins</Txt>
                </View>
              </Row>
            </View>
            <Row style={{ flexWrap: "wrap" }}>
              <Btn title="Find a Driver" icon="search" testID="hero-find-driver-button" onPress={() => router.push(`/book/${svc}?city=${cityId}&date=${day}&time=${time}` as any)} />
              <Btn title="Become a Driver" variant="outline" icon="person-add" testID="hero-become-driver-button" onPress={() => router.push("/login?role=driver")} />
            </Row>
          </View>
          {cfg.isLoading ? <Loader label="Loading services…" /> : cfg.error ? <ErrorView message="Unable to load services" onRetry={() => cfg.refetch()} /> : dispatchCard}
        </View>

        {/* Stats band */}
        <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, marginTop: space.lg }}>
          <View style={[W, { flexDirection: "row", flexWrap: "wrap", paddingVertical: space.lg }]}>
            {STATS.map(([v, l, d], i) => (
              <View key={l} style={{ flexBasis: wide ? "25%" : "50%", alignItems: "center", paddingVertical: space.sm, borderLeftWidth: i % (wide ? 4 : 2) ? 1 : 0, borderLeftColor: colors.border }}>
                <Txt v="numLg">{v}</Txt>
                <Txt v="label" style={{ color: colors.onSurface }}>{l}</Txt>
                <Txt v="caption" center>{d}</Txt>
              </View>
            ))}
          </View>
        </View>

        <Section title="Uncompromising Trust" wide={wide}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
            {TRUST.map((b) => (
              <Card key={b.t} style={{ flexBasis: wide ? "23%" : "46%", flexGrow: 1, flexDirection: "row", gap: space.sm, padding: space.md, alignItems: "flex-start" }}>
                <IconTile icon={b.icon} size={36} />
                <View style={{ flex: 1 }}>
                  <Txt v="bodyBold">{b.t}</Txt>
                  <Txt v="caption">{b.d}</Txt>
                </View>
              </Card>
            ))}
          </View>
        </Section>

        <Section title="The Prajeta Safety Standard" sub="Every chauffeur is vetted before they ever touch your keys." wide={wide}>
          <View style={{ flexDirection: wide ? "row" : "column", gap: space.lg }}>
            <Card style={{ gap: space.md, flex: wide ? 1 : undefined }} testID="spotlight-card">
              <Row style={{ justifyContent: "space-between" }}>
                <View>
                  <Txt v="label">Chauffeur spotlight</Txt>
                  <Txt v="h2" style={{ fontFamily: fonts.bold }}>Elite Master Grade</Txt>
                </View>
                <Tag tone="warn" icon="star" label="5.0" />
              </Row>
              <Row gap={space.md} style={{ backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder, borderRadius: radius.md, padding: space.md }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" }}>
                  <Txt v="h3" color={colors.onSurfaceInverse}>RS</Txt>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt v="h3" style={{ fontFamily: fonts.bold }}>Rajesh V. Sharma</Txt>
                  <Txt v="caption">Master Chauffeur · 11 yrs experience</Txt>
                  <Row style={{ flexWrap: "wrap" }} gap={4}>
                    <Tag tone="success" label="Automatic certified" />
                    <Tag tone="outline" label="English & Hindi" />
                  </Row>
                </View>
              </Row>
              <Row>
                {[["1,420+", "Trips completed"], ["0", "Incident record"], ["99.8%", "Punctuality"]].map(([v, l]) => (
                  <View key={l} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.sm, alignItems: "center" }}>
                    <Txt v="num">{v}</Txt>
                    <Txt v="caption" center>{l}</Txt>
                  </View>
                ))}
              </Row>
              <Txt v="caption">Illustrative profile — your assigned driver&apos;s real details appear in your booking.</Txt>
            </Card>
            <View style={{ gap: space.md, flex: wide ? 1 : undefined }}>
              <Txt v="h3" style={{ fontFamily: fonts.bold }}>3-Step Vehicle Safety Guarantee</Txt>
              {[
                ["Pre-trip walkaround", "Driver checks your car's condition with you before ignition."],
                ["Key handshake PIN", "Trip starts only with your 4-digit OTP; ends with your handover PIN."],
                ["Liability discharge", "Live tracking, SOS and a full trip log from ignition to return."],
              ].map(([t, d], i) => (
                <Row key={t} gap={space.md} style={{ alignItems: "flex-start" }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" }}>
                    <Txt v="bodyBold" color={colors.onSurfaceInverse}>{i + 1}</Txt>
                  </View>
                  <Txt v="body" style={{ flex: 1 }}>
                    <Txt v="bodyBold">{t}: </Txt>
                    {d}
                  </Txt>
                </Row>
              ))}
              <Btn small variant="outline" title="Read our safety process" icon="arrow-forward" testID="safety-link" onPress={() => router.push("/page/safety")} style={{ alignSelf: "flex-start" }} />
            </View>
          </View>
        </Section>

        <Section title="Tailored Driver Services" sub={`${services.length} tiers available`} wide={wide}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
            {services.map((x, i) => {
              const p = priceParts(x);
              return (
                <Pressable
                  key={x.id}
                  testID={`service-card-${x.id}`}
                  onPress={() => router.push(`/service/${x.id}`)}
                  style={({ pressed }) => ({
                    flexBasis: wide ? "31%" : "100%",
                    flexGrow: 1,
                    backgroundColor: colors.surface,
                    borderRadius: radius.lg,
                    borderWidth: i === 0 ? 2 : 1,
                    borderColor: i === 0 ? colors.surfaceInverse : colors.border,
                    padding: space.lg,
                    gap: space.sm,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Row gap={space.md} style={{ flex: 1 }}>
                      <IconTile icon={x.icon.replace("-outline", "")} size={40} />
                      <Txt v="h3" style={{ fontFamily: fonts.bold, flex: 1 }}>{x.name}</Txt>
                    </Row>
                    <View style={{ alignItems: "flex-end" }}>
                      <Txt v="numLg" style={p.amount === "Enquire" ? { fontSize: 16 } : undefined}>{p.amount}</Txt>
                      <Txt v="caption">{p.unit}</Txt>
                    </View>
                  </Row>
                  <Txt v="body" color={colors.muted}>{x.tagline}</Txt>
                  <View style={{ height: 1, backgroundColor: colors.border }} />
                  <Row style={{ justifyContent: "space-between" }}>
                    <Txt v="caption" style={{ fontFamily: fonts.semibold }}>{i === 0 ? "Most popular · flexible overtime" : x.pricing_mode === "quote" ? "Custom contract" : "Transparent fare"}</Txt>
                    <Txt v="bodyBold">{x.pricing_mode === "quote" ? "Enquire →" : "Book →"}</Txt>
                  </Row>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="How it works" wide={wide}>
          <View style={{ flexDirection: wide ? "row" : "column", gap: space.md }}>
            {STEPS.map((st, i) => (
              <Card key={st.t} style={{ flex: wide ? 1 : undefined, flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: i === 2 ? colors.brandPrimary : colors.surfaceInverse, alignItems: "center", justifyContent: "center" }}>
                  <Txt v="bodyBold" color={colors.onSurfaceInverse}>
                    {i + 1}
                  </Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt v="h3">{st.t}</Txt>
                  <Txt v="caption">{st.d}</Txt>
                </View>
              </Card>
            ))}
          </View>
        </Section>

        <Section title={`Full-Time In-House Driver vs. ${company}`} sub="Eliminate employer liability, absenteeism and admin overhead while unlocking GST input tax credit." wide={wide}>
          <Card style={{ padding: 0, overflow: "hidden" }} testID="compare-table">
            <Row gap={0} style={{ backgroundColor: colors.tint, paddingVertical: space.sm }}>
              {["Parameter", "Traditional in-house", `${company} retainer`].map((h) => (
                <Txt key={h} v="label" style={{ flex: 1, paddingHorizontal: space.md, color: colors.onSurface }}>{h}</Txt>
              ))}
            </Row>
            {COMPARE.map(([a, b, c]) => (
              <Row key={a} gap={0} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: space.md, alignItems: "flex-start" }}>
                <Txt v="bodyBold" style={{ flex: 1, paddingHorizontal: space.md }}>{a}</Txt>
                <Txt v="caption" style={{ flex: 1, paddingHorizontal: space.md, color: a.startsWith("GST") ? colors.brandPrimary : colors.muted }}>{b}</Txt>
                <Txt v="caption" style={{ flex: 1, paddingHorizontal: space.md, color: colors.onSurface, fontFamily: fonts.semibold }}>{c}</Txt>
              </Row>
            ))}
          </Card>
          <Row style={{ flexWrap: "wrap" }}>
            <Btn small variant="dark" title="Corporate enquiry" testID="corporate-enquiry-button" onPress={() => router.push("/enquiry?type=corporate")} />
            <Btn small variant="outline" title="Monthly driver" testID="monthly-enquiry-button" onPress={() => router.push("/service/monthly")} />
          </Row>
          <RetainerCalculator />
        </Section>

        <Section title="Trusted by Promoters, CXOs & Families" wide={wide}>
          <View style={{ flexDirection: wide ? "row" : "column", gap: space.md }}>
            {TESTIMONIALS.map(([q, n, r]) => (
              <Card key={n} style={{ flex: wide ? 1 : undefined, gap: space.md }}>
                <Txt v="body" style={{ fontStyle: "italic" }}>{q}</Txt>
                <Row gap={space.sm}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.tint, alignItems: "center", justifyContent: "center" }}>
                    <Txt v="caption" style={{ fontFamily: fonts.bold, color: colors.onSurface }}>{n.split(" ").map((w) => w[0]).join("")}</Txt>
                  </View>
                  <View>
                    <Txt v="bodyBold">{n}</Txt>
                    <Txt v="caption">{r}</Txt>
                  </View>
                </Row>
              </Card>
            ))}
          </View>
        </Section>

        <Section title="Where we operate" wide={wide}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {cities.map((c) => (
              <View key={c.id} testID={`city-${c.id}`} style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm }}>
                <Txt v="bodyBold">
                  {c.name} <Txt v="caption">· {c.areas.length} areas</Txt>
                </Txt>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Frequently asked questions" wide={wide}>
          <Card style={{ paddingVertical: 0 }}>
            {(cfg.data?.faqs ?? []).map((f, i) => (
              <Pressable key={f.q} testID={`faq-${i}`} onPress={() => setOpenFaq(openFaq === i ? null : i)} style={{ paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Txt v="bodyBold" style={{ flex: 1 }}>
                    {f.q}
                  </Txt>
                  <Ionicons name={openFaq === i ? "remove" : "add"} size={20} color={colors.onSurface} />
                </Row>
                {openFaq === i ? (
                  <Txt v="body" color={colors.muted} style={{ marginTop: space.sm }}>
                    {f.a}
                  </Txt>
                ) : null}
              </Pressable>
            ))}
          </Card>
        </Section>

        <Section title="Need help?" wide={wide}>
          <Row style={{ flexWrap: "wrap" }}>
            <Btn title="WhatsApp us" icon="logo-whatsapp" variant="success" testID="whatsapp-support-button" onPress={() => s.whatsapp_link && Linking.openURL(s.whatsapp_link)} />
            <Btn title="Call support" icon="call" variant="outline" testID="call-support-button" onPress={() => Linking.openURL(`tel:${(s.support_phone ?? "").replace(/\s/g, "")}`)} />
          </Row>
          <Txt v="caption">
            {s.business_hours} · {s.support_email}
          </Txt>
        </Section>

        {/* App promo band */}
        <View style={{ padding: space.lg, marginTop: space.xl }}>
          <View style={[W, { backgroundColor: colors.surfaceInverse, borderRadius: radius.lg, padding: space.xl, gap: space.md }]}>
            <Txt v="label" color={colors.surfaceTertiary}>{company} mobile app</Txt>
            <Txt v="title" color={colors.onSurfaceInverse}>Track In Real-Time & Manage Invoices</Txt>
            <Txt v="body" color={colors.surfaceTertiary}>Live driver tracking, trip PINs, SOS and instant GST invoices — all from your phone.</Txt>
            <Row style={{ flexWrap: "wrap" }}>
              <Btn small title="Book your first driver" icon="arrow-forward" onPress={() => router.push("/login")} testID="promo-login-button" />
              <Btn small variant="outline" title="Track a booking" icon="navigate-outline" onPress={() => router.push("/track")} testID="promo-track-button" />
            </Row>
          </View>
        </View>

        {/* Footer */}
        <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: space.xl, gap: space.md, marginTop: space.lg }}>
          <View style={[W, { gap: space.md }]}>
            <BrandLogo name={company} size={30} sub={null} testID="footer-brand" />
            <Txt v="caption">{s.legal_name}</Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
              {[
                ["about", "About us"],
                ["contact", "Contact"],
                ["safety", "Safety"],
                ["faq", "FAQs"],
                ["privacy", "Privacy Policy"],
                ["terms", "Terms & Conditions"],
                ["cancellation", "Cancellation & Refunds"],
                ["driver-terms", "Driver Partner Terms"],
              ].map(([slug, label]) => (
                <Pressable key={slug} testID={`footer-link-${slug}`} onPress={() => router.push(`/page/${slug}` as any)}>
                  <Txt v="bodyBold">{label}</Txt>
                </Pressable>
              ))}
            </View>
            <Txt v="caption">
              Illustrations and spotlight profiles are representative and do not depict actual {company} drivers. © 2026 {company}
            </Txt>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ title, sub, children, wide }: { title: string; sub?: string; children: React.ReactNode; wide?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: space.lg, paddingTop: wide ? space.xxxl : space.xxl, gap: space.md, maxWidth: 1180 + space.lg * 2, width: "100%", alignSelf: "center" }}>
      <View>
        <Txt v="title">{title}</Txt>
        {sub ? (
          <Txt v="body" color={colors.muted}>
            {sub}
          </Txt>
        ) : null}
      </View>
      {children}
    </View>
  );
}
