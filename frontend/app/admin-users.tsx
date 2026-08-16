import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser, User } from "@/src/context/UserContext";
import { colors, roleColor } from "@/src/theme";
import { apiErrorMessage, apiRequest } from "@/src/api";

const ROLES: ("Autista" | "Capoturno" | "Soccorritore")[] = ["Autista", "Capoturno", "Soccorritore"];

export default function AdminUsersScreen() {
  const { currentUser, users, refreshUsers, refreshStatus, clearUser } = useUser();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newRole, setNewRole] = useState<typeof ROLES[number]>("Autista");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<typeof ROLES[number]>("Autista");
  const [editPin, setEditPin] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!currentUser) { router.replace("/"); return; }
    if (!currentUser.is_admin) {
      Alert.alert("Accesso negato", "Solo l'admin può gestire gli utenti");
      router.back();
    }
  }, [currentUser, router]);

  if (!currentUser?.is_admin) return null;

  const handleAdd = async () => {
    if (!newName.trim()) {
      Alert.alert("Errore", "Inserisci un nome");
      return;
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      Alert.alert("PIN non valido", "Inserisci da 4 a 6 cifre");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), role: newRole, pin: newPin }),
      });
      await refreshUsers();
      setNewName("");
      setNewPin("");
      setAdding(false);
    } catch (error) {
      Alert.alert("Errore", apiErrorMessage(error, "Creazione fallita"));
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (u: User) => {
    setEditingUser(u);
    setEditName(u.name);
    setEditRole(u.role as typeof ROLES[number]);
    setEditPin("");
  };

  const handleEdit = async () => {
    if (!editingUser) return;
    if (!editName.trim()) { Alert.alert("Errore", "Nome vuoto"); return; }
    if (editPin && !/^\d{4,6}$/.test(editPin)) {
      Alert.alert("PIN non valido", "Il nuovo PIN deve contenere da 4 a 6 cifre");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest(`/api/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), role: editRole }),
      });
      if (editPin) {
        await apiRequest(`/api/auth/users/${editingUser.id}/reset-pin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ new_pin: editPin }),
        });
      }
      await refreshUsers();
      setEditingUser(null);
    } catch (error) {
      Alert.alert("Errore", apiErrorMessage(error, "Modifica fallita"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (u: User) => {
    Alert.alert(
      "Elimina utente",
      `Eliminare ${u.name}? I turni futuri e le richieste pendenti verranno rimossi. I turni passati restano per le statistiche.`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina", style: "destructive",
          onPress: async () => {
            try {
              await apiRequest(`/api/users/${u.id}`, { method: "DELETE" });
              await refreshUsers();
            } catch (error) {
              Alert.alert("Errore", apiErrorMessage(error, "Eliminazione fallita"));
            }
          },
        },
      ]
    );
  };

  const handleResetAll = () => {
    Alert.alert(
      "⚠️ Reset completo",
      "Verranno eliminati TUTTI gli utenti, turni, scambi, ferie e notifiche. L'app tornerà alla configurazione iniziale. Operazione IRREVERSIBILE.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Conferma reset", style: "destructive",
          onPress: async () => {
            try {
              await apiRequest("/api/setup/reset", { method: "POST" });
              await Promise.all([clearUser(), refreshStatus()]);
              router.replace("/setup");
            } catch (error) {
              Alert.alert("Errore", apiErrorMessage(error, "Reset non riuscito"));
            }
          },
        },
      ]
    );
  };

  const grouped: Record<string, User[]> = { Autista: [], Capoturno: [], Soccorritore: [] };
  users.forEach((u) => { if (grouped[u.role]) grouped[u.role].push(u); });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Gestisci utenti</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Add user */}
          {adding ? (
            <View style={styles.addCard}>
              <Text style={styles.label}>Nuovo utente</Text>
              <TextInput
                style={styles.input}
                placeholder="Nome e cognome"
                placeholderTextColor={colors.textMuted}
                value={newName}
                onChangeText={setNewName}
                testID="new-user-name"
              />
              <TextInput
                style={styles.input}
                placeholder="PIN personale (4–6 cifre)"
                placeholderTextColor={colors.textMuted}
                value={newPin}
                onChangeText={(value) => setNewPin(value.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                testID="new-user-pin"
              />
              <View style={styles.roleRow}>
                {ROLES.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleBtn, newRole === r && { backgroundColor: roleColor(r), borderColor: roleColor(r) }]}
                    onPress={() => setNewRole(r)}
                  >
                    <Text style={[styles.roleText, newRole === r && { color: "#FFF" }]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setAdding(false); setNewName(""); setNewPin(""); }}>
                  <Text style={styles.cancelText}>Annulla</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={handleAdd} disabled={submitting} testID="confirm-add">
                  <Text style={styles.confirmText}>{submitting ? "..." : "Aggiungi"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.addNewBtn} onPress={() => setAdding(true)} testID="add-new-btn">
              <Ionicons name="add-circle" size={22} color={colors.primaryFg} />
              <Text style={styles.addNewText}>Aggiungi nuovo membro</Text>
            </TouchableOpacity>
          )}

          {/* Users list grouped */}
          {ROLES.map((role) => (
            <View key={role}>
              <Text style={styles.groupTitle}>{role === "Autista" ? "Autisti" : role === "Capoturno" ? "Capoturno" : "Soccorritori"} ({grouped[role].length})</Text>
              {grouped[role].map((u) => (
                <View key={u.id} style={styles.userRow}>
                  <View style={[styles.userDot, { backgroundColor: roleColor(u.role) }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{u.name}</Text>
                    {u.is_admin && <Text style={styles.adminLabel}>Amministratore</Text>}
                  </View>
                  <TouchableOpacity onPress={() => openEdit(u)} style={styles.iconBtn} testID={`edit-${u.id}`}>
                    <Ionicons name="pencil" size={18} color={colors.textPrimary} />
                  </TouchableOpacity>
                  {!u.is_admin && (
                    <TouchableOpacity onPress={() => handleDelete(u)} style={styles.iconBtn} testID={`delete-${u.id}`}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          ))}

          {/* Danger zone */}
          <View style={styles.dangerZone}>
            <Text style={styles.dangerTitle}>Zona pericolosa</Text>
            <TouchableOpacity style={styles.dangerBtn} onPress={handleResetAll} testID="reset-all-btn">
              <Ionicons name="warning" size={18} color={colors.danger} />
              <Text style={styles.dangerBtnText}>Reset completo configurazione</Text>
            </TouchableOpacity>
            <Text style={styles.dangerNote}>Elimina tutti i dati e riavvia il wizard di setup</Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Edit modal */}
        <Modal visible={!!editingUser} transparent animationType="slide" onRequestClose={() => setEditingUser(null)}>
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Modifica utente</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="Nome"
                placeholderTextColor={colors.textMuted}
                testID="edit-name-input"
              />
              <View style={styles.roleRow}>
                {ROLES.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleBtn, editRole === r && { backgroundColor: roleColor(r), borderColor: roleColor(r) }]}
                    onPress={() => setEditRole(r)}
                  >
                    <Text style={[styles.roleText, editRole === r && { color: "#FFF" }]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {editingUser?.id !== currentUser.id && (
                <>
                  <Text style={styles.pinHelp}>Nuovo PIN (lascia vuoto per non cambiarlo)</Text>
                  <TextInput
                    style={styles.input}
                    value={editPin}
                    onChangeText={(value) => setEditPin(value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Nuovo PIN"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={6}
                    testID="edit-pin-input"
                  />
                </>
              )}
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingUser(null)}>
                  <Text style={styles.cancelText}>Annulla</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={handleEdit} disabled={submitting} testID="confirm-edit">
                  <Text style={styles.confirmText}>{submitting ? "..." : "Salva"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerBar: { flexDirection: "row", alignItems: "center", padding: 12 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  label: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginBottom: 8 },
  input: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.textPrimary, marginBottom: 10 },
  roleRow: { flexDirection: "row", gap: 6, marginBottom: 10 },
  roleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  roleText: { fontSize: 12, fontWeight: "600", color: colors.textPrimary },
  addCard: { padding: 14, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  actionRow: { flexDirection: "row", gap: 8 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  cancelText: { color: colors.textPrimary, fontWeight: "600" },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center" },
  confirmText: { color: colors.primaryFg, fontWeight: "700" },
  addNewBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 14, gap: 8, marginBottom: 16 },
  addNewText: { color: colors.primaryFg, fontWeight: "700", fontSize: 15 },
  groupTitle: { fontSize: 13, fontWeight: "700", color: colors.textSecondary, marginTop: 14, marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" },
  userRow: { flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 6, gap: 10 },
  userDot: { width: 10, height: 10, borderRadius: 5 },
  userName: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  adminLabel: { fontSize: 11, color: colors.primaryDark, marginTop: 2, fontWeight: "600" },
  iconBtn: { padding: 8 },
  dangerZone: { marginTop: 32, padding: 14, backgroundColor: "#FEF2F2", borderRadius: 12, borderWidth: 1, borderColor: "#FECACA" },
  dangerTitle: { fontSize: 14, fontWeight: "700", color: colors.danger, marginBottom: 10 },
  dangerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 12, borderRadius: 10, backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.danger, gap: 6 },
  dangerBtnText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
  dangerNote: { fontSize: 11, color: colors.textSecondary, marginTop: 8, textAlign: "center" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.background, padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: 16 },
  pinHelp: { fontSize: 11, color: colors.textSecondary, marginBottom: 7 },
});
