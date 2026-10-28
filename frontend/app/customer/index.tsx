import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, router } from "expo-router";
import * as Linking from "expo-linking";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AddPhone } from "@/src/components/AddPhone";
import { fmtDate, fmtTime, priceFrom, useConfig } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Loader, Row, StatusBadge, Txt } from "@/src/ui";

export default function CustomerHome() {
  const { user, ready } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const cfg = useConfig();
  const bookings = useQuery({ queryKey: ["my-bookings"], queryFn: () => api<any[]>("/bookings"), enabled: !!user });
  const notif = useQuery({ queryKey: ["notifications"], queryFn: () => api<any>("/notifications"), enabled: !!user });
  if (!ready) return <Loader />;
  if (!user) return <Redirect href="/login" />;
  const upcoming = (bookings.data ?? []).filter((b) => !["COMPLETED", "CANCELLED"].includes(b.status)).slice(0, 3);
  const s = cfg.data?.settings ?? {};
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: space.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View>
          <Txt v="caption">Namaste,</Txt>
          <Txt v="h2" testID="customer-greeting">
            {user.name?.split(" ")[0] || "there"}
          </Txt>
        </View>
        <Pressable testID="notifications-button" onPress={() => router.push("/notifications")} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="notifications" size={20} color={colors.onSurface} />
          {notif.data?.unread ? <View style={{ position: "absolute", top: 10, right: 11, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brandPrimary }} /> : null}
        </Pressable>
      </View>
      <ScrollView
        refreshControl={<RefreshControl refreshing={bookings.isRefetching} onRefresh={() => { bookings.refetch(); notif.refetch(); }} />}
        contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: bottomChrome + space.xl }}
      >
        <AddPhone />
        <Card tone="dark" style={{ gap: space.md }}>
          <Txt v="title" color={colors.onSurfaceInverse}>
            Need a driver for your car?
          </Txt>
          <Txt v="body" color={colors.surfaceTertiary}>
            Book now or schedule for later. Verified drivers, transparent fares.
          </Txt>
          <Row>
            <Btn small title="Book now" icon="flash" testID="book-now-button" onPress={() => router.push("/book/hourly")} />
            <Btn small variant="outline" title="Schedule later" icon="calendar" testID="schedule-later-button" onPress={() => router.push("/book/full-day")} />
          </Row>
        </Card>

        {upcoming.length ? (
          <View style={{ gap: space.md }}>
            <Txt v="h2">Upcoming</Txt>
            {upcoming.map((b) => (
              <Card key={b.id} testID={`upcoming-booking-${b.ref}`} onPress={() => router.push(`/booking/${b.id}` as any)} style={{ gap: space.sm }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Txt v="h3">{b.service_name}</Txt>
                  <StatusBadge status={b.status} />
                </Row>
                <Txt v="caption">
                  {fmtDate(b.date)} · {fmtTime(b.time)} · {b.ref}
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

        <View style={{ gap: space.md }}>
          <Txt v="h2">Services</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
            {(cfg.data?.services ?? []).map((x) => (
              <Pressable
                key={x.id}
                testID={`home-service-${x.id}`}
                onPress={() => router.push(x.id === "corporate" ? "/enquiry?type=corporate" : (`/book/${x.id}` as any))}
                style={({ pressed }) => ({ flexBasis: "30%", flexGrow: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: space.md, gap: 6, opacity: pressed ? 0.8 : 1 })}
              >
                <Ionicons name={x.icon as any} size={22} color={colors.brandPrimary} />
                <Txt v="bodyBold" numberOfLines={1}>
                  {x.name}
                </Txt>
                <Txt v="caption" numberOfLines={1} style={{ fontFamily: fonts.num }}>
                  {priceFrom(x)}
                </Txt>
              </Pressable>
            ))}
          </View>
        </View>

        <Card tone="grey" style={{ gap: space.sm }}>
          <Txt v="h3">Monthly, permanent or corporate?</Txt>
          <Txt v="caption">Tell us your requirement and get a custom quote.</Txt>
          <Row style={{ flexWrap: "wrap" }}>
            <Btn small variant="outline" title="Monthly" testID="home-enquiry-monthly" onPress={() => router.push("/enquiry?type=monthly")} />
            <Btn small variant="outline" title="Permanent" testID="home-enquiry-permanent" onPress={() => router.push("/enquiry?type=permanent")} />
            <Btn small variant="outline" title="Corporate" testID="home-enquiry-corporate" onPress={() => router.push("/enquiry?type=corporate")} />
          </Row>
        </Card>

        <Btn title="Chat on WhatsApp" icon="logo-whatsapp" variant="success" testID="home-whatsapp-button" onPress={() => s.whatsapp_link && Linking.openURL(s.whatsapp_link)} />
      </ScrollView>
    </View>
  );
}
