import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { api } from "@/src/api";
import { ADMIN_ROLES, can, useAuth } from "@/src/auth";
import { fmtDate, fmtTime, useConfig } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Bars, Btn, Card, CardTitle, Chip, ChipRow, ErrorView, IconBtn, Loader, Plate, Row, Stat, StatusBadge, Tag, TopBar, Txt, money } from "@/src/ui";
import { SosBanner } from "@/src/components/SosBanner";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const PERIODS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["month", "This month"],
  ["prev_month", "Last month"],
  ["quarter", "Quarter"],
  ["fy", "FY"],
  ["all", "All time"],
];

export default function AdminDashboard() {
  const { user, ready } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const cfg = useConfig();
  const [period, setPeriod] = useState("30d");
  const [city, setCity] = useState("");
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);
  const q = useQuery({ queryKey: ["admin-dash", period, city], queryFn: () => api<any>(`/admin/dashboard?period=${period}&city_id=${city}`), enabled: isAdmin });
  const exc = useQuery({
    queryKey: ["admin-exceptions", city],
    queryFn: () => api<any[]>(`/admin/bookings?status=AWAITING_ASSIGNMENT,ASSIGNED,PAYMENT_PENDING&city_id=${city}`),
    enabled: isAdmin && can(user!.role, "dispatch"),
  });
  const kyc = useQuery({ queryKey: ["admin-kyc"], queryFn: () => api<any[]>(`/admin/drivers?status=SUBMITTED`), enabled: isAdmin && can(user!.role, "drivers") });
  if (!ready) return <Loader />;
  if (!user || !isAdmin) return <Redirect href="/login" />;
  const d = q.data;
  const cityName = (cfg.data?.cities ?? []).find((c) => c.id === city)?.name;
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <TopBar
        leading={
          <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="shield-checkmark" size={20} color={colors.onBrandPrimary} />
          </View>
        }
        eyebrow={`Prajeta ERP · ${user.role.replace("_", " ")}`}
        title={`${cityName ?? "All cities"} Hub`}
        right={
          <>
            {can(user.role, "dispatch") ? <IconBtn icon="add-circle-outline" bordered onPress={() => router.push("/admin/bookings")} testID="admin-manual-booking" /> : null}
            <IconBtn icon="notifications-outline" bordered onPress={() => router.push("/notifications")} testID="admin-notifications-button" />
          </>
        }
      />
      <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ChipRow testID="dashboard-period-row">
          {PERIODS.map(([k, l]) => (
            <Chip key={k} label={l} selected={period === k} onPress={() => setPeriod(k)} testID={`period-${k}`} />
          ))}
        </ChipRow>
      </View>
      {q.isLoading ? (
        <Loader label="Loading metrics…" />
      ) : q.error ? (
        <ErrorView message={(q.error as any).message} onRetry={() => q.refetch()} />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); exc.refetch(); kyc.refetch(); }} />}
          contentContainerStyle={{ paddingBottom: (usesNativeTabs ? insets.bottom : 0) + space.xl, gap: space.lg }}
        >
          <ChipRow>
            <Chip label="All cities" selected={!city} onPress={() => setCity("")} testID="dash-city-all" />
            {(cfg.data?.cities ?? []).map((c) => (
              <Chip key={c.id} label={c.name} selected={city === c.id} onPress={() => setCity(c.id)} testID={`dash-city-${c.id}`} />
            ))}
          </ChipRow>
          <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
            <SosBanner />
            <Card style={{ gap: space.md }} testID="executive-briefing-card">
              <Row style={{ flexWrap: "wrap" }}>
                <Tag tone="dark" label="Executive briefing" />
                <Txt v="caption">Live sync · {PERIODS.find(([k]) => k === period)?.[1]}</Txt>
              </Row>
              <Txt v="title">{cityName ?? "Prajeta"} Operations & Financial Yield</Txt>
              <Txt v="body" color={colors.muted}>
                Real-time control tower for personal-vehicle chauffeurs: {d.active_trips} live trips, {d.pending_assignment} awaiting dispatch and {d.drivers_available} drivers on duty.
              </Txt>
              <Row style={{ flexWrap: "wrap" }}>
                {can(user.role, "owner") ? <Btn small variant="outline" icon="download-outline" title="Executive P&L" onPress={() => router.push("/erp/owner")} testID="dash-owner-link" /> : null}
                {can(user.role, "dispatch") ? <Btn small variant="dark" icon="git-network-outline" title="Dispatch queue" onPress={() => router.push("/admin/bookings")} testID="dash-dispatch-link" /> : null}
              </Row>
            </Card>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
              <Kpi label="Gross booking value" icon="cash-outline" value={money(d.gbv)} tag={`${d.bookings} bookings`} testID="kpi-gbv" />
              <Kpi label="Collections" icon="wallet-outline" value={money(d.collections)} tag={`Receivable ${money(d.receivables)}`} testID="kpi-collections" />
              <Kpi label="Active chauffeurs on duty" icon="speedometer-outline" value={`${d.drivers_available} / ${d.drivers_approved}`} tag={`${d.drivers_pending} pending KYC`} testID="kpi-drivers-online" />
              <Kpi label="Fulfilment rate" icon="checkmark-circle-outline" value={`${d.completion_rate}%`} tag={`${d.cancellation_rate}% cancelled`} tone={d.cancellation_rate > 10 ? "brand" : "success"} testID="kpi-completed" />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
              <Stat label="New bookings" value={String(d.new_bookings)} testID="kpi-new-bookings" />
              <Stat label="Completed" value={String(d.completed)} sub={`${d.completion_rate}%`} />
              <Stat label="Cancelled" value={String(d.cancelled)} sub={`${d.cancellation_rate}%`} testID="kpi-cancelled" />
              <Stat label="Pending assignment" value={String(d.pending_assignment)} testID="kpi-pending-assignment" />
              <Stat label="Confirmed (live)" value={String(d.confirmed)} />
              <Stat label="Active trips" value={String(d.active_trips)} testID="kpi-active-trips" />
              <Stat label="Advance pending" value={String(d.pending_payments)} />
              <Stat label="Quotes pending" value={String(d.quotes_pending)} />
              <Stat label="Driver payouts" value={money(d.payouts)} />
              <Stat label="Open tickets" value={String(d.open_tickets)} testID="kpi-open-tickets" />
            </View>

            {can(user.role, "dispatch") ? (
              <Card style={{ gap: space.md, padding: 0, overflow: "hidden" }} testID="exception-board">
                <View style={{ padding: space.lg, paddingBottom: 0 }}>
                  <CardTitle title="Live Operations & Exception Dispatch" sub="Unassigned and unpaid bookings needing action" right={<Tag tone="dark" label={`${(exc.data ?? []).length} live`} />} />
                </View>
                {(exc.data ?? []).slice(0, 6).map((b) => (
                  <Pressable key={b.id} testID={`exception-${b.ref}`} onPress={() => router.push(`/erp/booking/${b.id}` as any)} style={({ pressed }) => ({ paddingHorizontal: space.lg, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: colors.border, gap: 6, backgroundColor: pressed ? colors.tint : colors.surface })}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <Txt v="bodyBold" style={{ fontFamily: fonts.bold }}>#{b.ref}</Txt>
                      <StatusBadge status={b.status} />
                    </Row>
                    <Row style={{ flexWrap: "wrap" }}>
                      <Txt v="bodyBold">{b.customer_name ?? "Customer"}</Txt>
                      {b.vehicle?.reg_number ? <Plate reg={b.vehicle.reg_number} /> : <Txt v="caption">{b.vehicle_type} · {b.transmission}</Txt>}
                    </Row>
                    <Row style={{ justifyContent: "space-between" }}>
                      <Tag tone={b.status === "AWAITING_ASSIGNMENT" ? "brand" : "tint"} label={b.service_name} />
                      <Txt v="caption">{fmtDate(b.date)} · {fmtTime(b.time)}</Txt>
                    </Row>
                  </Pressable>
                ))}
                {!(exc.data ?? []).length ? <Txt v="caption" style={{ paddingHorizontal: space.lg }}>No exceptions right now.</Txt> : null}
                <Pressable onPress={() => router.push("/admin/bookings")} style={{ backgroundColor: colors.tint, padding: space.md, alignItems: "flex-end" }}>
                  <Txt v="bodyBold">Open global dispatch →</Txt>
                </Pressable>
              </Card>
            ) : null}

            <Card style={{ gap: space.md }}>
              <CardTitle icon="bar-chart-outline" title="Bookings trend" right={<Txt v="caption">{d.trend.length} days</Txt>} />
              {d.trend.length ? <Bars color={colors.surfaceInverse} data={d.trend.slice(-20).map((t: any) => ({ label: t.date.slice(8), value: t.bookings }))} /> : <Txt v="caption">No data for this period</Txt>}
            </Card>

            {can(user.role, "drivers") ? (
              <Card style={{ gap: space.md }} testID="kyc-queue-card">
                <CardTitle title="Driver Vetting & KYC Queue" sub="Licence, identity and police verification" right={<Tag tone="warn" label={`${d.drivers_pending} pending`} testID="kpi-drivers-pending" />} />
                {(kyc.data ?? []).slice(0, 4).map((x) => (
                  <Row key={x.user_id ?? x.id} gap={space.md} style={{ backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder, borderRadius: radius.md, padding: space.md }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" }}>
                      <Txt v="bodyBold" color={colors.onSurfaceInverse}>{(x.name ?? "D").split(" ").map((w: string) => w[0]).slice(0, 2).join("")}</Txt>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt v="bodyBold">{x.name}</Txt>
                      <Txt v="caption" numberOfLines={1}>DL: {x.licence_number || "—"} · Exp: {x.experience_years ?? 0} yrs</Txt>
                    </View>
                    <Btn small variant="dark" title="Audit" onPress={() => router.push(`/erp/driver/${x.user_id}` as any)} testID={`kyc-audit-${x.user_id}`} />
                  </Row>
                ))}
                {!(kyc.data ?? []).length ? <Txt v="caption">No applications waiting.</Txt> : null}
                <Btn small variant="outline" title="Verify drivers" icon="shield-checkmark-outline" onPress={() => router.push("/admin/drivers")} testID="dash-drivers-link" />
              </Card>
            ) : null}

            <Card style={{ gap: space.sm }}>
              <CardTitle icon="people-outline" title="Drivers & customers" />
              <Row style={{ flexWrap: "wrap" }} gap={space.md}>
                <Stat label="Registered" value={String(d.drivers_registered)} />
                <Stat label="Approved" value={String(d.drivers_approved)} />
                <Stat label="Customers" value={String(d.customers_total)} />
                <Stat label="New enquiries" value={String(d.new_enquiries)} />
              </Row>
            </Card>
            <Row style={{ flexWrap: "wrap" }}>
              {d.licences_expired && can(user.role, "licences") ? <Btn small variant="soft" title={`${d.licences_expired} licence(s) expired`} icon="id-card" onPress={() => router.push("/erp/licences")} testID="dash-licences-link" /> : null}
            </Row>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Kpi({ label, value, tag, icon, tone = "tint", testID }: { label: string; value: string; tag: string; icon: string; tone?: "tint" | "success" | "brand"; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ flexBasis: "46%", flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space.md, gap: 6 }}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <Txt v="label" style={{ flex: 1 }}>{label}</Txt>
        <Ionicons name={icon as any} size={16} color={colors.onSurface} />
      </Row>
      <Txt v="numLg">{value}</Txt>
      <Tag tone={tone === "tint" ? "tint" : tone} label={tag} />
    </View>
  );
}
