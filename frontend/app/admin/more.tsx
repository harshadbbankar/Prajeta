import { Ionicons } from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { can, useAuth } from "@/src/auth";
import { usesNativeTabs } from "@/src/navigation";
import { radius, space, useTheme } from "@/src/theme";
import { Btn, Txt } from "@/src/ui";

const ITEMS: [string, string, string, string, string][] = [
  ["analytics", "Owner intelligence", "KPIs, P&L, service & city profitability, insights", "/erp/owner", "owner"],
  ["calculator", "Pricing simulator", "Model price, payout & volume scenarios", "/erp/simulator", "owner"],
  ["checkbox", "Action plan", "Owner task register", "/erp/actions", "owner"],
  ["cash", "Finance", "Payments, refunds, expenses, driver payouts", "/erp/finance", "finance"],
  ["gift", "Referral leaderboard", "Top referring customers — thank & reward them", "/erp/referrals", "finance"],
  ["pricetags", "Tariffs & cities", "Service pricing, service areas", "/erp/tariffs", "admin"],
  ["chatbubbles", "Support tickets", "Customer & driver tickets, incidents", "/erp/tickets", "support"],
  ["business", "Enquiries & corporate", "Corporate, monthly & permanent leads", "/erp/enquiries", "support"],
  ["person", "Customers", "Profiles, history, restrictions", "/erp/customers", "support"],
  ["settings", "Settings & audit", "Company details, WhatsApp, policies, audit log", "/erp/settings", "admin"],
  ["people-circle", "Staff & access", "Add ops, finance, verification & support staff", "/erp/staff", "admin"],
  ["id-card", "Document expiry", "Licence, ID & police papers expiring or paused", "/erp/licences", "licences"],
  ["alert-circle", "SOS alerts", "Safety alerts raised during live trips", "/erp/sos", "dispatch"],
  ["map", "Live driver map", "Where every online driver is — find the nearest", "/erp/live-map", "dispatch"],
  ["star", "Driver ratings", "Top-rated drivers, customer reviews & low-rating alerts", "/erp/ratings", "drivers"],
  ["trophy", "Staff performance", "Tickets, approvals & dispatch times per staff", "/erp/performance", "admin"],
];

export default function More() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Txt v="title">ERP modules</Txt>
        <Txt v="caption">{user?.name} · {user?.role}</Txt>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + space.xl }}>
        {ITEMS.filter((i) => can(user?.role, i[4])).map(([icon, title, sub, href]) => (
          <Pressable key={href} testID={`more-${href.split("/").pop()}`} onPress={() => router.push(href as any)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: pressed ? colors.surfaceTertiary : colors.surfaceSecondary })}>
            <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={icon as any} size={20} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="bodyBold">{title}</Txt>
              <Txt v="caption">{sub}</Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}
        <Btn variant="outline" title="Log out" icon="log-out" style={{ marginTop: space.lg }} testID="admin-logout-button" onPress={async () => { await signOut(); router.replace("/"); }} />
      </ScrollView>
    </View>
  );
}
