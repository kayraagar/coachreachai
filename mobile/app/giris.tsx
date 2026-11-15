import { useState } from "react";
import { router } from "expo-router";
import { Alert } from "react-native";
import { Mascot } from "@/components/Mascot";
import { Button, ErrorText, Field, H1, P, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { importPendingDraft } from "@/lib/afterAuth";
import { useAuth } from "@/lib/auth";

export default function Giris() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err || !data.session) return setError("E-posta veya şifre hatalı.");
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).maybeSingle();
      if (prof?.role === "student") {
        try {
          const { message } = await importPendingDraft();
          if (message) Alert.alert("Çita", message);
        } catch {
          Alert.alert("Çita", "Programın şu an aktarılamadı; cihazında duruyor ve bir sonraki açılışta tekrar denenecek.");
        }
      }
      await refresh();
      router.replace("/");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!email.trim()) return setError("Önce e-postanı yaz.");
    await supabase.auth.resetPasswordForEmail(email.trim());
    Alert.alert("Çita", "Şifre sıfırlama bağlantısı gönderildi (hesap varsa).");
  };

  return (
    <Screen>
      <Mascot size={64} />
      <H1>Tekrar hoş geldin</H1>
      <P muted>Mevcut CoachReachAI hesabınla da giriş yapabilirsin.</P>
      <Field label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Şifre" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      <ErrorText>{error}</ErrorText>
      <Button title="Giriş Yap" loading={busy} onPress={submit} />
      <Button title="Şifremi unuttum" kind="ghost" onPress={reset} />
    </Screen>
  );
}
