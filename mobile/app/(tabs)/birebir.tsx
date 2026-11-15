import { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { TIER_LABEL } from "@cita/core";
import { Mascot } from "@/components/Mascot";
import { PurchaseSheet } from "@/components/PurchaseSheet";
import { Button, Card, Row, TestBadge } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { billingStatus, openManageSubscriptions, type BillingStatus } from "@/lib/billing";
import { supabase } from "@/lib/supabase";
import { colors, space, type } from "@/lib/theme";

type Session = { id: string; week_no: number; meeting_date: string; main_focus: string; coach_feedback: string };

export default function BireBir() {
  const { profile, tier, refresh } = useAuth();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [parentCode, setParentCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, ws] = await Promise.all([
      billingStatus().catch(() => null),
      supabase.from("weekly_sessions").select("id, week_no, meeting_date, main_focus, coach_feedback").order("meeting_date", { ascending: false }).limit(10),
    ]);
    setStatus(s);
    setSessions((ws.data as Session[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const done = async () => {
    await refresh();
    await load();
  };

  const makeParentCode = async () => {
    const { data, error } = await supabase.rpc("cita_create_parent_code");
    if (error) return Alert.alert("Çita", "Veli kodu yalnızca LGS öğrencileri için.");
    setParentCode(data as { code: string; expires_at: string });
  };

  const renewing = status?.subscriptions.find((s) => s.will_renew && ["trialing", "active", "grace"].includes(s.status));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space(4), paddingBottom: space(12) }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.orange} />}>
      <Row>
        <Mascot size={48} />
        <View style={{ flex: 1 }}>
          <Text style={type.h2}>Çita Bire Bir</Text>
          <Text style={type.small}>Aylık paket · haftalık canlı koç görüşmesi · görüşmeler arası takip · Çita+ dahil (günde 15 foto)</Text>
        </View>
      </Row>

      <Card style={{ marginTop: space(3) }}>
        <Text style={type.label}>Paketin</Text>
        <Text style={type.h2}>{TIER_LABEL[tier]}</Text>
        {status?.provider === "test" ? <TestBadge label="TEST MAĞAZASI" /> : null}
        {renewing ? (
          <Text style={type.small}>
            {renewing.is_trial ? "Deneme" : "Abonelik"} · yenilenir · {new Date(renewing.expires_at).toLocaleDateString("tr-TR")}
          </Text>
        ) : null}
        {status?.subscriptions.some((s) => s.status === "canceled" && Date.parse(s.expires_at) > Date.now()) ? (
          <Text style={type.small}>İptal edildi; erişim dönem sonuna kadar sürer.</Text>
        ) : null}
        <Button small kind="ghost" title="Aboneliği yönet / satın alımı geri yükle" onPress={() => openManageSubscriptions()} />
      </Card>

      {tier !== "bire_bir" ? (
        <PurchaseSheet product="cita_birebir_monthly" label={tier === "plus" ? "Bire Bir'e yükselt" : "Bire Bir'i satın al"} onDone={done} />
      ) : (
        <Card accent>
          <Text style={type.h3}>Koç ataması</Text>
          {profile?.coach_id ? (
            <Text style={type.body}>Koçun atandı. Program önerilerin önce koçunun onayına gider.</Text>
          ) : (
            <Text style={type.body}>
              Ekibimiz sana koç atıyor{status?.coachRequest?.status === "waiting" ? " (sıradasın)" : ""}. Atama olana kadar Çita+ özelliklerin açık.
            </Text>
          )}
        </Card>
      )}

      <Text style={[type.h2, { marginTop: space(4) }]}>Görüşmeler</Text>
      {sessions.length === 0 ? <Card><Text style={type.small}>Koçun paylaştığı haftalık görüşmeler burada görünür.</Text></Card> : null}
      {sessions.map((s) => (
        <Card key={s.id}>
          <Text style={type.h3}>{s.week_no}. hafta · {s.meeting_date}</Text>
          {s.main_focus ? <Text style={type.body}>Odak: {s.main_focus}</Text> : null}
          {s.coach_feedback ? <Text style={type.small}>{s.coach_feedback}</Text> : null}
        </Card>
      ))}

      {profile?.track === "LGS" ? (
        <Card style={{ marginTop: space(4) }}>
          <Text style={type.h3}>Veli erişimi</Text>
          <Text style={type.small}>Velin kendi cihazından bağlanır; haftalık plan tamamlama, çalışma süresi ve net trendini görür. Sohbetlerin ve soru fotoğrafların görünmez.</Text>
          {parentCode ? (
            <Pressable onPress={makeParentCode}>
              <Text style={[type.h1, { letterSpacing: 4, color: colors.orange, marginTop: space(2) }]}>{parentCode.code}</Text>
              <Text style={type.small}>24 saat geçerli, tek kullanımlık. Yenilemek için dokun.</Text>
            </Pressable>
          ) : (
            <Button small kind="secondary" title="Veli kodu oluştur" onPress={makeParentCode} />
          )}
        </Card>
      ) : null}
    </ScrollView>
  );
}
