import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, router } from "expo-router";
import * as Linking from "expo-linking";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AddPhone } from "@/src/components/AddPhone";
import { ReferralCard } from "@/src/components/ReferralCard";
import { SosQuick } from "@/src/components/SosQuick";
import { fmtDate, fmtTime, nextDays, priceParts, useConfig } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Btn, Card, IconBtn, IconTile, Loader, Row, SectionHead, StatusBadge, Tag, TopBar, TrustStrip, Txt } from "@/src/ui";

const HERO_IMG = "https://images.unsplash.com/photo-1503376780353-7e6692767b70?crop=entropy&cs=srgb&fm=jpg&q=70&w=1200";

export default function CustomerHome() {
  const { user, ready } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const cfg = useConfig();
  const [when, setWhen] = useState<"today" | "tomorrow">("today");
  const [gear, setGear] = useState<"Automatic" | "Manual">("Automatic");
  const bookings = useQuery({ queryKey: ["my-bookings"], queryFn: () => api<any[]>("/bookings"), enabled: !!user });
  const notif = useQuery({ queryKey: ["notifications"], queryFn: () => api<any>("/notifications"), enabled: !!user });
  if (!ready) return <Loader />;
  if (!user) return <Redirect href="/login" />;
  const all = bookings.data ?? [];
  const upcoming = all.filter((b) => !["COMPLETED", "CANCELLED"].includes(b.status)).slice(0, 3);
  const last = all.find((b) => b.status === "COMPLETED");
  const s = cfg.data?.settings ?? {};
  const cities = cfg.data?.cities ?? [];
  const cityName = cities.find((c) => c.id === (all[0]?.city_id ?? ""))?.name ?? cities[0]?.name ?? "Your city";
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const days = nextDays(2);
  const homeCity = all[0]?.city_id ?? cities[0]?.id ?? "";
  const bookHref = `/book/hourly?city=${homeCity}&date=${when === "today" ? days[0].iso : days[1].iso}&trans=${gear}`;
  const services = (cfg.data?.services ?? []).filter((x) => x.id !== "corporate");

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <TopBar
        eyebrow="Current city"
        title={cityName}
        sub={`· ${user.name?.split(" ")[0] || "there"}`}
        testID="customer-greeting"
        right={
          <>
            <SosQuick role="customer" />
            <IconBtn icon="notifications-outline" dot={!!notif.data?.unread} onPress={() => router.push("/notifications")} testID="notifications-button" />
          </>
        }
      />
      <ScrollView
        refreshControl={<RefreshControl refreshing={bookings.isRefetching} onRefresh={() => { bookings.refetch(); notif.refetch(); }} />}
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: bottomChrome + space.xl }}
      >
        <AddPhone />
        {/* Hero */}
        <View style={{ borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surfaceInverse }}>
          <Image source={{ uri: HERO_IMG }} style={{ position: "absolute", width: "100%", height: "100%" }} contentFit="cover" />
          <LinearGradient colors={["rgba(0,0,0,0.92)", "rgba(0,0,0,0.75)", "rgba(0,0,0,0.4)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
          <View style={{ padding: space.xl - 4, gap: space.sm, maxWidth: "88%" }}>
            <Row gap={6} style={{ alignSelf: "flex-start", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Ionicons name="shield-checkmark" size={12} color={colors.successBorder} />
              <Txt v="label" color={colors.onSurfaceInverse}>Discreet chauffeur service</Txt>
            </Row>
            <Txt v="title" color={colors.onSurfaceInverse}>Professional Drivers for Your Personal Car</Txt>
            <Txt v="caption" color={colors.surfaceTertiary}>Verified, background-checked chauffeurs on demand or scheduled. Travel in the comfort of your own vehicle.</Txt>
          </View>
        </View>

        <TrustStrip
          testID="home-trust-strip"
          items={[
            { icon: "shield-checkmark-outline", label: "100% Police Verified" },
            { icon: "medkit-outline", label: "Drug & Alcohol Tested" },
            { icon: "lock-closed-outline", label: "OTP-Secured Trips" },
          ]}
        />

        {/* Book in seconds */}
        <Card style={{ gap: space.md }} testID="book-in-seconds-card">
          <Row style={{ justifyContent: "space-between" }}>
            <Txt v="label" style={{ fontSize: 12 }}>Book in seconds</Txt>
            <Tag tone="success" label="Verified drivers nearby" />
          </Row>
          <Pressable testID="home-pickup-row" onPress={() => router.push(bookHref as any)} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: space.sm, backgroundColor: colors.canvas }}>
            <IconTile icon="locate-outline" size={44} tone="plain" />
            <View style={{ flex: 1 }}>
              <Txt v="caption">Pickup location</Txt>
              <Txt v="h3" numberOfLines={1} style={{ fontFamily: fonts.semibold }}>Enter your pickup address</Txt>
            </View>
            <Ionicons name="create-outline" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>
          <Row>
            <SelectBox icon="time-outline" label="Start time" value={when === "today" ? "Today" : "Tomorrow"} onPress={() => setWhen(when === "today" ? "tomorrow" : "today")} testID="home-when-select" />
            <SelectBox icon="car-outline" label="Car gearbox" value={gear} onPress={() => setGear(gear === "Automatic" ? "Manual" : "Automatic")} testID="home-gear-select" />
          </Row>
          <Btn title="Find Professional Chauffeur" icon="search" testID="book-now-button" onPress={() => router.push(bookHref as any)} />
          <Pressable testID="schedule-later-button" onPress={() => router.push("/book/full-day")} style={{ alignSelf: "center", minHeight: 32, justifyContent: "center" }}>
            <Txt v="bodyBold" style={{ textDecorationLine: "underline" }}>Schedule a full-day driver</Txt>
          </Pressable>
        </Card>

        {last?.driver_name || last?.driver ? (
          <Card testID="quick-rebook-card">
            <Row gap={space.md}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.tint, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="person" size={22} color={colors.onSurface} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt v="label">Quick rebook</Txt>
                <Txt v="h3" style={{ fontFamily: fonts.bold }} numberOfLines={1}>{last.driver?.name ?? last.driver_name}</Txt>
                <Txt v="caption" numberOfLines={1}>{last.service_name} · {fmtDate(last.date)}</Txt>
              </View>
              <Btn small variant="outline" icon="refresh" title="Rebook" onPress={() => router.push(`/book/${last.service_id}` as any)} testID="quick-rebook-button" />
            </Row>
          </Card>
        ) : null}

        {upcoming.length ? (
          <View style={{ gap: space.md }}>
            <SectionHead title="Upcoming trips" />
            {upcoming.map((b) => (
              <Card key={b.id} testID={`upcoming-booking-${b.ref}`} onPress={() => router.push(`/booking/${b.id}` as any)} style={{ gap: space.sm }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Txt v="h3" style={{ fontFamily: fonts.bold, flex: 1 }}>{b.service_name}</Txt>
                  <StatusBadge status={b.status} />
                </Row>
                <Txt v="caption">
                  {fmtDate(b.date)} · {fmtTime(b.time)} · #{b.ref}
                </Txt>
                {b.status === "PAYMENT_PENDING" || b.status === "QUOTED" ? (
                  <Txt v="bodyBold" color={colors.brandPrimary}>
                    Pay advance to confirm →
                  </Txt>
                ) : null}
              </Card>
            ))}
          </View>
        ) : null}

        <SectionHead
          title="Driver Services"
          sub="Select the ideal chauffeur arrangement for your itinerary"
          right={
            <Pressable onPress={() => router.push("/service/hourly")} testID="home-rate-card" hitSlop={8}>
              <Txt v="bodyBold">Rate Card</Txt>
            </Pressable>
          }
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
          {services.map((x, i) => {
            const pp = priceParts(x);
            const popular = i === 0;
            return (
              <Pressable
                key={x.id}
                testID={`home-service-${x.id}`}
                onPress={() => router.push(x.pricing_mode === "quote" && x.id !== "monthly" && x.id !== "permanent" ? "/enquiry?type=corporate" : (`/book/${x.id}` as any))}
                style={({ pressed }) => ({
                  flexBasis: "46%",
                  flexGrow: 1,
                  backgroundColor: colors.surface,
                  borderRadius: radius.lg,
                  borderWidth: popular ? 2 : 1,
                  borderColor: popular ? colors.surfaceInverse : colors.border,
                  padding: space.md,
                  gap: 6,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                {popular ? (
                  <View style={{ position: "absolute", top: -1, right: 8, backgroundColor: colors.surfaceInverse, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Txt v="label" color={colors.onSurfaceInverse}>Most popular</Txt>
                  </View>
                ) : null}
                <IconTile icon={x.icon.replace("-outline", "")} size={36} />
                <Txt v="h3" style={{ fontFamily: fonts.semibold, marginTop: 4 }} numberOfLines={2}>{x.name}</Txt>
                <Txt v="caption" numberOfLines={2} style={{ minHeight: 32 }}>{x.tagline}</Txt>
                <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
                <Row style={{ justifyContent: "space-between" }}>
                  <Txt v="numLg" style={pp.amount === "Enquire" ? { fontSize: 16 } : undefined}>{pp.amount}</Txt>
                  <Txt v="caption" style={{ fontFamily: fonts.semibold }}>{pp.unit}</Txt>
                </Row>
              </Pressable>
            );
          })}
        </View>

        <Card style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
          <IconTile icon="ribbon-outline" tone="success" />
          <View style={{ flex: 1 }}>
            <Txt v="h3" style={{ fontFamily: fonts.bold }}>Transmission Trained & Certified</Txt>
            <Txt v="caption">All chauffeurs hold verifiable experience across Manual, Automatic, DCT, CVT and Electric vehicles.</Txt>
          </View>
        </Card>

        <ReferralCard compact />

        <Card tone="tint" style={{ gap: space.sm }}>
          <Txt v="h3" style={{ fontFamily: fonts.bold }}>Monthly, permanent or corporate?</Txt>
          <Txt v="caption">Tell us your requirement and get a custom quote.</Txt>
          <Row style={{ flexWrap: "wrap" }}>
            <Btn small variant="outline" title="Monthly" testID="home-enquiry-monthly" onPress={() => router.push("/enquiry?type=monthly")} />
            <Btn small variant="outline" title="Permanent" testID="home-enquiry-permanent" onPress={() => router.push("/enquiry?type=permanent")} />
            <Btn small variant="dark" title="Corporate" testID="home-enquiry-corporate" onPress={() => router.push("/enquiry?type=corporate")} />
          </Row>
        </Card>

        <Btn title="Chat on WhatsApp" icon="logo-whatsapp" variant="success" testID="home-whatsapp-button" onPress={() => s.whatsapp_link && Linking.openURL(s.whatsapp_link)} />
      </ScrollView>
    </View>
  );
}

function SelectBox({ icon, label, value, onPress, testID }: { icon: string; label: string; value: string; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={{ flex: 1, minHeight: 52, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: colors.canvas }}>
      <Ionicons name={icon as any} size={18} color={colors.onSurface} />
      <View style={{ flex: 1 }}>
        <Txt v="caption">{label}</Txt>
        <Txt v="bodyBold" style={{ fontSize: 15 }}>{value}</Txt>
      </View>
      <Ionicons name="chevron-down" size={14} color={colors.muted} />
    </Pressable>
  );
}
