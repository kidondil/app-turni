import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser, User } from "@/src/context/UserContext";
import { apiErrorMessage, apiRequest } from "@/src/api";
import { colors, roleColor } from "@/src/theme";

export default function AdminSettingsScreen() {
  const { currentUser, users, refreshUsers } = useUser();
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      router.replace("/");
      return;
    }
    if (!currentUser.is_admin) {
      Alert.alert("Accesso negato", "Solo un amministratore può modificare gli amministratori");
      router.back();
    }
  }, [currentUser, router]);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => Number(b.is_admin) - Number(a.is_admin) || a.name.localeCompare(b.name, "it")),
    [users],
  );
  const adminCount = users.filter((user) => user.is_admin).length;

  if (!currentUser?.is_admin) return null;

  const updateAdmin = async (user: User, nextValue: boolean) => {
    setSavingId(user.id);
    try {
      await apiRequest(`/api/users/${user.id}/admin?value=${nextValue}`, { method: "PATCH" });
      await refreshUsers();
      if (user.id === currentUser.id && !nextValue) {
        Alert.alert("Ruolo aggiornato", "Non sei più amministratore. Gli altri amministratori restano attivi.", [
          { text: "OK", onPress: () => router.replace("/profile") },
        ]);
      }
    } catch (error) {
      Alert.alert("Errore", apiErrorMessage(error, "Impossibile aggiornare gli amministratori"));
    } finally {
      setSavingId(null);
    }
  };

  const confirmToggle = (user: User) => {
    const nextValue = !user.is_admin;
    if (!nextValue && adminCount <= 1) {
      Alert.alert("Operazione non consentita", "Deve rimanere almeno un amministratore nell’app.");
      return;
    }
    Alert.alert(
      nextValue ? "Aggiungi amministratore" : "Rimuovi amministratore",
      nextValue
        ? `${user.name} potrà gestire utenti, turni, ferie e impostazioni.`
        : `${user.name} non avrà più accesso alle funzioni di amministrazione.`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: nextValue ? "Rendi amministratore" : "Rimuovi ruolo",
          style: nextValue ? "default" : "destructive",
          onPress: () => updateAdmin(user, nextValue),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Indietro">
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Amministratori</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Ionicons name="shield-checkmark" size={26} color={colors.primaryFg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>{adminCount} {adminCount === 1 ? "amministratore attivo" : "amministratori attivi"}</Text>
            <Text style={styles.infoText}>Puoi selezionarne più di uno. Deve rimanerne sempre almeno uno.</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Scegli gli amministratori</Text>
        {sortedUsers.map((user) => {
          const saving = savingId === user.id;
          return (
            <TouchableOpacity
              key={user.id}
              style={[styles.userRow, user.is_admin && styles.userRowSelected]}
              onPress={() => !savingId && confirmToggle(user)}
              activeOpacity={0.75}
              disabled={!!savingId}
              testID={`toggle-admin-${user.id}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: user.is_admin, disabled: !!savingId }}
            >
              <View style={[styles.avatar, { backgroundColor: roleColor(user.role) }]}>
                <Text style={styles.avatarText}>{user.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{user.name}</Text>
                <Text style={styles.userRole}>{user.role}{user.id === currentUser.id ? " · Tu" : ""}</Text>
              </View>
              {saving ? (
                <ActivityIndicator color={colors.primaryDark} size="small" />
              ) : (
                <View style={[styles.checkBox, user.is_admin && styles.checkBoxSelected]}>
                  {user.is_admin && <Ionicons name="checkmark" size={22} color={colors.primaryFg} />}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <View style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={22} color={colors.textSecondary} />
          <Text style={styles.noteText}>Tutti gli amministratori hanno gli stessi permessi. Aggiungerne uno non rimuove quelli già presenti.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 8 },
  backBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  scroll: { paddingHorizontal: 16, paddingBottom: 36 },
  infoCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
  infoIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  infoTitle: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  infoText: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, marginTop: 3 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.textPrimary, marginTop: 24, marginBottom: 10 },
  userRow: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: 10, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  userRowSelected: { borderColor: colors.primaryDark, backgroundColor: "#FEFCE8", borderWidth: 2 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  userInfo: { flex: 1, minWidth: 0 },
  userName: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  userRole: { fontSize: 13, color: colors.textSecondary, marginTop: 3 },
  checkBox: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.background },
  checkBoxSelected: { backgroundColor: colors.primary, borderColor: colors.primaryDark },
  noteCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 14, backgroundColor: "#F4F4F5", marginTop: 10 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
});
