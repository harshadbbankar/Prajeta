import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useState } from "react";
import { View } from "react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Field, Row, Txt, useToast } from "@/src/ui";

/** For Google sign-ins without a mobile number: verify one with an OTP. */
export function AddPhone() {
  const { user, refresh } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  if (!user || user.phone) return null;

  const send = async () => {
    setBusy(true);
    try {
      const r = await api<any>("/auth/otp/send", { body: { phone } });
      setDevCode(r.dev_code ?? "");
      setStep("code");
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    try {
      await api("/auth/phone/verify", { body: { phone, code } });
      await refresh();
      toast("Mobile number added");
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card testID="add-phone-card" style={{ gap: space.sm, borderColor: colors.warning, borderWidth: 1.5 }}>
      <Row>
        <Ionicons name="call" size={20} color={colors.warning} />
        <Txt v="h3" style={{ flex: 1 }}>Add your mobile number</Txt>
      </Row>
      <Txt v="caption">
        {user.role === "driver" ? "Needed before you submit your driver application, so customers and our team can reach you." : "Needed before booking, so your driver and our safety team can reach you."}
      </Txt>
      {step === "phone" ? (
        <>
          <Row>
            <View style={{ height: 50, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, justifyContent: "center" }}>
              <Txt v="bodyBold">+91</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Field placeholder="98765 43210" keyboardType="phone-pad" maxLength={10} value={phone} onChangeText={(t) => setPhone(t.replace(/\D/g, ""))} testID="add-phone-input" />
            </View>
          </Row>
          <Btn title="Send code" icon="logo-whatsapp" disabled={phone.length !== 10} loading={busy} onPress={send} testID="add-phone-send" />
        </>
      ) : (
        <>
          {devCode ? <Txt v="caption" testID="add-phone-preview-code">Preview mode — your code is {devCode}</Txt> : <Txt v="caption">Enter the code sent to +91 {phone}.</Txt>}
          <Field placeholder="••••••" keyboardType="number-pad" maxLength={6} value={code} onChangeText={(t) => setCode(t.replace(/\D/g, ""))} testID="add-phone-code" />
          <Row>
            <Btn style={{ flex: 1 }} variant="ghost" title="Change number" onPress={() => setStep("phone")} testID="add-phone-change" />
            <Btn style={{ flex: 1 }} title="Verify" disabled={code.length < 4} loading={busy} onPress={verify} testID="add-phone-verify" />
          </Row>
        </>
      )}
    </Card>
  );
}
