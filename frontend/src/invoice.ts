import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { api, authedUrl } from "@/src/api";

/** Web: open printable receipt (Save as PDF). Native: render a PDF and open the share/save sheet. */
export async function downloadInvoice(bookingId: string, ref: string) {
  if (Platform.OS === "web") {
    await WebBrowser.openBrowserAsync(await authedUrl(`/invoices/${bookingId}`));
    return;
  }
  const html = await api<string>(`/invoices/${bookingId}`);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: `Prajeta receipt ${ref}` });
  } else {
    await Print.printAsync({ uri });
  }
}
