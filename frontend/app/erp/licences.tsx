import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { fmtDate } from "@/src/hooks";
import { space, useTheme } from "@/src/theme";
import { Card, Empty, ErrorView, Header, Loader, Row, Txt } from "@/src/ui";

const DOC_NAMES: Record<string, string> = { licence: "Driving licence", identity: "Identity proof", police_verification: "Police verification", address_proof: "Address proof" };

export default function Licences() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ["licences"], queryFn: () => api<any[]>("/admin/licences") });
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Document expiry" subtitle="Licence, ID & police papers · reminders at 30/15/7/1 days" />
      {q.isLoading ? <Loader /> : q.error ? <ErrorView message={(q.error as any).message} /> : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(d) => d.user_id + d.doc_type}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: insets.bottom + space.xl }}
          ListEmptyComponent={<Empty icon="id-card-outline" title="No documents expiring in the next 60 days" />}
          renderItem={({ item: d }) => {
            const tone = d.days_left < 0 ? colors.error : d.days_left <= 15 ? colors.warning : colors.info;
            return (
              <Card testID={`licence-${d.phone}-${d.doc_type}`} onPress={() => router.push(`/erp/driver/${d.user_id}` as any)} style={{ padding: space.md, gap: 4, borderLeftWidth: 4, borderLeftColor: tone }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Txt v="bodyBold" style={{ flex: 1 }}>{d.name || d.phone}</Txt>
                  <Txt v="bodyBold" color={tone} testID={`licence-days-${d.phone}-${d.doc_type}`}>
                    {d.days_left < 0 ? `Expired ${-d.days_left}d ago` : `${d.days_left} days left`}
                  </Txt>
                </Row>
                <Txt v="label">{DOC_NAMES[d.doc_type] ?? d.doc_type}</Txt>
                <Txt v="caption">{d.phone} · {d.city_id} · expires {fmtDate(d.licence_expiry)}{d.paused ? " · Paused from jobs" : ""}</Txt>
                {d.doc_type !== "licence" ? (d.renewal_uploaded ? <Txt v="caption" color={colors.success}>New copy uploaded — open to verify and unpause</Txt> : null) : d.renewal_uploaded ? <Txt v="caption" color={colors.success}>Renewed licence uploaded (exp {d.renewal_expiry}) — open to verify</Txt> : <Txt v="caption">Waiting for driver to upload renewal</Txt>}
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}
