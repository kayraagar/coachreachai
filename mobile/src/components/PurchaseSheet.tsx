import { useState } from "react";
import { Alert, Text } from "react-native";
import { confirmPurchase, createIntent, openManageSubscriptions, StoreNotConfigured, type Intent, type ProductId } from "@/lib/billing";
import { ApiError } from "@/lib/api";
import { colors, space, type } from "@/lib/theme";
import { Button, Card, TestBadge } from "./ui";

/**
 * İki adımlı satın alma: önce ücret/yenileme/iptal koşulları gösterilir,
 * öğrenci (ya da veli) açıkça onaylar; sonra mağaza akışı başlar.
 */
export function PurchaseSheet({
  product, trial = false, studentId, label, onDone,
}: { product: ProductId; trial?: boolean; studentId?: string; label: string; onDone: () => void }) {
  const [intent, setIntent] = useState<Intent | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      setIntent(await createIntent(product, { trial, studentId }));
    } catch (e) {
      Alert.alert("Çita", e instanceof ApiError ? e.message : "Satın alma başlatılamadı.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!intent) return;
    setBusy(true);
    try {
      const r = await confirmPurchase(intent, trial);
      if (!r.result.ok) Alert.alert("Çita", r.result.code === "trial_not_eligible" ? "Deneme süresi bu hesapta kullanılmış." : "Bu paket zaten aktif.");
      onDone();
    } catch (e) {
      Alert.alert("Çita", e instanceof StoreNotConfigured || e instanceof ApiError ? e.message : "Satın alma tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  if (!intent) return <Button title={label} loading={busy} onPress={start} />;
  return (
    <Card accent>
      {intent.provider === "test" ? <TestBadge label="TEST MAĞAZASI — GERÇEK ÖDEME YOK" /> : null}
      <Text style={type.h3}>Onaydan önce</Text>
      {intent.displayPrice ? <Text style={[type.body, { color: colors.orangeSoft, fontWeight: "800" }]}>{intent.displayPrice}</Text> : null}
      {intent.terms.map((t, i) => (
        <Text key={i} style={[type.small, { marginTop: space(1) }]}>• {t}</Text>
      ))}
      <Button title={trial ? "Denemeyi başlat" : "Onayla ve satın al"} loading={busy} onPress={confirm} />
      <Button small kind="ghost" title="Vazgeç" onPress={() => setIntent(null)} />
      <Button small kind="ghost" title="Aboneliği yönet / geri yükle" onPress={() => openManageSubscriptions(intent)} />
    </Card>
  );
}
