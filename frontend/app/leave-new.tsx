import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@/src/context/UserContext";
import { colors } from "@/src/theme";
import { apiErrorMessage, apiRequest } from "@/src/api";

export default function LeaveNewScreen() {
  const { currentUser } = useUser();
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const formatDateInput = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  };

  const validateDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(year, month - 1, day);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
  };

  const submit = async () => {
    if (!currentUser) return;
    if (!validateDate(startDate) || !validateDate(endDate)) {
      Alert.alert("Errore", "Inserisci le date nel formato AAAA-MM-GG");
      return;
    }
    if (startDate > endDate) {
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
          start_date: startDate,
          end_date: endDate,
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
          <Text style={styles.label}>Data inizio</Text>
          <TextInput
            style={styles.input}
            placeholder="AAAA-MM-GG"
            placeholderTextColor={colors.textMuted}
            value={startDate}
            onChangeText={(value) => setStartDate(formatDateInput(value))}
            keyboardType="number-pad"
            maxLength={10}
            testID="start-date-input"
          />

          <Text style={styles.label}>Data fine</Text>
          <TextInput
            style={styles.input}
            placeholder="AAAA-MM-GG"
            placeholderTextColor={colors.textMuted}
            value={endDate}
            onChangeText={(value) => setEndDate(formatDateInput(value))}
            keyboardType="number-pad"
            maxLength={10}
            testID="end-date-input"
          />

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
  input: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.textPrimary },
  submitBtn: { backgroundColor: colors.primary, padding: 16, borderRadius: 14, alignItems: "center", marginTop: 32 },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { color: colors.primaryFg, fontWeight: "700", fontSize: 16 },
});
