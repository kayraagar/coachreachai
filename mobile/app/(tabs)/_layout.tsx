import { useEffect } from "react";
import { Redirect, Tabs } from "expo-router";
import { Alert } from "react-native";
import { TabIcon } from "@/components/TabIcon";
import { Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { importPendingDraft } from "@/lib/afterAuth";
import { colors } from "@/lib/theme";

export default function TabsLayout() {
  const { ready, session, profile } = useAuth();

  // Önceki aktarım ağ hatasıyla yarım kaldıysa: aynı requestId ile tekrar dene.
  useEffect(() => {
    if (profile?.role !== "student") return;
    importPendingDraft()
      .then(({ message }) => message && Alert.alert("Çita", message))
      .catch(() => undefined);
  }, [profile?.role]);

  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/hosgeldin" />;
  if (profile && profile.role !== "student") return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "800" },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.bgDeep, borderTopColor: colors.line },
        tabBarActiveTintColor: colors.orange,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="koc" options={{ title: "Koç", tabBarIcon: ({ color }) => <TabIcon name="koc" color={color} /> }} />
      <Tabs.Screen name="program" options={{ title: "Program", tabBarIcon: ({ color }) => <TabIcon name="program" color={color} /> }} />
      <Tabs.Screen name="gelisim" options={{ title: "Gelişim", tabBarIcon: ({ color }) => <TabIcon name="gelisim" color={color} /> }} />
      <Tabs.Screen name="birebir" options={{ title: "Bire Bir", tabBarIcon: ({ color }) => <TabIcon name="birebir" color={color} /> }} />
    </Tabs>
  );
}
