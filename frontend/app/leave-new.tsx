import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@/src/context/UserContext";
import { colors } from "@/src/theme";
import { apiErrorMessage, apiRequest } from "@/src/api";
import { DateRangeCalendar } from "@/src/components/DateRangeCalendar";
import { formatDateInputIt, formatIsoDateIt, parseDateInputIt } from "@/src/utils/dates";

export default function LeaveNewScreen() {
  const { currentUser, users } = useUser();
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [absenceType, setAbsenceType] = useState<"Ferie" | "Permesso" | "Malattia">("Ferie");
  const [selectedUserId, setSelectedUserId] = useState(currentUser?.id || "");
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (currentUser && !selectedUserId) setSelectedUserId(currentUser.id);
  }, [currentUser, selectedUserId]);

  const submit = async () => {
    if (!currentUser || !selectedUserId) return;
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
          user_id: selectedUserId,
          start_date: startIso,
          end_date: endIso,
          absence_type: absenceType,
          reason,
        }),
      });
      Alert.alert(absenceType === "Malattia" ? "Malattia registrata" : "Richiesta inviata", absenceType === "Malattia" ? "Il periodo è stato aggiunto al calendario" : "Gli amministratori riceveranno la tua richiesta", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert("Errore", apiErrorMessage(e, "Invio fallito"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentUser) return null;
  const selectableUsers = users.filter((user) => user.role !== "Volontario");
  const selectedUser = selectableUsers.find((user) => user.id === selectedUserId) || currentUser;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Nuova richiesta</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.label}>Tipo di assenza</Text>
          <View style={styles.typeRow}>
            {(["Ferie", "Permesso", "Malattia"] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.typeButton, absenceType === type && styles.typeButtonActive]}
                onPress={() => setAbsenceType(type)}
                testID={`absence-${type.toLowerCase()}`}
              >
                <Ionicons name={type === "Ferie" ? "airplane-outline" : type === "Malattia" ? "medkit-outline" : "time-outline"} size={20} color={absenceType === type ? colors.primaryFg : colors.textSecondary} />
                <Text style={[styles.typeText, absenceType === type && styles.typeTextActive]}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {currentUser.is_admin && (
            <>
              <Text style={styles.label}>Persona interessata</Text>
              <TouchableOpacity style={styles.userPicker} onPress={() => setUserPickerOpen(true)} testID="absence-user-picker">
                <View style={{ flex: 1 }}>
                  <Text style={styles.userPickerName}>{selectedUser.name}</Text>
                  <Text style={styles.userPickerRole}>{selectedUser.role}</Text>
                </View>
                <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </>
          )}

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
            placeholder={absenceType === "Ferie" ? "Es: ferie estive" : absenceType === "Malattia" ? "Nota facoltativa (visibile solo agli autorizzati)" : "Es: visita medica"}
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

      <Modal visible={userPickerOpen} transparent animationType="fade" onRequestClose={() => setUserPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Seleziona persona</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {selectableUsers.map((user) => (
                <TouchableOpacity
                  key={user.id}
                  style={[styles.userOption, user.id === selectedUserId && styles.userOptionActive]}
                  onPress={() => {
                    setSelectedUserId(user.id);
                    setUserPickerOpen(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userPickerName}>{user.name}</Text>
                    <Text style={styles.userPickerRole}>{user.role}</Text>
                  </View>
                  {user.id === selectedUserId && <Ionicons name="checkmark-circle" size={21} color={colors.primaryDark} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setUserPickerOpen(false)}>
              <Text style={styles.modalCloseText}>Chiudi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  typeRow: { flexDirection: "row", gap: 10 },
  typeButton: { flex: 1, minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  typeButtonActive: { borderColor: colors.primaryDark, backgroundColor: colors.primary },
  typeText: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
  typeTextActive: { color: colors.primaryFg },
  userPicker: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  userPickerName: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  userPickerRole: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
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
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 480, backgroundColor: colors.surface, borderRadius: 18, padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: 12 },
  userOption: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 11, borderWidth: 1, borderColor: colors.border, marginBottom: 7 },
  userOptionActive: { borderColor: colors.primaryDark, backgroundColor: "#FEF3C7" },
  modalClose: { alignItems: "center", paddingVertical: 12, marginTop: 6 },
  modalCloseText: { color: colors.textPrimary, fontWeight: "700" },
});
