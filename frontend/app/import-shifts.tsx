import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiErrorMessage, apiRequest } from "@/src/api";
import { useUser, User } from "@/src/context/UserContext";
import { colors, monthNamesIt, SHIFT_TYPES, shiftStyle } from "@/src/theme";
import { formatIsoDateIt } from "@/src/utils/dates";
import {
  normalizeImportName,
  parseShiftImportCsv,
  ShiftImportRow,
} from "@/src/utils/shiftImport";

type ImportTeam = {
  date: string;
  shift_type: string;
  user_ids: string[];
};

type ImportResult = {
  month: string;
  teams: number;
  assignments: number;
  replaced: boolean;
};

const TEMPLATE = [
  "Data;Turno;Autista;Capoturno;Soccorritore",
  "01/09/2026;Mattina;Cognome Nome;Cognome Nome;Cognome Nome",
  "01/09/2026;Pomeriggio;Cognome Nome;Cognome Nome;Cognome Nome",
  "01/09/2026;Trasporti;Cognome Nome;Cognome Nome;Cognome Nome",
  "01/09/2026;Notte;Cognome Nome;Cognome Nome;Cognome Nome",
].join("\r\n");

const roleFields: { field: "autista" | "capoturno" | "soccorritore"; role: User["role"] }[] = [
  { field: "autista", role: "Autista" },
  { field: "capoturno", role: "Capoturno" },
  { field: "soccorritore", role: "Soccorritore" },
];

export default function ImportShiftsScreen() {
  const { currentUser, users } = useUser();
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [replaceMonth, setReplaceMonth] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const parsed = useMemo(() => parseShiftImportCsv(csvText), [csvText]);
  const validation = useMemo(() => {
    const errors = [...parsed.errors];
    const lookup = new Map(users.map((user) => [normalizeImportName(user.name), user]));
    const teams: ImportTeam[] = [];
    parsed.rows.forEach((row) => {
      const selected: User[] = [];
      roleFields.forEach(({ field, role }) => {
        const name = row[field];
        const user = lookup.get(normalizeImportName(name));
        if (!user) {
          errors.push(`Riga ${row.line}: “${name}” non è presente nell'app`);
        } else if (user.role !== role) {
          errors.push(`Riga ${row.line}: ${name} appartiene al gruppo ${user.role}, non ${role}`);
        } else {
          selected.push(user);
        }
      });
      if (selected.length === 3) {
        teams.push({
          date: row.date,
          shift_type: row.shift_type,
          user_ids: selected.map((user) => user.id),
        });
      }
    });

    const months = new Set(parsed.rows.map((row) => row.date.slice(0, 7)));
    if (months.size > 1) errors.push("Il file deve contenere un solo mese");
    return { errors: [...new Set(errors)], teams };
  }, [parsed, users]);

  const rowsByDate = useMemo(() => {
    const grouped = new Map<string, ShiftImportRow[]>();
    parsed.rows.forEach((row) => {
      const rows = grouped.get(row.date) || [];
      rows.push(row);
      grouped.set(row.date, rows);
    });
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [parsed.rows]);

  const countByType = useMemo(() => Object.fromEntries(
    SHIFT_TYPES.map((type) => [type, parsed.rows.filter((row) => row.shift_type === type).length]),
  ), [parsed.rows]);

  const monthLabel = useMemo(() => {
    const monthString = parsed.rows[0]?.date.slice(0, 7);
    if (!monthString) return "";
    const [year, month] = monthString.split("-").map(Number);
    return `${monthNamesIt[month - 1]} ${year}`;
  }, [parsed.rows]);

  if (!currentUser?.is_admin) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.title}>Accesso riservato all’amministratore</Text>
      </SafeAreaView>
    );
  }

  const chooseFile = () => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      Alert.alert("Disponibile sul sito", "Per importare il CSV apri l’app dal browser.");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setFileName(file.name);
      setCsvText(await file.text());
    };
    input.click();
  };

  const downloadTemplate = () => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const blob = new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "modello-importazione-turni.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const result = await apiRequest<ImportResult>("/api/shifts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teams: validation.teams, replace_month: replaceMonth }),
      });
      Alert.alert(
        "Importazione completata",
        `${result.teams} squadre e ${result.assignments} assegnazioni sono state salvate.`,
        [{ text: "Apri calendario", onPress: () => router.replace("/(tabs)/calendar") }],
      );
    } catch (error) {
      Alert.alert("Importazione non riuscita", apiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmImport = () => {
    if (validation.errors.length > 0 || validation.teams.length === 0) return;
    Alert.alert(
      replaceMonth ? `Sostituire ${monthLabel}?` : `Aggiornare ${monthLabel}?`,
      replaceMonth
        ? "Tutti i turni già presenti nel mese verranno eliminati e sostituiti dal file. Ferie e utenti non vengono cancellati."
        : "Saranno aggiornate soltanto le date e i turni presenti nel file; gli altri resteranno invariati.",
      [
        { text: "Annulla", style: "cancel" },
        { text: replaceMonth ? "Sostituisci mese" : "Importa", style: replaceMonth ? "destructive" : "default", onPress: submit },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Importa turni</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Ionicons name="document-text-outline" size={24} color={colors.textPrimary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Un file, tutto il mese</Text>
            <Text style={styles.infoText}>Carica un CSV con una riga per ogni squadra. Prima di salvare vedrai l’anteprima e gli eventuali errori.</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={chooseFile} testID="choose-import-file">
          <Ionicons name="cloud-upload-outline" size={21} color={colors.primaryFg} />
          <Text style={styles.primaryButtonText}>{fileName ? "Scegli un altro file" : "Scegli file CSV"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={downloadTemplate}>
          <Ionicons name="download-outline" size={19} color={colors.textPrimary} />
          <Text style={styles.secondaryButtonText}>Scarica modello CSV</Text>
        </TouchableOpacity>
        {fileName && <Text style={styles.fileName}>File: {fileName}</Text>}

        {csvText.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Controllo del file</Text>
            {validation.errors.length > 0 ? (
              <View style={styles.errorCard}>
                <View style={styles.cardHeader}>
                  <Ionicons name="alert-circle" size={20} color="#991B1B" />
                  <Text style={styles.errorTitle}>{validation.errors.length} problemi da correggere</Text>
                </View>
                {validation.errors.slice(0, 20).map((error) => (
                  <Text key={error} style={styles.errorText}>• {error}</Text>
                ))}
                {validation.errors.length > 20 && (
                  <Text style={styles.errorText}>…e altri {validation.errors.length - 20} problemi</Text>
                )}
              </View>
            ) : (
              <View style={styles.successCard}>
                <Ionicons name="checkmark-circle" size={22} color="#047857" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.successTitle}>File valido: {monthLabel}</Text>
                  <Text style={styles.successText}>{parsed.rows.length} squadre · {parsed.rows.length * 3} assegnazioni</Text>
                </View>
              </View>
            )}

            <View style={styles.counters}>
              {SHIFT_TYPES.map((type) => {
                const palette = shiftStyle(type);
                return (
                  <View key={type} style={[styles.counter, { backgroundColor: palette.bg, borderColor: palette.border }]}>
                    <Text style={[styles.counterNumber, { color: palette.text }]}>{countByType[type] || 0}</Text>
                    <Text style={[styles.counterLabel, { color: palette.text }]}>{type}</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.modeCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modeTitle}>Sostituisci tutto il mese</Text>
                <Text style={styles.modeText}>
                  {replaceMonth
                    ? "I turni esistenti del mese saranno sostituiti dal file."
                    : "Aggiorna solo le squadre presenti nel file."}
                </Text>
              </View>
              <Switch
                value={replaceMonth}
                onValueChange={setReplaceMonth}
                trackColor={{ false: colors.borderStrong, true: colors.primaryDark }}
                thumbColor={colors.surface}
              />
            </View>

            <Text style={styles.sectionTitle}>Anteprima</Text>
            {rowsByDate.map(([date, rows]) => (
              <View key={date} style={styles.dayCard}>
                <Text style={styles.dayTitle}>{formatIsoDateIt(date)}</Text>
                {rows.map((row) => {
                  const palette = shiftStyle(row.shift_type);
                  return (
                    <View key={`${row.date}-${row.shift_type}`} style={styles.previewRow}>
                      <View style={[styles.shiftBadge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
                        <Text style={[styles.shiftBadgeText, { color: palette.text }]}>{row.shift_type}</Text>
                      </View>
                      <Text style={styles.previewNames} numberOfLines={2}>
                        {row.autista} · {row.capoturno} · {row.soccorritore}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}

            <TouchableOpacity
              style={[styles.importButton, (validation.errors.length > 0 || submitting) && styles.disabled]}
              disabled={validation.errors.length > 0 || submitting}
              onPress={confirmImport}
              testID="confirm-import"
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryFg} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={22} color={colors.primaryFg} />
                  <Text style={styles.importButtonText}>Conferma importazione</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  title: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  headerButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 20, fontWeight: "700", color: colors.textPrimary },
  content: { width: "100%", maxWidth: 900, alignSelf: "center", paddingHorizontal: 16, paddingBottom: 50 },
  infoCard: { flexDirection: "row", gap: 12, padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 14 },
  infoTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginBottom: 3 },
  infoText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  primaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: 13, paddingVertical: 14 },
  primaryButtonText: { color: colors.primaryFg, fontWeight: "700", fontSize: 15 },
  secondaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 13, paddingVertical: 12, marginTop: 8 },
  secondaryButtonText: { color: colors.textPrimary, fontWeight: "600", fontSize: 14 },
  fileName: { color: colors.textSecondary, fontSize: 12, marginTop: 8, textAlign: "center" },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary, marginTop: 24, marginBottom: 10 },
  errorCard: { padding: 14, borderRadius: 14, backgroundColor: "#FEE2E2", borderWidth: 1, borderColor: "#FCA5A5", gap: 4 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 5 },
  errorTitle: { color: "#991B1B", fontWeight: "700", fontSize: 14 },
  errorText: { color: "#991B1B", fontSize: 12, lineHeight: 17 },
  successCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, backgroundColor: "#D1FAE5", borderWidth: 1, borderColor: "#6EE7B7" },
  successTitle: { color: "#065F46", fontWeight: "700", fontSize: 14 },
  successText: { color: "#047857", fontSize: 12, marginTop: 2 },
  counters: { flexDirection: "row", gap: 8, marginTop: 10 },
  counter: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 11, borderWidth: 1 },
  counterNumber: { fontSize: 18, fontWeight: "700" },
  counterLabel: { fontSize: 9, fontWeight: "600", marginTop: 2 },
  modeCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginTop: 12, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  modeTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  modeText: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  dayCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  dayTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginBottom: 6 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 4 },
  shiftBadge: { width: 92, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  shiftBadgeText: { fontSize: 11, fontWeight: "700" },
  previewNames: { flex: 1, color: colors.textSecondary, fontSize: 12 },
  importButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 15, marginTop: 18 },
  importButtonText: { color: colors.primaryFg, fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.45 },
});

