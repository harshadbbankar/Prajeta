import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { fmtDate } from "@/src/hooks";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, Empty, Header, Loader, Row, StatusBadge, Txt, useToast } from "@/src/ui";

const ST = ["NEW", "CONTACTED", "QUOTED", "WON", "LOST"];

export default function Enquiries() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin-enq"], queryFn: () => api<any[]>("/admin/enquiries") });
  const set = async (id: string, status: string) => {
    try {
      await api(`/admin/enquiries/${id}`, { body: { status } });
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Enquiries & corporate" subtitle="Corporate, monthly, permanent & contact leads" />
      {q.isLoading ? <Loader /> : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}
          ListEmptyComponent={<Empty icon="business-outline" title="No enquiries yet" />}
          renderItem={({ item: e }) => (
            <Card testID={`enquiry-${e.ref}`} style={{ gap: 6 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt v="h3">{e.company || e.name}</Txt>
                <StatusBadge status={e.status} />
              </Row>
              <Txt v="caption">{e.ref} · {e.type} · {e.city_id || "—"} · {fmtDate(e.created_at)}{e.drivers_needed ? ` · ${e.drivers_needed} drivers` : ""}</Txt>
              {e.message ? <Txt v="body">{e.message}</Txt> : null}
              <Row style={{ flexWrap: "wrap" }}>
                {ST.map((s) => <Chip key={s} label={s} selected={e.status === s} onPress={() => set(e.id, s)} testID={`enquiry-${e.ref}-${s}`} />)}
              </Row>
              <Btn small variant="outline" icon="call" title={`Call ${e.phone}`} style={{ alignSelf: "flex-start" }} onPress={() => Linking.openURL(`tel:${e.phone}`)} testID={`enquiry-call-${e.ref}`} />
            </Card>
          )}
        />
      )}
    </View>
  );
}
