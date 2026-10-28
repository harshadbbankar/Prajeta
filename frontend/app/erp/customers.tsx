import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { space, useTheme } from "@/src/theme";
import { Card, Empty, Field, Header, Loader, Row, Txt, useToast } from "@/src/ui";

export default function Customers() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["admin-cust", search], queryFn: () => api<any[]>(`/admin/customers?q=${encodeURIComponent(search)}`) });
  const restrict = async (u: any) => {
    try {
      await api(`/admin/customers/${u.id}/restrict`, { body: { restricted: !u.restricted, reason: "Set from ERP" } });
      toast(u.restricted ? "Restriction removed" : "Account restricted");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Customers" />
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <Field placeholder="Search name or phone" value={search} onChangeText={setSearch} testID="admin-customers-search" />
      </View>
      {q.isLoading ? <Loader /> : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: insets.bottom + space.xl }}
          ListEmptyComponent={<Empty icon="person-outline" title="No customers found" />}
          renderItem={({ item: u }) => (
            <Card testID={`customer-${u.phone}`} style={{ padding: space.md }}>
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Txt v="bodyBold">{u.name || "—"}</Txt>
                  <Txt v="caption">{u.phone} · {u.bookings} bookings · {u.source ?? "app"}</Txt>
                </View>
                <View style={{ alignItems: "center" }}>
                  <Switch value={!!u.restricted} onValueChange={() => restrict(u)} testID={`restrict-${u.phone}`} />
                  <Txt v="caption">Restricted</Txt>
                </View>
              </Row>
            </Card>
          )}
        />
      )}
    </View>
  );
}
