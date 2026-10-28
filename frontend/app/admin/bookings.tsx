import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { fmtDate, fmtTime } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, ChipRow, Empty, Field, Loader, Row, StatusBadge, Txt, money } from "@/src/ui";

const GROUPS: [string, string][] = [
  ["AWAITING_ASSIGNMENT,ASSIGNED", "Needs driver"],
  ["QUOTE_REQUESTED", "Quotes"],
  ["PAYMENT_PENDING,QUOTED", "Advance pending"],
  ["ACCEPTED,DRIVER_ARRIVED,IN_PROGRESS", "Live"],
  ["COMPLETED", "Completed"],
  ["CANCELLED", "Cancelled"],
  ["", "All"],
];

export default function AdminBookings() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState(GROUPS[0][0]);
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["admin-bookings", status, search], queryFn: () => api<any[]>(`/admin/bookings?status=${status}&q=${encodeURIComponent(search)}`) });
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ paddingTop: insets.top + space.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Txt v="title">Bookings & dispatch</Txt>
            <Btn small variant="outline" icon="map" title="Live map" onPress={() => router.push("/erp/live-map" as any)} testID="dispatch-live-map-button" />
          </Row>
          <Field placeholder="Search ref, customer, phone, driver" value={search} onChangeText={setSearch} testID="admin-bookings-search" />
        </View>
        <ChipRow>
          {GROUPS.map(([k, l]) => (
            <Chip key={l} label={l} selected={status === k} onPress={() => setStatus(k)} testID={`admin-bookings-filter-${l.toLowerCase().replace(/ /g, "-")}`} />
          ))}
        </ChipRow>
      </View>
      {q.isLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(b) => b.id}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + space.xl }}
          ListEmptyComponent={<Empty icon="file-tray-outline" title="No bookings" />}
          renderItem={({ item: b }) => (
            <Card testID={`admin-booking-${b.ref}`} onPress={() => router.push(`/erp/booking/${b.id}` as any)} style={{ gap: 4, padding: space.md }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt v="bodyBold">{b.ref}</Txt>
                <StatusBadge status={b.status} />
              </Row>
              <Txt v="body">{b.service_name} · {b.city_name ?? b.city_id}</Txt>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt v="caption">{fmtDate(b.date)} {fmtTime(b.time)} · {b.customer_name ?? b.customer_phone}{b.driver_name ? ` · ${b.driver_name}` : ""}</Txt>
                <Txt v="caption" style={{ color: colors.onSurface }}>{b.fare?.total ? money(b.fare.total) : "Quote"}</Txt>
              </Row>
              {b.escalated ? <Txt v="caption" color={colors.error}>Escalated: {b.escalation_reason}</Txt> : null}
            </Card>
          )}
        />
      )}
    </View>
  );
}
