import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { space, useTheme } from "@/src/theme";
import { Card, Empty, Header, Loader, Txt } from "@/src/ui";

export default function Notifications() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api<any>("/notifications") });
  useEffect(() => {
    api("/notifications/read", { body: {} }).catch(() => {});
  }, []);
  const open = (n: any) => {
    if (!n.booking_id) return;
    if (user?.role === "driver") router.push(`/trip/${n.booking_id}` as any);
    else if (["customer", "corporate"].includes(user?.role ?? "")) router.push(`/booking/${n.booking_id}` as any);
    else router.push(`/erp/booking/${n.booking_id}` as any);
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Notifications" />
      {q.isLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={q.data?.items ?? []}
          keyExtractor={(n) => n.id}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: insets.bottom + space.xl }}
          ListEmptyComponent={<Empty icon="notifications-outline" title="You're all caught up" />}
          renderItem={({ item: n }) => (
            <Card testID={`notification-${n.id}`} onPress={() => open(n)} style={{ gap: 4, borderLeftWidth: n.read ? 1 : 4, borderLeftColor: n.read ? colors.border : colors.brandPrimary }}>
              <Txt v="bodyBold">{n.title}</Txt>
              <Txt v="body" color={colors.muted}>{n.body}</Txt>
              <Txt v="caption">{new Date(n.created_at).toLocaleString("en-IN")}</Txt>
            </Card>
          )}
        />
      )}
    </View>
  );
}
