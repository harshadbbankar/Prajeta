import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, ChipRow, Empty, Field, Header, Loader, Row, Sheet, Txt, useToast } from "@/src/ui";

const STATUSES = ["Suggested", "Under Review", "Approved", "In Progress", "Completed", "Rejected", "On Hold"];

export default function Actions() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const q = useQuery({ queryKey: ["actions"], queryFn: () => api<any[]>("/admin/owner/actions") });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ finding: "", action: "", priority: "Medium", assigned_to: "", target_date: "", success_metric: "" });
  const update = async (id: string, status: string) => {
    try {
      await api(`/admin/owner/actions/${id}`, { method: "PUT", body: { status } });
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    }
  };
  const add = async () => {
    try {
      await api("/admin/owner/actions", { body: f });
      setOpen(false);
      q.refetch();
      toast("Action added");
    } catch (e: any) {
      toast(e.message, "err");
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Action plan" subtitle="Owner task register" right={<Btn small title="Add" icon="add" onPress={() => setOpen(true)} testID="add-action-button" />} />
      {q.isLoading ? <Loader /> : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}
          ListEmptyComponent={<Empty icon="checkbox-outline" title="No actions yet" body="Add from Owner intelligence → Insights." />}
          renderItem={({ item: a }) => (
            <Card testID={`action-${a.code}`} style={{ gap: 4, paddingHorizontal: 0 }}>
              <View style={{ paddingHorizontal: space.lg, gap: 4 }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Txt v="caption">{a.code} · {a.priority} priority</Txt>
                  <Txt v="bodyBold" color={colors.brandPrimary}>{a.status}</Txt>
                </Row>
                <Txt v="h3">{a.action}</Txt>
                <Txt v="caption">Finding: {a.finding}</Txt>
                <Txt v="caption">Owner: {a.assigned_to || "—"} · Target: {a.target_date || "—"} · Metric: {a.success_metric || "—"}</Txt>
              </View>
              <ChipRow>
                {STATUSES.map((s) => <Chip key={s} label={s} selected={a.status === s} onPress={() => update(a.id, s)} testID={`action-${a.code}-status-${s.replace(/ /g, "-")}`} />)}
              </ChipRow>
            </Card>
          )}
        />
      )}
      <Sheet visible={open} onClose={() => setOpen(false)} title="New action" testID="add-action-sheet">
        <View style={{ gap: space.md }}>
          <Field label="Finding" value={f.finding} onChangeText={(v) => setF({ ...f, finding: v })} testID="action-finding-input" />
          <Field label="Recommended action" value={f.action} onChangeText={(v) => setF({ ...f, action: v })} testID="action-action-input" />
          <Row>{["High", "Medium", "Low"].map((p) => <Chip key={p} label={p} selected={f.priority === p} onPress={() => setF({ ...f, priority: p })} testID={`action-priority-${p}`} />)}</Row>
          <Field label="Assigned to" value={f.assigned_to} onChangeText={(v) => setF({ ...f, assigned_to: v })} testID="action-assignee-input" />
          <Field label="Target date (YYYY-MM-DD)" value={f.target_date} onChangeText={(v) => setF({ ...f, target_date: v })} testID="action-date-input" />
          <Field label="Success metric" value={f.success_metric} onChangeText={(v) => setF({ ...f, success_metric: v })} testID="action-metric-input" />
          <Btn title="Save" disabled={!f.finding || !f.action} onPress={add} testID="action-save-button" />
        </View>
      </Sheet>
    </View>
  );
}
