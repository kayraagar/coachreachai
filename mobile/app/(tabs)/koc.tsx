/**
 * Koç sekmesi: maskotla sohbet, bugünün görevleri, kaynak ve program
 * değişikliği kartları, fotoğraftan soru (kalan hak görünür).
 * Her mesaj/fotoğraf sabit bir anahtarla gider; ağ hatasında aynı anahtarla
 * tekrar denenir → çift mesaj ya da çift hak düşümü olmaz.
 */
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { randomUUID } from "expo-crypto";
import { istanbulDate } from "@cita/core";
import { Mascot } from "@/components/Mascot";
import { ProposalCard } from "@/components/ProposalCard";
import { PhotoCard, type PhotoRequestView } from "@/components/PhotoCard";
import { Card, Chip, Row, TestBadge } from "@/components/ui";
import { api, apiUpload, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { thisWeek, useWeek } from "@/lib/data";
import { colors, radius, space, type } from "@/lib/theme";

type ResourceItem = { title: string; url: string | null; type?: string; level?: string; sourceName?: string; lastChecked?: string };
type MsgCard =
  | { type: "proposal"; proposalId: string }
  | { type: "resources"; source: "catalog" | "web"; provider: string; items: ResourceItem[] };
type Msg = { id: string; role: "user" | "assistant"; content: string; card: MsgCard | null; provider: string | null; pending?: boolean; failed?: boolean };
type Quota = { day: string; limit: number; used: number; tier: string };
type Item = { kind: "msg"; msg: Msg } | { kind: "photo"; request: PhotoRequestView };

const SUGGESTIONS = ["Bugün 30 dakikam var", "Neye çalışayım?", "Matematik için kaynak öner", "Cumartesi çalışamam"];

function hostOf(url: string | null) {
  if (!url) return "";
  const m = url.match(/^https?:\/\/([^/]+)/);
  return m ? m[1] : "";
}

function ResourcesCard({ card }: { card: Extract<MsgCard, { type: "resources" }> }) {
  return (
    <Card>
      {card.provider === "test" ? <TestBadge /> : null}
      <Text style={type.label}>{card.source === "catalog" ? "Ekibin onayladığı kaynaklar" : "Web araması sonuçları (katalogda uygun kaynak yok)"}</Text>
      {card.items.map((r, i) => (
        <Pressable key={i} onPress={() => r.url && Linking.openURL(r.url)} style={{ paddingVertical: space(1.5) }}>
          <Text style={[type.body, { color: r.url ? colors.orangeSoft : colors.text }]}>{r.title}</Text>
          <Text style={type.small}>
            {[r.type, r.level, r.sourceName, r.lastChecked ? `son kontrol ${r.lastChecked}` : null, card.source === "web" ? `web: ${hostOf(r.url)}` : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </Pressable>
      ))}
    </Card>
  );
}

export default function Koc() {
  const { profile, tier } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [quota, setQuota] = useState<Quota | null>(null);
  const pendingPhotoKey = useRef<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const week = useWeek(thisWeek());
  const today = istanbulDate();
  const todays = week.items.filter((i) => i.plan_date === today);

  const loadQuota = useCallback(async () => {
    try {
      const r = await api<{ quota: Quota }>("/api/cita/photo");
      setQuota(r.quota);
    } catch {
      /* gösterim amaçlı */
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ messages: Msg[] }>("/api/cita/chat");
        setItems(r.messages.map((m) => ({ kind: "msg", msg: m })));
      } catch {
        /* boş sohbet */
      } finally {
        setLoading(false);
      }
    })();
    void loadQuota();
  }, [loadQuota]);

  const toEnd = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);

  const send = async (raw: string, clientId = randomUUID()) => {
    const t = raw.trim();
    if (!t) return;
    setText("");
    setSending(true);
    setItems((prev) => [
      ...prev.filter((p) => !(p.kind === "msg" && p.msg.id === clientId)),
      { kind: "msg", msg: { id: clientId, role: "user", content: t, card: null, provider: null, pending: true } },
    ]);
    toEnd();
    try {
      const r = await api<{ userMessageId: string; reply: Msg }>("/api/cita/chat", { body: { clientId, text: t } });
      setItems((prev) => [
        ...prev.map((p) => (p.kind === "msg" && p.msg.id === clientId ? { kind: "msg" as const, msg: { ...p.msg, pending: false } } : p)),
        { kind: "msg", msg: r.reply },
      ]);
      void week.reload();
    } catch (e) {
      setItems((prev) => prev.map((p) => (p.kind === "msg" && p.msg.id === clientId ? { kind: "msg" as const, msg: { ...p.msg, pending: false, failed: true } } : p)));
      if (e instanceof ApiError && e.status !== 0) Alert.alert("Çita", e.message);
    } finally {
      setSending(false);
      toEnd();
    }
  };

  const photo = async (camera: boolean) => {
    if (quota && quota.used >= quota.limit) {
      Alert.alert("Çita", "Bugünkü soru fotoğrafı hakkın doldu. Haklar gece yarısı (İstanbul) yenilenir.");
      return;
    }
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Çita", "İzin vermeden fotoğraf gönderemezsin. Ayarlardan açabilirsin.");
    const res = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    const small = await manipulateAsync(res.assets[0].uri, [{ resize: { width: 1600 } }], { compress: 0.75, format: SaveFormat.JPEG });
    const key = pendingPhotoKey.current ?? randomUUID();
    pendingPhotoKey.current = key;
    setSending(true);
    try {
      const form = new FormData();
      form.append("image", { uri: small.uri, name: "soru.jpg", type: "image/jpeg" } as unknown as Blob);
      const r = await apiUpload<{ request: PhotoRequestView; quota: Quota }>("/api/cita/photo", form, key);
      pendingPhotoKey.current = null;
      setQuota(r.quota);
      setItems((prev) => [...prev, { kind: "photo", request: r.request }]);
      toEnd();
    } catch (e) {
      if (e instanceof ApiError && e.code === "limit") void loadQuota();
      // 4xx (işleniyor hariç) kalıcıdır → yeni fotoğraf yeni anahtar alır. Ağ/5xx: aynı anahtarla tekrar denenir.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.code !== "processing") pendingPhotoKey.current = null;
      Alert.alert("Çita", e instanceof ApiError ? e.message : "Fotoğraf gönderilemedi. Tekrar denersen hakkın iki kez düşmez.");
    } finally {
      setSending(false);
    }
  };

  const remaining = quota ? Math.max(0, quota.limit - quota.used) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: space(4), paddingBottom: space(6) }}>
        <Row style={{ marginBottom: space(3) }}>
          <Mascot size={44} mood={todays.length && todays.every((t) => t.completed) ? "happy" : "normal"} />
          <View style={{ flex: 1 }}>
            <Text style={type.h2}>Selam{profile?.full_name ? ` ${profile.full_name.split(" ")[0]}` : ""}!</Text>
            <Text style={type.small}>
              Bugün {todays.filter((t) => !t.completed).length} görev kaldı · {remaining === null || !quota ? "…" : `${remaining}/${quota.limit}`} foto hakkı
            </Text>
          </View>
        </Row>

        {todays.length ? (
          <Card>
            <Text style={type.label}>Bugünün görevleri</Text>
            {todays.map((t) => (
              <Text key={t.id} style={[type.body, t.completed && { color: colors.muted, textDecorationLine: "line-through" }]}>
                {t.completed ? "✓" : "•"} {t.title}
                {t.planned_minutes ? ` · ${t.planned_minutes} dk` : ""}
              </Text>
            ))}
            <Pressable onPress={() => router.push("/program")}>
              <Text style={{ color: colors.orangeSoft, fontWeight: "700", marginTop: space(1) }}>Programa git ›</Text>
            </Pressable>
          </Card>
        ) : null}

        {loading ? <ActivityIndicator color={colors.orange} /> : null}
        {items.map((it, i) =>
          it.kind === "photo" ? (
            <PhotoCard key={`p${i}`} request={it.request} tier={tier} onUpsell={() => router.push("/plus")} />
          ) : it.msg.role === "user" ? (
            <Pressable
              key={it.msg.id}
              onPress={() => it.msg.failed && send(it.msg.content, it.msg.id)}
              style={{ alignSelf: "flex-end", backgroundColor: colors.orange, borderRadius: radius.lg, padding: space(3), marginBottom: space(2), maxWidth: "85%", opacity: it.msg.pending ? 0.6 : 1 }}
            >
              <Text style={{ color: colors.orangeInk, fontSize: 15 }}>{it.msg.content}</Text>
              {it.msg.failed ? <Text style={{ color: colors.orangeInk, fontSize: 12, fontWeight: "700" }}>Gönderilemedi · tekrar denemek için dokun</Text> : null}
            </Pressable>
          ) : (
            <View key={it.msg.id} style={{ marginBottom: space(2) }}>
              <Row style={{ alignItems: "flex-end" }}>
                <Mascot size={28} />
                <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: space(3), maxWidth: "85%" }}>
                  {it.msg.provider === "test" ? <TestBadge /> : null}
                  <Text style={type.body}>{it.msg.content}</Text>
                </View>
              </Row>
              {it.msg.card?.type === "proposal" ? <ProposalCard proposalId={it.msg.card.proposalId} onChanged={week.reload} /> : null}
              {it.msg.card?.type === "resources" ? <ResourcesCard card={it.msg.card} /> : null}
            </View>
          )
        )}
        {!items.length && !loading ? (
          <Row>
            {SUGGESTIONS.map((s) => (
              <Chip key={s} label={s} onPress={() => send(s)} />
            ))}
          </Row>
        ) : null}
      </ScrollView>

      <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), padding: space(3), borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.bgDeep }}>
        <Pressable accessibilityLabel="Fotoğraf çek" onPress={() => photo(true)} onLongPress={() => photo(false)} disabled={sending} style={{ padding: space(2) }}>
          <Text style={{ fontSize: 22 }}>📷</Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Çita'ya yaz… (galeri için 📷'a uzun bas)"
          placeholderTextColor={colors.muted}
          style={{ flex: 1, color: colors.text, backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(2.5) }}
          onSubmitEditing={() => send(text)}
          returnKeyType="send"
          maxLength={2000}
        />
        <Pressable accessibilityRole="button" onPress={() => send(text)} disabled={sending || !text.trim()} style={{ backgroundColor: colors.orange, borderRadius: radius.pill, padding: space(3), opacity: sending || !text.trim() ? 0.5 : 1 }}>
          <Text style={{ color: colors.orangeInk, fontWeight: "800" }}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
