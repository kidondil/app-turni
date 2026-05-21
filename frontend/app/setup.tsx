import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@/src/context/UserContext";
import { colors, roleColor, API_URL } from "@/src/theme";

type Member = { name: string; role: "Autista" | "Capoturno" | "Soccorritore" };

const ROLES: Member["role"][] = ["Autista", "Capoturno", "Soccorritore"];

export default function SetupScreen() {
  const router = useRouter();
  const { refreshUsers } = useUser();
  const [members, setMembers] = useState<Member[]>([]);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Member["role"]>("Autista");
  const [adminIdx, setAdminIdx] = useState<number>(-1);
  const [submitting, setSubmitting] = useState(false);

  const addMember = () => {
    if (!newName.trim()) {
      Alert.alert("Errore", "Inserisci un nome");
      return;
    }
    setMembers([...members, { name: newName.trim(), role: newRole }]);
    setNewName("");
  };

  const removeMember = (idx: number) => {
    setMembers(members.filter((_, i) => i !== idx));
    if (adminIdx === idx) setAdminIdx(-1);
    else if (adminIdx > idx) setAdminIdx(adminIdx - 1);
  };

  const submit = async () => {
    if (members.length < 1) {
      Alert.alert("Errore", "Aggiungi almeno un membro");
      return;
    }
    if (adminIdx < 0) {
      Alert.alert("Errore", "Seleziona un amministratore");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ members, admin_index: adminIdx }),
      });
      if (res.ok) {
        await refreshUsers();
        Alert.alert("Configurazione completata", "L'app è pronta all'uso", [
          { text: "Inizia", onPress: () => router.replace("/") },
        ]);
      } else {
        const err = await res.json();
        Alert.alert("Errore", err.detail || "Setup fallito");
      }
    } catch (e) {
      Alert.alert("Errore", "Setup fallito");
    } finally {
      setSubmitting(false);
    }
  };

  const counts = ROLES.reduce((acc, r) => {
    acc[r] = members.filter((m) => m.role === r).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <View style={styles.logo}>
              <Ionicons name="medkit" size={32} color={colors.primaryFg} />
            </View>
            <Text style={styles.title}>LAPS Turni</Text>
            <Text style={styles.subtitle}>Aggiungi i membri della cooperativa e scegli l'amministratore</Text>
          </View>

          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: "#DBEAFE" }]}>
              <Text style={[styles.summaryNum, { color: "#1E40AF" }]}>{counts.Autista}</Text>
              <Text style={[styles.summaryLabel, { color: "#1E40AF" }]}>Autisti</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: "#EDE9FE" }]}>
              <Text style={[styles.summaryNum, { color: "#5B21B6" }]}>{counts.Capoturno}</Text>
              <Text style={[styles.summaryLabel, { color: "#5B21B6" }]}>Capoturno</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: "#D1FAE5" }]}>
              <Text style={[styles.summaryNum, { color: "#065F46" }]}>{counts.Soccorritore}</Text>
              <Text style={[styles.summaryLabel, { color: "#065F46" }]}>Soccorritori</Text>
            </View>
          </View>

          {/* Add member */}
          <Text style={styles.label}>Aggiungi membro</Text>
          <TextInput
            style={styles.input}
            placeholder="Nome e cognome"
            placeholderTextColor={colors.textMuted}
            value={newName}
            onChangeText={setNewName}
            testID="new-member-name"
          />
          <View style={styles.roleRow}>
            {ROLES.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.roleBtn, newRole === r && { backgroundColor: roleColor(r), borderColor: roleColor(r) }]}
                onPress={() => setNewRole(r)}
                testID={`role-${r}`}
              >
                <Text style={[styles.roleText, newRole === r && { color: "#FFF" }]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={addMember} testID="add-member-btn">
            <Ionicons name="add" size={20} color={colors.primaryFg} />
            <Text style={styles.addBtnText}>Aggiungi</Text>
          </TouchableOpacity>

          {/* Members list */}
          {members.length > 0 && (
            <>
              <Text style={[styles.label, { marginTop: 24 }]}>Membri ({members.length}) — tocca uno per renderlo admin</Text>
              {members.map((m, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.memberRow, adminIdx === idx && styles.memberAdmin]}
                  onPress={() => setAdminIdx(idx)}
                  testID={`member-${idx}`}
                >
                  <View style={[styles.memberDot, { backgroundColor: roleColor(m.role) }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{m.name}</Text>
                    <Text style={styles.memberRole}>{m.role}</Text>
                  </View>
                  {adminIdx === idx && (
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminText}>ADMIN</Text>
                    </View>
                  )}
                  <TouchableOpacity onPress={() => removeMember(idx)} style={styles.delBtn} testID={`del-member-${idx}`}>
                    <Ionicons name="close-circle" size={22} color={colors.danger} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, (submitting || members.length === 0 || adminIdx < 0) && { opacity: 0.4 }]}
            onPress={submit}
            disabled={submitting || members.length === 0 || adminIdx < 0}
            testID="submit-setup"
          >
            {submitting ? <ActivityIndicator color={colors.primaryFg} /> : (
              <Text style={styles.submitText}>Completa configurazione</Text>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  header: { alignItems: "center", paddingVertical: 24 },
  logo: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { fontSize: 26, fontWeight: "700", color: colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 6, textAlign: "center", paddingHorizontal: 24 },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  summaryCard: { flex: 1, padding: 12, borderRadius: 12, alignItems: "center" },
  summaryNum: { fontSize: 20, fontWeight: "700" },
  summaryLabel: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  label: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginBottom: 8 },
  input: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.textPrimary, marginBottom: 10 },
  roleRow: { flexDirection: "row", gap: 6, marginBottom: 10 },
  roleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  roleText: { fontSize: 12, fontWeight: "600", color: colors.textPrimary },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 12, gap: 6 },
  addBtnText: { color: colors.primaryFg, fontWeight: "700", fontSize: 14 },
  memberRow: { flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 6, gap: 10 },
  memberAdmin: { borderColor: colors.primary, backgroundColor: "#FEFCE8", borderWidth: 2 },
  memberDot: { width: 10, height: 10, borderRadius: 5 },
  memberName: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  memberRole: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  adminBadge: { backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  adminText: { fontSize: 9, fontWeight: "700", color: colors.primaryFg, letterSpacing: 0.8 },
  delBtn: { padding: 4 },
  submitBtn: { backgroundColor: colors.primary, padding: 16, borderRadius: 14, alignItems: "center", marginTop: 24 },
  submitText: { color: colors.primaryFg, fontWeight: "700", fontSize: 16 },
});
