import { router } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Mascot } from "@/components/Mascot";
import { Button } from "@/components/ui";
import { colors, space, type } from "@/lib/theme";

export default function Welcome() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, padding: space(6), justifyContent: "space-between" }}>
      <View style={{ alignItems: "center", marginTop: space(12) }}>
        <Mascot size={160} mood="happy" />
        <Text style={[type.h1, { fontSize: 40, marginTop: space(4) }]}>Çita</Text>
        <Text style={[type.body, { textAlign: "center", color: colors.muted, marginTop: space(2) }]}>
          YKS ve LGS için kısa, net, hedef odaklı çalışma koçun.
        </Text>
        <Text style={[type.body, { textAlign: "center", marginTop: space(6), fontWeight: "700" }]}>
          «Hesap açmadan 2 dakikada haftalık programını çıkaralım. Hazır mısın?»
        </Text>
      </View>
      <View>
        <Button title="Tanışalım" onPress={() => router.push("/tanisma")} />
        <Button title="Giriş Yap" kind="ghost" onPress={() => router.push("/giris")} />
        <Button title="Veliyim" kind="ghost" small onPress={() => router.push("/veli-kayit")} />
      </View>
    </SafeAreaView>
  );
}
