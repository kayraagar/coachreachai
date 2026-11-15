/**
 * Çita+ tanıtımı: önce öğrencinin KENDİ verisinden gerçek bir analiz örneği,
 * sonra isteğe bağlı 14 günlük deneme. Veri yetersizse kişisel bulgu yok.
 */
import { useCallback, useEffect, useState } from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import type { AnalysisPreview } from "@cita/core";
import { Mascot } from "@/components/Mascot";
import { PurchaseSheet } from "@/components/PurchaseSheet";
import { Button, Card, H1, H2, Loading, P, Row, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { billingStatus, type BillingStatus } from "@/lib/billing";
import { colors, type } from "@/lib/theme";

export default function Plus() {
  const { refresh } = useAuth();
  const [preview, setPreview] = useState<AnalysisPreview | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([api<{ preview: AnalysisPreview }>("/api/cita/analysis-preview"), billingStatus()]);
    setPreview(p.preview);
    setStatus(s);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!preview || !status) return <Loading />;
  const done = async () => {
    await refresh();
    await load();
    router.back();
  };

  return (
    <Screen>
      <Row>
        <Mascot size={52} mood="focus" />
        <H1>Çita+</H1>
      </Row>
      <P muted>Kişisel yanlış defteri, tekrarlayan hata analizi, kişisel tekrar oturumları ve günde 15 soru fotoğrafı.</P>

      <H2>Senin verinden bir örnek</H2>
      <Card accent={preview.kind !== "insufficient"}>
        <Text style={type.h3}>{preview.title}</Text>
        <Text style={type.body}>{preview.body}</Text>
        {preview.evidence.length ? <Text style={[type.small, { marginTop: 6 }]}>Dayanak: {preview.evidence.length} kayıt</Text> : null}
      </Card>

      {status.tier !== "free" ? (
        <Card>
          <Text style={[type.body, { color: colors.success }]}>Çita+ özelliklerin açık.</Text>
        </Card>
      ) : status.trialEligible ? (
        <PurchaseSheet product="cita_plus_monthly" trial label="14 gün ücretsiz dene" onDone={done} />
      ) : (
        <PurchaseSheet product="cita_plus_monthly" label="Çita+'ya geç" onDone={done} />
      )}
      <Button kind="ghost" title="Şimdilik ücretsiz devam et" onPress={() => router.back()} />
      <P muted>Ücretsiz özellikler (program, sohbet, deneme takibi, hedef, seri, rozetler, günde 3 foto) her zaman açık.</P>
    </Screen>
  );
}
