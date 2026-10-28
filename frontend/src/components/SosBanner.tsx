import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback } from "react";
import { Pressable, View } from "react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { usePolling } from "@/src/hooks";
import { radius, space, useTheme } from "@/src/theme";
import { Txt } from "@/src/ui";

const SOS_ROLES = ["owner", "super_admin", "ops", "support"];

/** ERP dashboard banner: active SOS alerts, refreshed every 15 seconds. */
export function SosBanner() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const allowed = !!user && SOS_ROLES.includes(user.role);
  const q = useQuery({ queryKey: ["admin-sos", "active"], queryFn: () => api<any>("/admin/sos?status=active"), enabled: allowed });
  const poll = useCallback(() => q.refetch(), [q]);
  usePolling(poll, 15000, allowed);
  if (!allowed || !q.data?.active) return null;
  const top = q.data.items[0];
  return (
    <Pressable testID="sos-banner" onPress={() => router.push("/erp/sos" as any)} style={{ backgroundColor: colors.error, borderRadius: radius.md, padding: space.md, flexDirection: "row", alignItems: "center", gap: space.md }}>
      <Ionicons name="alert-circle" size={28} color={colors.onError} />
      <View style={{ flex: 1 }}>
        <Txt v="h3" color={colors.onError}>{q.data.active} active SOS alert{q.data.active > 1 ? "s" : ""}</Txt>
        <Txt v="caption" color={colors.onError}>
          {top.ref} · raised by {top.raised_by_role} · {top.status === "OPEN" ? "not yet acknowledged" : `handled by ${top.acknowledged_by}`}
        </Txt>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.onError} />
    </Pressable>
  );
}
