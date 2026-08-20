import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { apiErrorMessage, apiRequest } from "@/src/api";
import { colors, roleColor } from "@/src/theme";
import { useUser } from "@/src/context/UserContext";
import { formatDateInputIt, formatIsoDateIt, parseDateInputIt, todayIsoLocal } from "@/src/utils/dates";

type LeaveBalance = {
  user_id: string;
  user_name: string;
  role: string;
  configured: boolean;
  monthly_accrual: number;
  initial_balance?: number;
  balance_date?: string;
  accrued?: number;
  used?: number;
  scheduled?: number;
  remaining?: number;
  available_after_scheduled?: number;
  as_of?: string;
};

const days = (value?: number) => `${(value || 0).toLocaleString("it-IT", { maximumFractionDigits: 1 })} gg`;

export default function AdminLeaveBalancesScreen() {
  const { currentUser } = useUser();
  const router = useRouter();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LeaveBalance | null>(null);
  const [balanceInput, setBalanceInput] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!currentUser?.is_admin) return;
    try {
      setBalances(await apiRequest<LeaveBalance[]>("/api/leave-balances"));
    } catch (error) {
      Alert.alert("Errore", apiErrorMessage(error, "Impossibile caricare i saldi ferie"));
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useFocusEffect(useCallback(() => {
    if (!currentUser) {
      router.replace("/");
      return;
    }
    if (!currentUser.is_admin) {
      Alert.alert("Accesso negato", "Solo un amministratore può gestire i saldi ferie");
      router.back();
      return;
    }
    load();
  }, [currentUser, load, router]));

  const openEdit = (item: LeaveBalance) => {
    setEditing(item);
    setBalanceInput(item.configured ? String(item.initial_balance).replace(".", ",") : "");
    setDateInput(item.configured && item.balance_date ? formatIsoDateIt(item.balance_date) : formatIsoDateIt(todayIsoLocal()));
  };

  const save = async () => {
    if (!editing) return;
    const numericBalance = Number(balanceInput.replace(",", "."));
    if (!balanceInput.trim() || Number.isNaN(numericBalance)) {
      Alert.alert("Saldo non valido", "Inserisci i giorni di ferie residui, per esempio 18,5");
      return;
    }
    const balanceDate = parseDateInputIt(dateInput);
    if (!balanceDate) {
      Alert.alert("Data non valida", "Inserisci la data nel formato GG/MM/AAAA");
      return;
    }
    setSaving(true);
    try {
      const updated = await apiRequest<LeaveBalance>(`/api/leave-balances/${editing.user_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initial_balance: numericBalance, balance_date: balanceDate }),
      });
      setBalances((current) => current.map((item) => item.user_id === updated.user_id ? updated : item));
      setEditing(null);
    } catch (error) {
      Alert.alert("Errore", apiErrorMessage(error, "Impossibile salvare il saldo"));
    } finally {
      setSaving(false);
    }
  };

  if (!currentUser?.is_admin) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Indietro">
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Saldi ferie</Text>
          <Text style={styles.subtitle}>Maturazione automatica: 2,5 giorni al mese</Text>
        </View>
        <View style={{ width: 48 }} />
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primaryDark} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={24} color="#1D4ED8" />
            <Text style={styles.infoText}>
              Inserisci il saldo disponibile all&apos;inizio della data indicata. Dal mese successivo l&apos;app aggiunge 2,5 giorni e scala i giorni di ferie approvate già trascorsi.
            </Text>
          </View>

          {balances.map((item) => (
            <View key={item.user_id} style={styles.userCard}>
              <View style={[styles.roleDot, { backgroundColor: roleColor(item.role) }]} />
              <View style={styles.userContent}>
                <Text style={styles.userName}>{item.user_name}</Text>
                <Text style={styles.userRole}>{item.role}</Text>
                {item.configured ? (
                  <>
                    <View style={styles.balanceRow}>
                      <Text style={styles.balanceLabel}>Residue oggi</Text>
                      <Text style={styles.balanceValue}>{days(item.remaining)}</Text>
                    </View>
                    <Text style={styles.balanceDetails}>
                      Maturate +{days(item.accrued)} · Godute {days(item.used)} · Future {days(item.scheduled)}
                    </Text>
                    <Text style={styles.referenceText}>
                      Saldo iniziale {days(item.initial_balance)} al {formatIsoDateIt(item.balance_date)}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.notConfigured}>Saldo iniziale da impostare</Text>
                )}
              </View>
              <TouchableOpacity style={styles.editButton} onPress={() => openEdit(item)} testID={`leave-balance-${item.user_id}`}>
                <Ionicons name={item.configured ? "pencil" : "add"} size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Saldo ferie</Text>
            <Text style={styles.modalUser}>{editing?.user_name}</Text>
            <Text style={styles.fieldLabel}>Giorni residui iniziali</Text>
            <TextInput
              style={styles.input}
              value={balanceInput}
              onChangeText={(value) => setBalanceInput(value.replace(/[^0-9,.-]/g, ""))}
              placeholder="Es. 18,5"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              testID="leave-balance-input"
            />
            <Text style={styles.fieldLabel}>Saldo valido all&apos;inizio del</Text>
            <TextInput
              style={styles.input}
              value={dateInput}
              onChangeText={(value) => setDateInput(formatDateInputIt(value))}
              placeholder="GG/MM/AAAA"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={10}
              testID="leave-balance-date"
            />
            <Text style={styles.modalNote}>Le ferie approvate a partire da questa data verranno scalate in giorni di calendario.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setEditing(null)} disabled={saving}>
                <Text style={styles.cancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={save} disabled={saving} testID="leave-balance-save">
                {saving ? <ActivityIndicator color={colors.primaryFg} /> : <Text style={styles.saveText}>Salva saldo</Text>}
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
  headerBar: { minHeight: 68, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  backBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  headerTitleWrap: { flex: 1, alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  subtitle: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, paddingBottom: 50 },
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, marginBottom: 16, borderRadius: 15, borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#EFF6FF" },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  userCard: { flexDirection: "row", alignItems: "flex-start", gap: 11, padding: 15, marginBottom: 10, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  roleDot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
  userContent: { flex: 1, minWidth: 0 },
  userName: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  userRole: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  balanceRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 11 },
  balanceLabel: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  balanceValue: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  balanceDetails: { fontSize: 11, lineHeight: 16, color: colors.textSecondary, marginTop: 5 },
  referenceText: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
  notConfigured: { fontSize: 12, fontWeight: "700", color: "#A16207", marginTop: 10 },
  editButton: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.primary },
  modalBg: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalCard: { padding: 20, paddingBottom: 30, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.background },
  modalHandle: { alignSelf: "center", width: 46, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  modalUser: { fontSize: 14, color: colors.textSecondary, marginTop: 3, marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: colors.textPrimary, marginBottom: 7 },
  input: { minHeight: 52, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, color: colors.textPrimary, fontSize: 16, marginBottom: 14 },
  modalNote: { fontSize: 11, lineHeight: 16, color: colors.textSecondary, marginBottom: 18 },
  modalActions: { flexDirection: "row", gap: 10 },
  cancelButton: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  cancelText: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  saveButton: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.primary },
  saveText: { fontSize: 14, fontWeight: "800", color: colors.primaryFg },
});

