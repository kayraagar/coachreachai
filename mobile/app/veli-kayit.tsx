import { useState } from "react";
import { router } from "expo-router";
import { Button, ErrorText, Field, H1, P, Screen } from "@/components/ui";
import { Mascot } from "@/components/Mascot";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

/** Veli hesabı: öğrenci hesabından ayrı; öğrenciye yalnızca kodla bağlanır. */
export default function VeliKayit() {
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || password.length < 8) return setError("Ad, e-posta ve en az 8 karakterli şifre gerekli.");
    setBusy(true);
    const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim(), role: "parent" } } });
    setBusy(false);
    if (err) return setError(err.message);
    if (!data.session) return setWaiting(true);
    await refresh();
    router.replace("/");
  };

  if (waiting)
    return (
      <Screen>
        <H1>E-postanı doğrula</H1>
        <P>Doğruladıktan sonra giriş yap.</P>
        <Button title="Giriş yap" onPress={() => router.replace("/giris")} />
      </Screen>
    );

  return (
    <Screen>
      <Mascot size={56} />
      <H1>Veli hesabı</H1>
      <P muted>LGS öğrencinin haftalık özetini görmek ve onun adına paket almak için. Öğrencinin özel sohbetleri ve fotoğrafları sana görünmez.</P>
      <Field label="Ad soyad" value={name} onChangeText={setName} />
      <Field label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Field label="Şifre" value={password} onChangeText={setPassword} secureTextEntry />
      <ErrorText>{error}</ErrorText>
      <Button title="Hesap aç" loading={busy} onPress={submit} />
    </Screen>
  );
}
