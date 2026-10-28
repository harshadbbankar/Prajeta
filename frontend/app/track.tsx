import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api } from "@/src/api";
import { fmtTime } from "@/src/hooks";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Field, Header, KV, StatusBadge, Txt } from "@/src/ui";

export default function Track() {
  const { colors } = useTheme();
  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setErr("");
    setRes(null);
    setBusy(true);
    try {
      setRes(await api(`/public/track/${encodeURIComponent(ref.trim())}?phone=${phone}`));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Track booking" />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Field label="Booking reference" placeholder="PRJ-XXXXXXXX" autoCapitalize="characters" value={ref} onChangeText={setRef} testID="track-ref-input" />
        <Field label="Mobile number" placeholder="10-digit mobile" keyboardType="phone-pad" maxLength={10} value={phone} onChangeText={setPhone} testID="track-phone-input" />
        {err ? <Txt v="bodyBold" color={colors.error} testID="track-error">{err}</Txt> : null}
        <Btn title="Track" icon="search" loading={busy} onPress={go} testID="track-submit-button" />
        {res ? (
          <Card testID="track-result" style={{ gap: space.sm }}>
            <Txt v="h3">{res.ref}</Txt>
            <StatusBadge status={res.status} />
            <KV k="Service" v={res.service_name} />
            <KV k="When" v={`${res.date} · ${fmtTime(res.time)}`} />
            <KV k="Payment" v={<StatusBadge status={res.payment_status} />} />
            <Txt v="caption">Log in to see driver details and manage your booking.</Txt>
          </Card>
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}
