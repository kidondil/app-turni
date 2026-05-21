import React, { useMemo, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser, User } from "@/src/context/UserContext";
import { colors, roleColor } from "@/src/theme";

export default function UserSelectorScreen() {
  const { users, loading, initialized, selectUser, currentUser } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!initialized) {
      router.replace("/setup");
      return;
    }
    if (currentUser) {
      router.replace("/(tabs)/home");
    }
  }, [loading, initialized, currentUser, router]);

  const grouped = useMemo(() => {
    const g: Record<string, User[]> = { Autista: [], Capoturno: [], Soccorritore: [] };
    users.forEach((u) => {
      if (g[u.role]) g[u.role].push(u);
    });
    return g;
  }, [users]);

  const handleSelect = async (u: User) => {
    await selectUser(u);
    router.replace("/(tabs)/home");
  };

  const initials = (name: string) =>
    name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  if (loading || !initialized) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="user-selector-screen">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.logo}>
            <Ionicons name="medkit" size={32} color={colors.primaryFg} />
          </View>
          <Text style={styles.title}>LAPS Turni</Text>
          <Text style={styles.subtitle}>Seleziona il tuo profilo</Text>
        </View>

        {(["Autista", "Capoturno", "Soccorritore"] as const).map((role) => (
          <View key={role} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.roleDot, { backgroundColor: roleColor(role) }]} />
              <Text style={styles.sectionTitle}>{role === "Autista" ? "Autisti" : role === "Capoturno" ? "Capoturno" : "Soccorritori"}</Text>
              <Text style={styles.sectionCount}>{grouped[role]?.length || 0}</Text>
            </View>
            <View style={styles.grid}>
              {grouped[role]?.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.userCard}
                  onPress={() => handleSelect(u)}
                  activeOpacity={0.7}
                  testID={`user-card-${u.id}`}
                >
                  <View style={[styles.avatar, { backgroundColor: roleColor(role) }]}>
                    <Text style={styles.avatarText}>{initials(u.name)}</Text>
                  </View>
                  <Text style={styles.userName} numberOfLines={1}>{u.name}</Text>
                  {u.is_admin && (
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminText}>ADMIN</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  header: { alignItems: "center", paddingVertical: 32 },
  logo: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  title: { fontSize: 28, fontWeight: "700", color: colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12, paddingHorizontal: 4 },
  roleDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: colors.textPrimary, flex: 1 },
  sectionCount: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  userCard: {
    width: "48%", backgroundColor: colors.surface, borderRadius: 16, padding: 16,
    alignItems: "center", borderWidth: 1, borderColor: colors.border, minHeight: 110,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  avatarText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  userName: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, textAlign: "center" },
  adminBadge: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.primary, borderRadius: 8 },
  adminText: { fontSize: 9, fontWeight: "700", color: colors.primaryFg, letterSpacing: 1 },
});
