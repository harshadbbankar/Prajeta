import { useQuery } from "@tanstack/react-query";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { ADMIN_ROLES, can, useAuth } from "@/src/auth";
import { useConfig } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { space, useTheme } from "@/src/theme";
import { Bars, Btn, Card, Chip, ChipRow, ErrorView, Loader, Row, Stat, Txt, money } from "@/src/ui";
import { SosBanner } from "@/src/components/SosBanner";

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
  const q = useQuery({ queryKey: ["admin-dash", period, city], queryFn: () => api<any>(`/admin/dashboard?period=${period}&city_id=${city}`), enabled: !!user && ADMIN_ROLES.includes(user.role) });
  if (!ready) return <Loader />;
  if (!user || !ADMIN_ROLES.includes(user.role)) return <Redirect href="/login" />;
  const d = q.data;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + space.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Row style={{ paddingHorizontal: space.lg, justifyContent: "space-between" }}>
          <View>
            <Txt v="caption">Prajeta ERP · {user.role.replace("_", " ")}</Txt>
            <Txt v="title">Operations</Txt>
          </View>
          <Btn small variant="outline" icon="notifications" title="Alerts" onPress={() => router.push("/notifications")} testID="admin-notifications-button" />
        </Row>
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
        <ScrollView refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />} contentContainerStyle={{ paddingBottom: (usesNativeTabs ? insets.bottom : 0) + space.xl, gap: space.lg }}>
          <ChipRow>
            <Chip label="All cities" selected={!city} onPress={() => setCity("")} testID="dash-city-all" />
            {(cfg.data?.cities ?? []).map((c) => (
              <Chip key={c.id} label={c.name} selected={city === c.id} onPress={() => setCity(c.id)} testID={`dash-city-${c.id}`} />
            ))}
          </ChipRow>
          <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
            <SosBanner />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
              <Stat tone="dark" label="Gross booking value" value={money(d.gbv)} sub={`${d.bookings} bookings`} testID="kpi-gbv" />
              <Stat tone="brand" label="Collections" value={money(d.collections)} sub={`Receivable ${money(d.receivables)}`} testID="kpi-collections" />
              <Stat label="New bookings" value={String(d.new_bookings)} testID="kpi-new-bookings" />
              <Stat label="Completed" value={String(d.completed)} sub={`${d.completion_rate}%`} testID="kpi-completed" />
              <Stat label="Cancelled" value={String(d.cancelled)} sub={`${d.cancellation_rate}%`} testID="kpi-cancelled" />
              <Stat label="Pending assignment" value={String(d.pending_assignment)} testID="kpi-pending-assignment" />
              <Stat label="Confirmed (live)" value={String(d.confirmed)} />
              <Stat label="Active trips" value={String(d.active_trips)} testID="kpi-active-trips" />
              <Stat label="Advance pending" value={String(d.pending_payments)} />
              <Stat label="Quotes pending" value={String(d.quotes_pending)} />
              <Stat label="Driver payouts" value={money(d.payouts)} />
              <Stat label="Open tickets" value={String(d.open_tickets)} testID="kpi-open-tickets" />
            </View>
            <Card style={{ gap: space.md }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt v="h3">Bookings trend</Txt>
                <Txt v="caption">{d.trend.length} days</Txt>
              </Row>
              {d.trend.length ? <Bars data={d.trend.slice(-20).map((t: any) => ({ label: t.date.slice(8), value: t.bookings }))} /> : <Txt v="caption">No data for this period</Txt>}
            </Card>
            <Card style={{ gap: space.sm }}>
              <Txt v="h3">Drivers & customers</Txt>
              <Row style={{ flexWrap: "wrap" }} gap={space.md}>
                <Stat label="Registered" value={String(d.drivers_registered)} />
                <Stat label="Pending verification" value={String(d.drivers_pending)} testID="kpi-drivers-pending" />
                <Stat label="Approved" value={String(d.drivers_approved)} />
                <Stat label="Online now" value={String(d.drivers_available)} testID="kpi-drivers-online" />
                <Stat label="Customers" value={String(d.customers_total)} />
                <Stat label="New enquiries" value={String(d.new_enquiries)} />
              </Row>
            </Card>
            <Row style={{ flexWrap: "wrap" }}>
              {d.licences_expired && can(user.role, "licences") ? <Btn small variant="soft" title={`${d.licences_expired} licence(s) expired`} icon="id-card" onPress={() => router.push("/erp/licences")} testID="dash-licences-link" /> : null}
              {can(user.role, "dispatch") ? <Btn small title="Dispatch queue" icon="git-network" onPress={() => router.push("/admin/bookings")} testID="dash-dispatch-link" /> : null}
              {can(user.role, "owner") ? <Btn small variant="dark" title="Owner intelligence" icon="analytics" onPress={() => router.push("/erp/owner")} testID="dash-owner-link" /> : null}
              {can(user.role, "drivers") ? <Btn small variant="outline" title="Verify drivers" icon="shield-checkmark" onPress={() => router.push("/admin/drivers")} testID="dash-drivers-link" /> : null}
            </Row>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
