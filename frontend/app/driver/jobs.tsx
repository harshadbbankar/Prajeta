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
import { Card, Chip, ChipRow, Empty, IconTile, Loader, Row, StatusBadge, TopBar, Txt, money } from "@/src/ui";

export default function DriverJobs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [f, setF] = useState("upcoming");
  const q = useQuery({ queryKey: ["driver-jobs"], queryFn: () => api<any[]>("/driver/jobs") });
  const list = (q.data ?? []).filter((j) => (f === "upcoming" ? !["COMPLETED", "CANCELLED"].includes(j.status) : f === "completed" ? j.status === "COMPLETED" : true));
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TopBar eyebrow="Assignments" title="My jobs" leading={<Ionicons name="briefcase-outline" size={22} color={colors.onSurface} />} right={<SosQuick role="driver" />} />
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
            <Card testID={`job-row-${j.ref}`} onPress={() => router.push(`/trip/${j.id}` as any)} style={{ gap: space.sm }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Row gap={space.md} style={{ flex: 1 }}>
                  <IconTile icon="car-sport-outline" size={40} />
                  <View style={{ flex: 1 }}>
                    <Txt v="h3" style={{ fontFamily: fonts.bold }} numberOfLines={1}>{j.service_name}</Txt>
                    <Txt v="caption">#{j.ref}</Txt>
                  </View>
                </Row>
                <StatusBadge status={j.status} />
              </Row>
              <Row style={{ justifyContent: "space-between", backgroundColor: colors.tint, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm }}>
                <Txt v="caption" style={{ color: colors.onSurface, flex: 1 }} numberOfLines={1}>{fmtDate(j.date)} · {fmtTime(j.time)} · {j.pickup_area}</Txt>
                <Txt v="bodyBold" color={colors.successText}>{money(j.driver_payout)}</Txt>
              </Row>
            </Card>
          )}
        />
      )}
    </View>
  );
}
