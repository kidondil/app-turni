import React, { useMemo, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser, User } from "@/src/context/UserContext";
import { colors, roleColor } from "@/src/theme";

export default function UserSelectorScreen() {
  const { users, loading, initialized, pinSetupRequired, error, retry, login, currentUser } = useUser();
  const router = useRouter();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pin, setPin] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!initialized) {
      router.replace("/setup");
      return;
    }
    if (pinSetupRequired) {
      router.replace("/pin-setup");
      return;
    }
    if (currentUser) {
      router.replace("/(tabs)/home");
    }
  }, [loading, initialized, pinSetupRequired, currentUser, router]);

  const grouped = useMemo(() => {
    const g: Record<string, User[]> = { Autista: [], Capoturno: [], Soccorritore: [] };
    users.forEach((u) => {
      if (g[u.role]) g[u.role].push(u);
    });
    return g;
  }, [users]);

  const handleSelect = (u: User) => {
    setSelectedUser(u);
    setPin("");
  };

  const handleLogin = async () => {
    if (!selectedUser || !/^\d{4,6}$/.test(pin)) {
      Alert.alert("PIN non valido", "Inserisci da 4 a 6 cifre");
      return;
    }
    setSigningIn(true);
    try {
      await login(selectedUser, pin);
      setSelectedUser(null);
      router.replace("/(tabs)/home");
    } catch (e) {
      Alert.alert("Accesso non riuscito", e instanceof Error ? e.message : "Controlla il PIN e riprova");
    } finally {
      setSigningIn(false);
    }
  };

  const initials = (name: string) =>
    name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.loading}>
        <Ionicons name="cloud-offline-outline" size={42} color={colors.danger} />
        <Text style={styles.connectionTitle}>Server non raggiungibile</Text>
        <Text style={styles.connectionText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={retry}>
          <Text style={styles.retryText}>Riprova</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!initialized || pinSetupRequired) return null;

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

      <Modal
        visible={!!selectedUser}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedUser(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{selectedUser?.name}</Text>
            <Text style={styles.modalSubtitle}>Inserisci il tuo PIN personale</Text>
            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={(value) => setPin(value.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              autoFocus
              placeholder="••••"
              placeholderTextColor={colors.textMuted}
              testID="login-pin"
              onSubmitEditing={handleLogin}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setSelectedUser(null)} disabled={signingIn}>
                <Text style={styles.cancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.loginButton, signingIn && styles.disabled]} onPress={handleLogin} disabled={signingIn} testID="login-submit">
                {signingIn ? <ActivityIndicator color={colors.primaryFg} /> : <Text style={styles.loginText}>Accedi</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  connectionTitle: { marginTop: 14, fontSize: 18, fontWeight: "700", color: colors.textPrimary },
  connectionText: { marginTop: 8, marginHorizontal: 28, textAlign: "center", color: colors.textSecondary, lineHeight: 20 },
  retryBtn: { marginTop: 18, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { color: colors.primaryFg, fontWeight: "700" },
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
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  modalCard: { backgroundColor: colors.background, padding: 22, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, textAlign: "center" },
  modalSubtitle: { fontSize: 13, color: colors.textSecondary, textAlign: "center", marginTop: 5, marginBottom: 18 },
  pinInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 15, fontSize: 24, textAlign: "center", letterSpacing: 8, color: colors.textPrimary },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelButton: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  cancelText: { color: colors.textPrimary, fontWeight: "600" },
  loginButton: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center" },
  loginText: { color: colors.primaryFg, fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
