import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Field, KV, Row, Txt, money } from "@/src/ui";

const RETAINER_PER_DRIVER = 2700000; // paise/month — indicative Prajeta retainer (final price quoted on enquiry)
const BENEFITS = 0.2; // PF, ESI, bonus, gratuity provision
const LEAVE_COVER_DAYS = 4; // relief driver days per month
const ADMIN = 0.08; // HR, payroll, compliance overhead

/** Website: in-house driver vs Prajeta corporate retainer cost comparison. */
export function RetainerCalculator() {
  const { colors } = useTheme();
  const [salary, setSalary] = useState("25000");
  const [count, setCount] = useState("2");
  const s = Math.max(0, Number(salary) || 0) * 100;
  const n = Math.max(1, Math.min(200, Math.round(Number(count) || 1)));
  const leave = Math.round((s / 26) * LEAVE_COVER_DAYS);
  const inHouse = Math.round(s * (1 + BENEFITS) + leave + s * ADMIN) * n;
  const retainer = RETAINER_PER_DRIVER * n;
  const gstItc = Math.round(retainer * 0.18);
  const saving = inHouse - retainer;
  return (
    <Card testID="retainer-calculator" style={{ gap: space.md }}>
      <Txt v="h3">In-house driver vs Prajeta retainer</Txt>
      <Txt v="caption">Monthly estimate. Retainer includes a replacement driver within 2 hours, verified chauffeurs and one GST invoice.</Txt>
      <Row>
        <View style={{ flex: 1 }}>
          <Field label="Driver salary ₹/month" keyboardType="number-pad" value={salary} onChangeText={(t) => setSalary(t.replace(/\D/g, ""))} testID="retainer-salary-input" />
        </View>
        <View style={{ width: 110 }}>
          <Field label="Drivers" keyboardType="number-pad" value={count} onChangeText={(t) => setCount(t.replace(/\D/g, ""))} testID="retainer-count-input" />
        </View>
      </Row>
      <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: space.md, gap: 2 }}>
        <KV k={`In-house cost (salary + ${BENEFITS * 100}% benefits + leave cover + admin)`} v={money(inHouse)} testID="retainer-inhouse" />
        <KV k="Prajeta retainer (before GST)" v={money(retainer)} testID="retainer-prajeta" />
        <KV k="GST input tax credit you can claim (18%)" v={money(gstItc)} testID="retainer-itc" />
        <KV bold k={saving >= 0 ? "Estimated monthly saving" : "Extra for managed service"} v={money(Math.abs(saving))} testID="retainer-saving" />
      </View>
      <Txt v="caption">Indicative only — your final retainer depends on city, hours and vehicle type.</Txt>
      <Btn title="Request corporate proposal" onPress={() => router.push(`/enquiry?type=corporate`)} testID="retainer-enquiry-button" />
    </Card>
  );
}
