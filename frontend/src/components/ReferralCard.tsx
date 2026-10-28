import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { Share, View } from "react-native";

import { api } from "@/src/api";
import { radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Row, Txt, money } from "@/src/ui";
import { openWhatsApp } from "@/src/whatsapp";

/** Customer: their referral code, share buttons and reward status. */
export function ReferralCard({ compact }: { compact?: boolean }) {
  const { colors } = useTheme();
  const q = useQuery({ queryKey: ["referral"], queryFn: () => api<any>("/me/referral") });
  const r = q.data;
  if (!r) return null;
  const msg = `Book a verified driver for your own car with Prajeta! Use my code ${r.code} for ${money(r.friend_amount)} off your first booking.`;
  return (
    <Card testID="referral-card" style={{ gap: space.sm, borderColor: colors.success, borderWidth: 1.5 }}>
      <Row>
        <Ionicons name="gift" size={20} color={colors.success} />
        <Txt v="h3" style={{ flex: 1 }}>Give {money(r.friend_amount)}, get {money(r.referrer_amount)}</Txt>
      </Row>
      <Txt v="caption">Friends save {money(r.friend_amount)} on their first booking. You get {money(r.referrer_amount)} off your next booking once their trip is completed.</Txt>
      <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: space.md, alignItems: "center" }}>
        <Txt v="caption">Your code</Txt>
        <Txt v="numLg" color={colors.brandPrimary} testID="referral-code">{r.code}</Txt>
      </View>
      <Row>
        <Btn style={{ flex: 1 }} small variant="success" icon="logo-whatsapp" title="Share" onPress={() => openWhatsApp(msg)} testID="referral-share-whatsapp" />
        <Btn style={{ flex: 1 }} small variant="outline" icon="share-social" title="More" onPress={() => Share.share({ message: msg })} testID="referral-share-other" />
      </Row>
      {!compact ? (
        <Row style={{ justifyContent: "space-between" }}>
          <Txt v="caption" testID="referral-stats">{r.friends_joined} friend(s) booked · {r.friends_completed} rewarded</Txt>
          <Txt v="bodyBold" color={colors.success} testID="referral-credit">Credit {money(r.credit)}</Txt>
        </Row>
      ) : r.credit ? (
        <Txt v="bodyBold" color={colors.success} testID="referral-credit">{money(r.credit)} credit applies automatically on your next booking</Txt>
      ) : null}
    </Card>
  );
}
