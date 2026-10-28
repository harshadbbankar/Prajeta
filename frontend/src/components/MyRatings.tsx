import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";

import { api } from "@/src/api";
import { space, useTheme } from "@/src/theme";
import { Card, HBar, Row, Txt } from "@/src/ui";

/** Driver's own ratings summary and recent customer reviews. */
export function MyRatings() {
  const { colors } = useTheme();
  const q = useQuery({ queryKey: ["driver-reviews"], queryFn: () => api<any>("/driver/reviews") });
  const d = q.data;
  if (!d) return null;
  return (
    <Card testID="driver-ratings-card" style={{ gap: space.md }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt v="h3">My ratings</Txt>
        <Txt v="num" color={colors.brandPrimary} testID="driver-rating-average">{d.average ? `★ ${d.average}` : "New"}</Txt>
      </Row>
      <Txt v="caption">{d.count} customer review{d.count === 1 ? "" : "s"}</Txt>
      {d.count ? (
        <View style={{ gap: 4 }}>
          {[5, 4, 3, 2, 1].map((n) => (
            <HBar key={n} label={`${n}★`} value={d.distribution[String(n)]} max={d.count} right={String(d.distribution[String(n)])} color={!d.distribution[String(n)] ? colors.surfaceSecondary : n >= 4 ? colors.success : n === 3 ? colors.warning : colors.error} />
          ))}
        </View>
      ) : null}
      {d.top_tags.length ? <Txt v="caption">Customers say: {d.top_tags.map(([t]: any) => t).join(" · ")}</Txt> : null}
      {d.recent.filter((r: any) => r.comment).slice(0, 3).map((r: any, i: number) => (
        <View key={i} style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: space.md, gap: 2 }}>
          <Txt v="bodyBold">{"★".repeat(r.rating)}</Txt>
          <Txt v="caption">{r.comment}</Txt>
        </View>
      ))}
    </Card>
  );
}
