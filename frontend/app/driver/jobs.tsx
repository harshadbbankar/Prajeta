import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { fmtDate, fmtTime } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { space, useTheme } from "@/src/theme";
import { Card, Chip, ChipRow, Empty, Loader, Row, StatusBadge, Txt, money } from "@/src/ui";

export default function DriverJobs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [f, setF] = useState("upcoming");
  const q = useQuery({ queryKey: ["driver-jobs"], queryFn: () => api<any[]>("/driver/jobs") });
  const list = (q.data ?? []).filter((j) => (f === "upcoming" ? !["COMPLETED", "CANCELLED"].includes(j.status) : f === "completed" ? j.status === "COMPLETED" : true));
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={{ paddingTop: insets.top + space.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Txt v="title" style={{ paddingHorizontal: space.lg }}>My jobs</Txt>
        <ChipRow>
          {[["upcoming", "Upcoming & active"], ["completed", "Completed"], ["all", "All"]].map(([k, l]) => (
            <Chip key={k} label={l} selected={f === k} onPress={() => setF(k)} testID={`jobs-filter-${k}`} />
          ))}
        </ChipRow>
      </View>
      {q.isLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(j) => j.id}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + space.xl }}
          ListEmptyComponent={<Empty icon="briefcase-outline" title="No jobs yet" body="Accepted offers show up here." />}
          renderItem={({ item: j }) => (
            <Card testID={`job-row-${j.ref}`} onPress={() => router.push(`/trip/${j.id}` as any)} style={{ gap: 6 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt v="h3">{j.service_name}</Txt>
                <StatusBadge status={j.status} />
              </Row>
              <Txt v="caption">{fmtDate(j.date)} · {fmtTime(j.time)} · {j.pickup_area}</Txt>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt v="caption">{j.ref}</Txt>
                <Txt v="bodyBold">{money(j.driver_payout)}</Txt>
              </Row>
            </Card>
          )}
        />
      )}
    </View>
  );
}
