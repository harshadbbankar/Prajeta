import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, router } from "expo-router";
import * as Linking from "expo-linking";
import { useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { homeFor, useAuth } from "@/src/auth";
import { fmtTime, nextDays, priceFrom, useConfig } from "@/src/hooks";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, ErrorView, Loader, Row, Txt } from "@/src/ui";

const HERO = "https://images.unsplash.com/photo-1637625854255-d893202554f4?crop=entropy&cs=srgb&fm=jpg&q=70&w=1200";

const STEPS = [
  { icon: "list", t: "Choose a service", d: "Hourly, full-day, outstation, monthly and more." },
  { icon: "calendar", t: "Pick date & time", d: "See a clear fare estimate before you book." },
  { icon: "card", t: "Pay 20% advance", d: "Your booking is confirmed instantly and securely." },
  { icon: "shield-checkmark", t: "Verified driver arrives", d: "Start the trip only with your 4-digit OTP." },
];

const BENEFITS = [
  { icon: "id-card", t: "Document-verified drivers", d: "Identity and licence reviewed manually by our team." },
  { icon: "pricetag", t: "Transparent pricing", d: "Server-calculated fares with GST and night charges shown upfront." },
  { icon: "key", t: "OTP-secured trips", d: "Trips start only after you share your trip OTP." },
  { icon: "headset", t: "Real human support", d: "WhatsApp and phone support during business hours." },
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* Sticky nav */}
      <View
        style={{
          paddingTop: insets.top + space.sm,
          paddingBottom: space.md,
          paddingHorizontal: space.lg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Row gap={6}>
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="car-sport" size={18} color={colors.onBrandPrimary} />
          </View>
          <Txt v="h2" testID="brand-name">
            {s.company_name ?? "Prajeta"}
          </Txt>
        </Row>
        <Row>
          <Btn small variant="ghost" title="Track" testID="nav-track-button" onPress={() => router.push("/track")} />
          <Btn small variant="dark" title="Log in" testID="nav-login-button" onPress={() => router.push("/login")} />
        </Row>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}>
        {/* Hero */}
        <View style={{ padding: space.lg }}>
          <View style={{ borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surfaceInverse }}>
            <Image source={{ uri: HERO }} style={{ position: "absolute", width: "100%", height: "100%", opacity: 0.18 }} contentFit="cover" />
            <LinearGradient colors={["transparent", colors.surfaceInverse]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "70%" }} />
            <View style={{ padding: space.xl, gap: space.md, paddingTop: space.xxxl }}>
              <View style={{ alignSelf: "flex-start", backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Txt v="label" color={colors.onBrandPrimary}>
                  Drivers for your own car
                </Txt>
              </View>
              <Txt v="display" color={colors.onSurfaceInverse} testID="hero-headline" style={wide ? { fontSize: 48, lineHeight: 56 } : undefined}>
                {s.tagline ?? "Find a Trusted Driver, Wherever You Need One."}
              </Txt>
              <Txt v="body" color={colors.surfaceTertiary}>
                Professional, document-verified drivers for your own vehicle — by the hour, day, night, outstation or month. Not a taxi. Not a rental. Just a trusted driver.
              </Txt>
              <Row style={{ marginTop: space.sm, flexWrap: "wrap" }}>
                <Btn title="Find a Driver" icon="search" testID="hero-find-driver-button" onPress={() => router.push(`/book/${svc}?city=${cityId}&date=${day}&time=${time}` as any)} />
                <Btn title="Become a Driver" variant="outline" icon="person-add" testID="hero-become-driver-button" onPress={() => router.push("/login?role=driver")} />
              </Row>
            </View>
          </View>
        </View>

        {cfg.isLoading ? <Loader label="Loading services…" /> : cfg.error ? <ErrorView message="Unable to load services" onRetry={() => cfg.refetch()} /> : null}

        {/* Quick booking */}
        {services.length ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <Card testID="quick-booking-form" style={{ gap: space.md }}>
              <Txt v="h3">Quick booking</Txt>
              <Txt v="label">Service</Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ flexGrow: 0 }}>
                {services.map((x) => (
                  <Chip key={x.id} label={x.name} selected={svc === x.id} onPress={() => setSvc(x.id)} testID={`quick-service-${x.id}`} />
                ))}
              </ScrollView>
              <Txt v="label">City</Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ flexGrow: 0 }}>
                {cities.map((c) => (
                  <Chip key={c.id} label={c.name} selected={cityId === c.id} onPress={() => setCity(c.id)} testID={`quick-city-${c.id}`} />
                ))}
              </ScrollView>
              <Txt v="label">When</Txt>
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
              <Btn
                title={services.find((x) => x.id === svc)?.pricing_mode === "quote" ? "Request a quote" : "View fare estimate"}
                icon="arrow-forward"
                testID="quick-booking-submit-button"
                onPress={() => router.push(`/book/${svc}?city=${cityId}&date=${day}&time=${time}` as any)}
              />
            </Card>
          </View>
        ) : null}

        {/* Services */}
        <Section title="Our services" sub="Choose the driver service that fits your day.">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
            {services.map((x) => (
              <Pressable
                key={x.id}
                testID={`service-card-${x.id}`}
                onPress={() => router.push(`/service/${x.id}`)}
                style={({ pressed }) => ({
                  flexBasis: wide ? "31%" : "46%",
                  flexGrow: 1,
                  backgroundColor: colors.surfaceSecondary,
                  borderRadius: radius.lg,
                  padding: space.lg,
                  gap: space.sm,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={x.icon as any} size={20} color={colors.brandPrimary} />
                </View>
                <Txt v="h3">{x.name}</Txt>
                <Txt v="caption" numberOfLines={2}>
                  {x.tagline}
                </Txt>
                <Txt v="caption" style={{ fontFamily: fonts.numBold, color: colors.onSurface }}>
                  {priceFrom(x)}
                </Txt>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section title="How it works">
          <View style={{ gap: space.md }}>
            {STEPS.map((st, i) => (
              <Row key={st.t} gap={space.md} style={{ alignItems: "flex-start" }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: i === 2 ? colors.brandPrimary : colors.surfaceInverse, alignItems: "center", justifyContent: "center" }}>
                  <Txt v="bodyBold" color={colors.onSurfaceInverse}>
                    {i + 1}
                  </Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt v="h3">{st.t}</Txt>
                  <Txt v="body" color={colors.muted}>
                    {st.d}
                  </Txt>
                </View>
              </Row>
            ))}
          </View>
        </Section>

        <Section title="Safety & verification" sub="Why families and businesses trust Prajeta.">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
            {BENEFITS.map((b) => (
              <Card key={b.t} style={{ flexBasis: wide ? "23%" : "46%", flexGrow: 1, gap: space.sm }}>
                <Ionicons name={b.icon as any} size={22} color={colors.brandPrimary} />
                <Txt v="h3">{b.t}</Txt>
                <Txt v="caption">{b.d}</Txt>
              </Card>
            ))}
          </View>
          <Btn small variant="ghost" title="Read our safety process" icon="arrow-forward" testID="safety-link" onPress={() => router.push("/page/safety")} style={{ alignSelf: "flex-start", marginTop: space.sm }} />
        </Section>

        <Section title="Monthly & corporate">
          <Card tone="dark" style={{ gap: space.md }}>
            <Txt v="h2" color={colors.onSurfaceInverse}>
              Dedicated drivers for families, offices, hotels & societies
            </Txt>
            <Txt v="body" color={colors.surfaceTertiary}>
              Monthly drivers with backup cover, permanent placements and corporate staffing with consolidated monthly invoices.
            </Txt>
            <Row style={{ flexWrap: "wrap" }}>
              <Btn small title="Corporate enquiry" testID="corporate-enquiry-button" onPress={() => router.push("/enquiry?type=corporate")} />
              <Btn small variant="outline" title="Monthly driver" testID="monthly-enquiry-button" onPress={() => router.push("/service/monthly")} />
            </Row>
          </Card>
        </Section>

        <Section title="Where we operate">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {cities.map((c) => (
              <View key={c.id} testID={`city-${c.id}`} style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm }}>
                <Txt v="bodyBold">
                  {c.name} <Txt v="caption">· {c.areas.length} areas</Txt>
                </Txt>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Frequently asked questions">
          {(cfg.data?.faqs ?? []).map((f, i) => (
            <Pressable key={f.q} testID={`faq-${i}`} onPress={() => setOpenFaq(openFaq === i ? null : i)} style={{ paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
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
        </Section>

        <Section title="Need help?">
          <Row style={{ flexWrap: "wrap" }}>
            <Btn title="WhatsApp us" icon="logo-whatsapp" variant="success" testID="whatsapp-support-button" onPress={() => s.whatsapp_link && Linking.openURL(s.whatsapp_link)} />
            <Btn title="Call support" icon="call" variant="outline" testID="call-support-button" onPress={() => Linking.openURL(`tel:${(s.support_phone ?? "").replace(/\s/g, "")}`)} />
          </Row>
          <Txt v="caption" style={{ marginTop: space.sm }}>
            {s.business_hours} · {s.support_email}
          </Txt>
        </Section>

        {/* Footer */}
        <View style={{ backgroundColor: colors.surfaceInverse, padding: space.xl, gap: space.md, marginTop: space.xl }}>
          <Txt v="h2" color={colors.onSurfaceInverse}>
            {s.company_name ?? "Prajeta"}
          </Txt>
          <Txt v="caption" color={colors.surfaceTertiary}>
            {s.legal_name}
          </Txt>
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
                <Txt v="bodyBold" color={colors.onSurfaceInverse}>
                  {label}
                </Txt>
              </Pressable>
            ))}
          </View>
          <Txt v="caption" color={colors.muted}>
            Illustrations are representative and do not depict actual Prajeta drivers. © 2026 {s.company_name ?? "Prajeta"}
          </Txt>
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: space.lg, paddingTop: space.xxl, gap: space.md }}>
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
