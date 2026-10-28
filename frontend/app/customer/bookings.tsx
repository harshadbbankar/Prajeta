import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { fmtDate, fmtTime } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, ChipRow, Empty, ErrorView, Loader, Row, StatusBadge, Txt, money } from "@/src/ui";

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
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={{ paddingTop: insets.top + space.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Txt v="title" style={{ paddingHorizontal: space.lg }}>
          My bookings
        </Txt>
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
            <Card testID={`booking-row-${b.ref}`} onPress={() => router.push(`/booking/${b.id}` as any)} style={{ gap: 6 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt v="h3">{b.service_name}</Txt>
                <StatusBadge status={b.status} />
              </Row>
              <Txt v="caption">
                {fmtDate(b.date)} · {fmtTime(b.time)} · {b.city_name ?? b.city_id}
              </Txt>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt v="caption">{b.ref}</Txt>
                <Txt v="bodyBold">{b.fare?.total ? money(b.fare.total) : "Quote"}</Txt>
              </Row>
            </Card>
          )}
        />
      )}
    </View>
  );
}
