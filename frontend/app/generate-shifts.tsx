import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiErrorMessage, apiRequest } from "@/src/api";
import { useUser } from "@/src/context/UserContext";
import { colors, monthNamesIt } from "@/src/theme";

type Shift = { id: string };

const pad = (value: number) => String(value).padStart(2, "0");

export default function GenerateShiftsScreen() {
  const { currentUser } = useUser();
  const router = useRouter();
  const nextMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }, []);
  const [year, setYear] = useState(nextMonth.getFullYear());
  const [month, setMonth] = useState(nextMonth.getMonth());
  const [existingCount, setExistingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const monthString = `${year}-${pad(month + 1)}`;

  const loadCount = useCallback(async () => {
    setLoading(true);
    try {
      const shifts = await apiRequest<Shift[]>(`/api/shifts?month=${monthString}`);
      setExistingCount(shifts.length);
    } catch (error) {
      Alert.alert("Errore", apiErrorMessage(error, "Impossibile verificare il mese"));
    } finally {
      setLoading(false);
    }
  }, [monthString]);

  useEffect(() => { loadCount(); }, [loadCount]);

  if (!currentUser?.is_admin) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.title}>Accesso riservato all’amministratore</Text>
      </SafeAreaView>
    );
  }

  const moveMonth = (offset: number) => {
    const selected = new Date(year, month + offset, 1);
    setYear(selected.getFullYear());
    setMonth(selected.getMonth());
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const result = await apiRequest<{ created: number; month: string }>("/api/shifts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month: month + 1, overwrite: existingCount > 0 }),
      });
      setExistingCount(result.created);
      Alert.alert("Turni pronti", `Create ${result.created} assegnazioni per ${result.month}`);
    } catch (error) {
      Alert.alert("Generazione non riuscita", apiErrorMessage(error));
    } finally {
      setGenerating(false);
    }
  };

  const confirmGenerate = () => {
    const replacing = existingCount > 0;
    Alert.alert(
      replacing ? "Sostituire i turni?" : "Generare i turni?",
      replacing
        ? `Le ${existingCount} assegnazioni presenti in ${monthNamesIt[month]} ${year} verranno sostituite solo se la nuova pianificazione può essere completata.`
        : `Verranno creati i turni di ${monthNamesIt[month]} ${year}.`,
      [
        { text: "Annulla", style: "cancel" },
        { text: replacing ? "Sostituisci" : "Genera", style: replacing ? "destructive" : "default", onPress: generate },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Genera turni</Text>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.content}>
        <View style={styles.monthCard}>
          <TouchableOpacity onPress={() => moveMonth(-1)} style={styles.monthButton} testID="previous-generation-month">
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.monthLabelWrap}>
            <Text style={styles.monthLabel}>{monthNamesIt[month]}</Text>
            <Text style={styles.yearLabel}>{year}</Text>
          </View>
          <TouchableOpacity onPress={() => moveMonth(1)} style={styles.monthButton} testID="next-generation-month">
            <Ionicons name="chevron-forward" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="people" size={20} color={colors.textPrimary} />
            <Text style={styles.infoText}>3 persone per turno: una per ogni gruppo</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="moon" size={20} color={colors.textPrimary} />
            <Text style={styles.infoText}>Dopo la notte: smontante e riposo</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="scale" size={20} color={colors.textPrimary} />
            <Text style={styles.infoText}>Rotazione equilibrata di mattine, pomeriggi, notti e festività</Text>
          </View>
        </View>

        <View style={styles.statusCard}>
          {loading ? (
            <ActivityIndicator color={colors.primaryDark} />
          ) : (
            <>
              <Text style={styles.statusNumber}>{existingCount}</Text>
              <Text style={styles.statusLabel}>assegnazioni già presenti</Text>
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.generateButton, (loading || generating) && styles.disabled]}
          onPress={confirmGenerate}
          disabled={loading || generating}
          testID="confirm-generation"
        >
          {generating ? <ActivityIndicator color={colors.primaryFg} /> : <Ionicons name="sparkles" size={21} color={colors.primaryFg} />}
          <Text style={styles.generateText}>
            {generating ? "Generazione in corso..." : existingCount > 0 ? "Rigenera e sostituisci" : "Genera turni"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 24 },
  header: { flexDirection: "row", alignItems: "center", padding: 12 },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  title: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, textAlign: "center" },
  content: { padding: 16, gap: 16 },
  monthCard: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16 },
  monthButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: colors.background },
  monthLabelWrap: { flex: 1, alignItems: "center" },
  monthLabel: { fontSize: 22, fontWeight: "700", color: colors.textPrimary, textTransform: "capitalize" },
  yearLabel: { marginTop: 2, fontSize: 14, color: colors.textSecondary },
  infoCard: { padding: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, gap: 14 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  statusCard: { alignItems: "center", justifyContent: "center", minHeight: 108, backgroundColor: "#FEF9C3", borderRadius: 16, borderWidth: 1, borderColor: "#FDE68A" },
  statusNumber: { fontSize: 30, fontWeight: "800", color: colors.mattinaText },
  statusLabel: { marginTop: 3, color: colors.mattinaText, fontSize: 13 },
  generateButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, padding: 16, borderRadius: 14 },
  generateText: { color: colors.primaryFg, fontWeight: "700", fontSize: 15 },
  disabled: { opacity: 0.5 },
});
