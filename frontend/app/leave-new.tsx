import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@/src/context/UserContext";
import { colors } from "@/src/theme";
import { apiErrorMessage, apiRequest } from "@/src/api";
import { DateRangeCalendar } from "@/src/components/DateRangeCalendar";
import { formatDateInputIt, formatIsoDateIt, parseDateInputIt } from "@/src/utils/dates";

export default function LeaveNewScreen() {
  const { currentUser } = useUser();
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const submit = async () => {
    if (!currentUser) return;
    const startIso = parseDateInputIt(startDate);
    const endIso = parseDateInputIt(endDate);
    if (!startIso || !endIso) {
      Alert.alert("Errore", "Inserisci le date nel formato GG/MM/AAAA");
      return;
    }
    if (startIso > endIso) {
      Alert.alert("Errore", "La data di inizio deve essere precedente a quella di fine");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentUser.id,
          start_date: startIso,
          end_date: endIso,
          reason,
        }),
      });
      Alert.alert("Richiesta inviata", "L'amministratore riceverà la tua richiesta", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert("Errore", apiErrorMessage(e, "Invio fallito"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentUser) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Richiesta ferie</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.label}>Periodo richiesto</Text>
          <TouchableOpacity style={styles.calendarBtn} onPress={() => setCalendarOpen(true)} testID="open-leave-calendar">
            <View style={styles.calendarIcon}>
              <Ionicons name="calendar" size={22} color={colors.primaryFg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.calendarBtnTitle}>Scegli dal calendario</Text>
              <Text style={styles.calendarBtnText}>
                {startDate && endDate ? `${startDate} → ${endDate}` : "Seleziona il primo e l’ultimo giorno"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.dateRow}>
            <View style={styles.dateColumn}>
              <Text style={styles.dateLabel}>Dal</Text>
              <TextInput
                style={styles.input}
                placeholder="GG/MM/AAAA"
                placeholderTextColor={colors.textMuted}
                value={startDate}
                onChangeText={(value) => setStartDate(formatDateInputIt(value))}
                keyboardType="number-pad"
                maxLength={10}
                testID="start-date-input"
              />
            </View>
            <View style={styles.dateColumn}>
              <Text style={styles.dateLabel}>Al</Text>
              <TextInput
                style={styles.input}
                placeholder="GG/MM/AAAA"
                placeholderTextColor={colors.textMuted}
                value={endDate}
                onChangeText={(value) => setEndDate(formatDateInputIt(value))}
                keyboardType="number-pad"
                maxLength={10}
                testID="end-date-input"
              />
            </View>
          </View>

          <Text style={styles.label}>Motivazione (opzionale)</Text>
          <TextInput
            style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
            placeholder="Es: Ferie estive, visita medica..."
            placeholderTextColor={colors.textMuted}
            value={reason}
            onChangeText={setReason}
            multiline
            testID="reason-input"
          />

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={submitting}
            testID="submit-leave"
          >
            <Text style={styles.submitText}>{submitting ? "Invio..." : "Invia richiesta"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <DateRangeCalendar
        visible={calendarOpen}
        startDate={parseDateInputIt(startDate) || ""}
        endDate={parseDateInputIt(endDate) || ""}
        onChange={(startIso, endIso) => {
          setStartDate(formatIsoDateIt(startIso));
          setEndDate(formatIsoDateIt(endIso));
        }}
        onClose={() => setCalendarOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerBar: { flexDirection: "row", alignItems: "center", padding: 12 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  label: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginBottom: 8, marginTop: 16 },
  calendarBtn: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  calendarIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  calendarBtnTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  calendarBtnText: { fontSize: 11, color: colors.textSecondary, marginTop: 3 },
  dateRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  dateColumn: { flex: 1 },
  dateLabel: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.textPrimary },
  submitBtn: { backgroundColor: colors.primary, padding: 16, borderRadius: 14, alignItems: "center", marginTop: 32 },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { color: colors.primaryFg, fontWeight: "700", fontSize: 16 },
});
