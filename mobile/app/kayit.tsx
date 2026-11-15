import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Alert, Pressable, Text } from "react-native";
import { Mascot } from "@/components/Mascot";
import { Button, ErrorText, Field, H1, P, Row, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { loadDraft, type Draft } from "@/lib/draft";
import { importPendingDraft } from "@/lib/afterAuth";
import { useAuth } from "@/lib/auth";
import { colors, space } from "@/lib/theme";

export default function Kayit() {
  const { refresh } = useAuth();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachCode, setCoachCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitingEmail, setWaitingEmail] = useState(false);

  useEffect(() => {
    loadDraft().then(setDraft);
  }, []);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !email.trim()) return setError("Adını ve e-postanı yaz.");
    if (password.length < 8) return setError("Şifre en az 8 karakter olmalı.");
    setBusy(true);
    try {
      const code = coachCode.trim();
      if (code) {
        // İsteğe bağlı koç kodu: eski eşleşme akışı korunur, kod doğrulanır.
        const { data: coachId, error: rpcErr } = await supabase.rpc("resolve_coach", { code });
        if (rpcErr) return setError("Koç kodu doğrulanamadı. Tekrar dene.");
        if (!coachId) return setError("Bu koç kodu bulunamadı. Boş bırakabilirsin; koç kodu zorunlu değil.");
      }
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: name.trim(),
            role: "student",
            track: draft?.profile.track ?? "YKS",
            ...(code ? { coach_code: code } : {}),
          },
        },
      });
      if (err) return setError(err.message.includes("registered") ? "Bu e-posta ile hesap var. Giriş yap; programın hesabına taşınır." : err.message);
      if (!data.session) {
        setWaitingEmail(true);
        return;
      }
      const { message } = await importPendingDraft();
      await refresh();
      if (message) Alert.alert("Çita", message);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt tamamlanamadı. Taslağın cihazında duruyor; tekrar deneyebilirsin.");
    } finally {
      setBusy(false);
    }
  };

  if (waitingEmail) {
    return (
      <Screen>
        <Mascot size={72} />
        <H1>E-postanı doğrula</H1>
        <P>Gelen kutundaki bağlantıya tıkla, sonra giriş yap. Programın bu cihazda bekliyor; girişte hesabına taşınacak.</P>
        <Button title="Giriş yap" onPress={() => router.replace("/giris")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Row>
        <Mascot size={44} />
        <P>Programını kaydetmek için hesap aç. Ücretsiz.</P>
      </Row>
      <H1>Hesap aç</H1>
      <Field label="Ad soyad" value={name} onChangeText={setName} autoComplete="name" />
      <Field label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Şifre" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="En az 8 karakter" />
      <Pressable onPress={() => setCoachOpen(!coachOpen)} style={{ marginBottom: space(2) }}>
        <Text style={{ color: colors.orangeSoft, fontWeight: "700" }}>{coachOpen ? "▾" : "▸"} Koç kodum var (isteğe bağlı)</Text>
      </Pressable>
      {coachOpen && <Field label="Koç kodu" value={coachCode} onChangeText={setCoachCode} autoCapitalize="characters" placeholder="Örn. K7M2QX" />}
      <ErrorText>{error}</ErrorText>
      <Button title="Programı Kaydet ve Başla" loading={busy} onPress={submit} />
      <Button title="Zaten hesabım var" kind="ghost" onPress={() => router.replace("/giris")} />
    </Screen>
  );
}
