import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/lib/auth";
import { colors } from "@/lib/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "800" },
            contentStyle: { backgroundColor: colors.bg },
            headerShadowVisible: false,
            headerBackTitle: "Geri",
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="hosgeldin" options={{ headerShown: false }} />
          <Stack.Screen name="tanisma" options={{ title: "Tanışalım" }} />
          <Stack.Screen name="onizleme" options={{ title: "Haftalık programın" }} />
          <Stack.Screen name="kayit" options={{ title: "Programı kaydet" }} />
          <Stack.Screen name="giris" options={{ title: "Giriş yap" }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="plus" options={{ title: "Çita+" }} />
          <Stack.Screen name="deneme" options={{ title: "Deneme" }} />
          <Stack.Screen name="tekrar/[id]" options={{ title: "Tekrar" }} />
          <Stack.Screen name="veli" options={{ headerShown: false }} />
          <Stack.Screen name="veli-kayit" options={{ title: "Veli hesabı" }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
