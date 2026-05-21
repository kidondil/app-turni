import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { UserProvider } from "@/src/context/UserContext";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <UserProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F8F9FA" } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="setup" />
          <Stack.Screen name="admin-users" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="day/[date]" options={{ presentation: "card" }} />
        </Stack>
      </UserProvider>
    </SafeAreaProvider>
  );
}
