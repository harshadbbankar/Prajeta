import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { usesNativeTabs } from "@/src/navigation";
import { space, useTheme } from "@/src/theme";
import { Card, Chip, ChipRow, Empty, Field, Loader, Row, StatusBadge, Txt } from "@/src/ui";

const ST = [
  ["SUBMITTED", "Submitted"],
  ["UNDER_REVIEW", "Under review"],
  ["APPROVED", "Approved"],
  ["SUSPENDED", "Suspended"],
  ["REJECTED", "Rejected"],
  ["DRAFT", "Draft"],
  ["", "All"],
];

export default function AdminDrivers() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState("SUBMITTED");
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["admin-drivers", status, search], queryFn: () => api<any[]>(`/admin/drivers?status=${status}&q=${encodeURIComponent(search)}`) });
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ paddingTop: insets.top + space.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
          <Txt v="title">Drivers</Txt>
          <Field placeholder="Search name or phone" value={search} onChangeText={setSearch} testID="admin-drivers-search" />
        </View>
        <ChipRow>
          {ST.map(([k, l]) => (
            <Chip key={l} label={l} selected={status === k} onPress={() => setStatus(k)} testID={`admin-drivers-filter-${l.toLowerCase().replace(/ /g, "-")}`} />
          ))}
        </ChipRow>
      </View>
      {q.isLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(d) => d.user_id}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + space.xl }}
          ListEmptyComponent={<Empty icon="people-outline" title="No drivers in this status" />}
          renderItem={({ item: d }) => (
            <Card testID={`admin-driver-${d.phone}`} onPress={() => router.push(`/erp/driver/${d.user_id}` as any)} style={{ gap: 4, padding: space.md }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt v="bodyBold">{d.name || d.phone}</Txt>
                <StatusBadge status={d.status} />
              </Row>
              <Txt v="caption">
                {d.phone} · {d.city_id || "—"} · {d.experience_years ?? 0} yrs · docs {d.documents.filter((x: any) => x.verified).length}/{d.documents.length} verified {d.online ? "· Online" : ""}
              </Txt>
            </Card>
          )}
        />
      )}
    </View>
  );
}
