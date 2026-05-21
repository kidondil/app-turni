import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@/src/context/UserContext";
import { colors, shiftStyle, API_URL } from "@/src/theme";

type Shift = { id: string; date: string; shift_type: string; user_id: string; user_name: string; role: string };

export default function SwapNewScreen() {
  const { currentUser, users } = useUser();
  const router = useRouter();
  const params = useLocalSearchParams<{ shift_id?: string }>();
  const [myShifts, setMyShifts] = useState<Shift[]>([]);
  const [selectedShift, setSelectedShift] = useState<string | null>(params.shift_id || null);
  const [selectedColleague, setSelectedColleague] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!currentUser) { router.replace("/"); return; }
    (async () => {
      const res = await fetch(`${API_URL}/api/shifts?user_id=${currentUser.id}`);
      const data: Shift[] = await res.json();
      const today = new Date().toISOString().slice(0, 10);
      setMyShifts(data.filter((s) => s.date >= today));
    })();
  }, [currentUser, router]);

  const colleagues = users.filter((u) => u.role === currentUser?.role && u.id !== currentUser?.id);
  const shift = myShifts.find((s) => s.id === selectedShift);

  const submit = async () => {
    if (!selectedShift || !selectedColleague || !currentUser) {
      Alert.alert("Errore", "Seleziona turno e collega");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/swaps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_user_id: currentUser.id,
          to_user_id: selectedColleague,
          shift_id: selectedShift,
          message,
        }),
      });
      if (res.ok) {
        Alert.alert("Richiesta inviata", "Il collega riceverà una notifica", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } else {
        const err = await res.json();
        Alert.alert("Errore", err.detail || "Invio fallito");
      }
    } catch (e) {
      Alert.alert("Errore", "Invio fallito");
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
          <Text style={styles.title}>Nuova richiesta</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.label}>Il tuo turno da scambiare</Text>
          {myShifts.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.muted}>Nessun turno futuro disponibile</Text></View>
          ) : (
            myShifts.map((s) => {
              const ss = shiftStyle(s.shift_type);
              const sel = s.id === selectedShift;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.shiftOption, { backgroundColor: ss.bg, borderColor: sel ? colors.secondary : ss.border, borderWidth: sel ? 2 : 1 }]}
                  onPress={() => setSelectedShift(s.id)}
                  testID={`shift-opt-${s.id}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.shiftDate, { color: ss.text }]}>{s.date}</Text>
                    <Text style={[styles.shiftType, { color: ss.text }]}>{s.shift_type} · {ss.time}</Text>
                  </View>
                  {sel && <Ionicons name="checkmark-circle" size={22} color={ss.text} />}
                </TouchableOpacity>
              );
            })
          )}

          <Text style={[styles.label, { marginTop: 24 }]}>Collega ({currentUser.role})</Text>
          <View style={styles.colleaguesGrid}>
            {colleagues.map((c) => {
              const sel = c.id === selectedColleague;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.colleagueChip, sel && styles.colleagueChipActive]}
                  onPress={() => setSelectedColleague(c.id)}
                  testID={`colleague-${c.id}`}
                >
                  <Text style={[styles.colleagueText, sel && styles.colleagueTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, { marginTop: 24 }]}>Messaggio (opzionale)</Text>
          <TextInput
            style={styles.input}
            placeholder="Es: Ho un impegno familiare, grazie!"
            placeholderTextColor={colors.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
            testID="message-input"
          />

          <TouchableOpacity
            style={[styles.submitBtn, (!selectedShift || !selectedColleague || submitting) && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={!selectedShift || !selectedColleague || submitting}
            testID="submit-swap"
          >
            <Text style={styles.submitText}>{submitting ? "Invio..." : "Invia richiesta"}</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
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
  label: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginBottom: 10 },
  emptyCard: { backgroundColor: colors.surface, padding: 20, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  muted: { color: colors.textMuted },
  shiftOption: { padding: 14, borderRadius: 14, marginBottom: 8, flexDirection: "row", alignItems: "center" },
  shiftDate: { fontSize: 13, fontWeight: "500", opacity: 0.85 },
  shiftType: { fontSize: 15, fontWeight: "700", marginTop: 2 },
  colleaguesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  colleagueChip: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  colleagueChipActive: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  colleagueText: { color: colors.textPrimary, fontWeight: "600", fontSize: 13 },
  colleagueTextActive: { color: colors.secondaryFg },
  input: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.textPrimary, minHeight: 80, textAlignVertical: "top" },
  submitBtn: { backgroundColor: colors.primary, padding: 16, borderRadius: 14, alignItems: "center", marginTop: 24 },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { color: colors.primaryFg, fontWeight: "700", fontSize: 16 },
});
