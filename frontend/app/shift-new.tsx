import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@/src/context/UserContext";
import { colors, shiftStyle, roleColor } from "@/src/theme";
import { apiErrorMessage, apiRequest } from "@/src/api";

export default function ShiftNewScreen() {
  const { currentUser, users } = useUser();
  const router = useRouter();
  const params = useLocalSearchParams<{
  date?: string;
  shift_id?: string;
  user_id?: string;
  shift_type?: "Mattina" | "Pomeriggio" | "Notte";
  mode?: string;
}>();

  const isEdit = params.mode === "edit" && !!params.shift_id;
  const [date] = useState(params.date || new Date().toISOString().slice(0, 10));
  const [shiftType, setShiftType] = useState<"Mattina" | "Pomeriggio" | "Notte">(params.shift_type || "Mattina");
  const [selectedUser, setSelectedUser] = useState<string | null>(params.user_id || null);
  const [submitting, setSubmitting] = useState(false);

  if (!currentUser?.is_admin) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Accesso negato</Text>
      </SafeAreaView>
    );
  }

  const submit = async () => {
    if (!selectedUser) {
      Alert.alert("Errore", "Seleziona un utente");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest(isEdit ? `/api/shifts/${params.shift_id}` : "/api/shifts", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, shift_type: shiftType, user_id: selectedUser }),
      });
      Alert.alert(
        "Successo",
        isEdit ? "Turno modificato" : "Turno creato",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e) {
      Alert.alert("Errore", apiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{isEdit ? "Modifica turno" : "Nuovo turno"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.label}>Data</Text>
        <View style={styles.dateBox}>
          <Ionicons name="calendar" size={20} color={colors.textPrimary} />
          <Text style={styles.dateText}>{date}</Text>
        </View>

        <Text style={styles.label}>Tipo turno</Text>
        <View style={styles.shiftTypesRow}>
          {(["Mattina", "Pomeriggio", "Notte"] as const).map((t) => {
            const ss = shiftStyle(t);
            const sel = t === shiftType;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.shiftBtn, { backgroundColor: ss.bg, borderColor: sel ? colors.secondary : ss.border, borderWidth: sel ? 2 : 1 }]}
                onPress={() => setShiftType(t)}
                testID={`shift-type-${t}`}
              >
                <Text style={[styles.shiftBtnText, { color: ss.text }]}>{t}</Text>
                <Text style={[styles.shiftBtnTime, { color: ss.text }]}>{ss.time}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Utente</Text>
        {(["Autista", "Capoturno", "Soccorritore"] as const).map((role) => (
          <View key={role}>
            <Text style={styles.roleHeader}>{role === "Autista" ? "Autisti" : role === "Capoturno" ? "Capoturno" : "Soccorritori"}</Text>
            <View style={styles.userGrid}>
              {users.filter((u) => u.role === role).map((u) => {
                const sel = u.id === selectedUser;
                return (
                  <TouchableOpacity
                    key={u.id}
                    style={[styles.userChip, sel && { backgroundColor: roleColor(role), borderColor: roleColor(role) }]}
                    onPress={() => setSelectedUser(u.id)}
                    testID={`user-pick-${u.id}`}
                  >
                    <Text style={[styles.userChipText, sel && { color: "#FFF" }]}>{u.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={[styles.submitBtn, (!selectedUser || submitting) && { opacity: 0.4 }]}
          onPress={submit}
          disabled={!selectedUser || submitting}
          testID="submit-shift"
        >
          <Text style={styles.submitText}>
            {submitting ? "Salvataggio..." : isEdit ? "Salva modifiche" : "Crea turno"}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerBar: { flexDirection: "row", alignItems: "center", padding: 12 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  label: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginBottom: 10, marginTop: 16 },
  dateBox: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: 10 },
  dateText: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
  shiftTypesRow: { gap: 8 },
  shiftBtn: { padding: 14, borderRadius: 12 },
  shiftBtnText: { fontSize: 15, fontWeight: "700" },
  shiftBtnTime: { fontSize: 12, opacity: 0.85, marginTop: 2 },
  roleHeader: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginTop: 12, marginBottom: 6, letterSpacing: 0.5 },
  userGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  userChip: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  userChipText: { color: colors.textPrimary, fontWeight: "600", fontSize: 12 },
  submitBtn: { backgroundColor: colors.primary, padding: 16, borderRadius: 14, alignItems: "center", marginTop: 24 },
  submitText: { color: colors.primaryFg, fontWeight: "700", fontSize: 16 },
});
