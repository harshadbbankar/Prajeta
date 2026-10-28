import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { SosQuick } from "@/src/components/SosQuick";
import { fmtDate, fmtTime } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, ChipRow, Empty, ErrorView, IconTile, Loader, Row, StatusBadge, TopBar, Txt, money } from "@/src/ui";

const FILTERS = [
  ["upcoming", "Upcoming"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
  ["all", "All"],
];

export default function MyBookings() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [f, setF] = useState("upcoming");
  const q = useQuery({ queryKey: ["my-bookings"], queryFn: () => api<any[]>("/bookings") });
  const list = (q.data ?? []).filter((b) =>
    f === "all" ? true : f === "completed" ? b.status === "COMPLETED" : f === "cancelled" ? b.status === "CANCELLED" : !["COMPLETED", "CANCELLED"].includes(b.status),
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TopBar eyebrow="Trip history" title="My bookings" leading={<Ionicons name="calendar-outline" size={22} color={colors.onSurface} />} right={<SosQuick role="customer" />} />
        <ChipRow testID="bookings-filter-row">
          {FILTERS.map(([k, l]) => (
            <Chip key={k} label={l} selected={f === k} onPress={() => setF(k)} testID={`bookings-filter-${k}`} />
          ))}
        </ChipRow>
      </View>
      {q.isLoading ? (
        <Loader />
      ) : q.error ? (
        <ErrorView message={(q.error as any).message} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(b) => b.id}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + space.xl }}
          ListEmptyComponent={<Empty title="No bookings here" body="Book a verified driver in under a minute." action={<Btn small title="Book a driver" onPress={() => router.push("/book/hourly")} testID="empty-book-button" />} />}
          renderItem={({ item: b }) => (
            <Card testID={`booking-row-${b.ref}`} onPress={() => router.push(`/booking/${b.id}` as any)} style={{ gap: space.sm }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Row gap={space.md} style={{ flex: 1 }}>
                  <IconTile icon="car-sport-outline" size={40} />
                  <View style={{ flex: 1 }}>
                    <Txt v="h3" style={{ fontFamily: fonts.bold }} numberOfLines={1}>{b.service_name}</Txt>
                    <Txt v="caption">#{b.ref}</Txt>
                  </View>
                </Row>
                <StatusBadge status={b.status} />
              </Row>
              <Row style={{ justifyContent: "space-between", backgroundColor: colors.tint, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm }}>
                <Txt v="caption" style={{ color: colors.onSurface }}>
                  {fmtDate(b.date)} · {fmtTime(b.time)} · {b.city_name ?? b.city_id}
                </Txt>
                <Txt v="bodyBold">{b.fare?.total ? money(b.fare.total) : "Quote"}</Txt>
              </Row>
            </Card>
          )}
        />
      )}
    </View>
  );
}
