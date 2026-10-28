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
      {d.badge ? (
        <View testID="my-badge" style={{ backgroundColor: colors.warningSoft, borderRadius: 12, padding: space.md, gap: 2 }}>
          <Txt v="bodyBold">{d.badge === "gold" ? "🏆" : "🎖️"} {d.badge_label}</Txt>
          <Txt v="caption">You get new booking offers {d.priority_minutes} min before other drivers.</Txt>
        </View>
      ) : null}
      {d.next_badge ? (
        <View testID="next-badge" style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: space.md, gap: 2 }}>
          <Txt v="bodyBold">Next: {d.next_badge.label}</Txt>
          <Txt v="caption">
            Keep an average of ★ {d.next_badge.min_rating}+{d.next_badge.reviews_needed ? ` and get ${d.next_badge.reviews_needed} more review(s)` : ""}
            {d.next_badge.rating_ok && !d.next_badge.reviews_needed ? "" : ` (now ★ ${d.average ?? "—"})`}
            {d.badge ? ` to become ${d.next_badge.label}.` : " to unlock priority offers."}
          </Txt>
        </View>
      ) : null}
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
