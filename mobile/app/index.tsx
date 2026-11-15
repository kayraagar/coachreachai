import { Redirect } from "expo-router";
import { Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { configMissing } from "@/lib/supabase";
import { Button, Loading, Screen, H1, P } from "@/components/ui";
import { Mascot } from "@/components/Mascot";
import { space } from "@/lib/theme";

export default function Index() {
  const { ready, session, profile, signOut } = useAuth();

  if (configMissing) {
    return (
      <Screen>
        <Mascot size={72} mood="focus" />
        <H1>Yapılandırma eksik</H1>
        <P>EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY ve EXPO_PUBLIC_API_URL değişkenlerini mobile/.env dosyasına ekle (bkz. mobile/README.md).</P>
      </Screen>
    );
  }
  if (!ready || (session && !profile)) return <Loading />;
  if (!session) return <Redirect href="/hosgeldin" />;
  if (profile?.role === "parent") return <Redirect href="/veli" />;
  if (profile?.role === "coach") {
    return (
      <Screen>
        <View style={{ alignItems: "center", marginTop: space(10) }}>
          <Mascot size={96} />
        </View>
        <H1>Koç paneli web&apos;de</H1>
        <P>Çita mobil uygulaması öğrenci ve veli içindir. Koç hesabınla CoachReachAI web panelinden devam et.</P>
        <Text> </Text>
        <Button title="Çıkış yap" kind="secondary" onPress={signOut} />
      </Screen>
    );
  }
  return <Redirect href="/koc" />;
}
