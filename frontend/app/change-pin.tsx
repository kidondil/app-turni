import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiErrorMessage, apiRequest } from "@/src/api";
import { useUser } from "@/src/context/UserContext";
import { colors } from "@/src/theme";

const sanitizePin = (value: string) => value.replace(/\D/g, "").slice(0, 6);

export default function ChangePinScreen() {
  const router = useRouter();
  const { currentUser, replaceSessionToken } = useUser();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!currentUser) router.replace("/");
  }, [currentUser, router]);

  const submit = async () => {
    if (!/^\d{4,6}$/.test(currentPin) || !/^\d{4,6}$/.test(newPin)) {
      Alert.alert("PIN non valido", "Ogni PIN deve contenere da 4 a 6 cifre");
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert("PIN diversi", "La conferma non coincide con il nuovo PIN");
      return;
    }
    if (newPin === currentPin) {
      Alert.alert("PIN invariato", "Scegli un PIN diverso da quello attuale");
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiRequest<{ ok: boolean; token: string }>("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
      });
      await replaceSessionToken(result.token);
      Alert.alert("PIN aggiornato", "Il nuovo PIN è già attivo", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert("Modifica non riuscita", apiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentUser) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cambia PIN</Text>
        <View style={styles.headerButton} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.content}>
        <Text style={styles.help}>Il PIN protegge il tuo profilo e le operazioni effettuate a tuo nome.</Text>
        <TextInput
          style={styles.input}
          value={currentPin}
          onChangeText={(value) => setCurrentPin(sanitizePin(value))}
          placeholder="PIN attuale"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          autoFocus
          testID="current-pin"
        />
        <TextInput
          style={styles.input}
          value={newPin}
          onChangeText={(value) => setNewPin(sanitizePin(value))}
          placeholder="Nuovo PIN (4–6 cifre)"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          testID="new-pin"
        />
        <TextInput
          style={styles.input}
          value={confirmPin}
          onChangeText={(value) => setConfirmPin(sanitizePin(value))}
          placeholder="Conferma nuovo PIN"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          testID="confirm-pin"
        />
        <TouchableOpacity style={[styles.submit, submitting && styles.disabled]} onPress={submit} disabled={submitting} testID="change-pin-submit">
          {submitting ? <ActivityIndicator color={colors.primaryFg} /> : <Text style={styles.submitText}>Aggiorna PIN</Text>}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", padding: 12 },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  content: { flex: 1, padding: 18 },
  help: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 18 },
  input: { backgroundColor: colors.surface, borderRadius: 12, padding: 15, borderWidth: 1, borderColor: colors.border, fontSize: 16, color: colors.textPrimary, marginBottom: 11, textAlign: "center", letterSpacing: 3 },
  submit: { marginTop: 8, padding: 16, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center" },
  submitText: { color: colors.primaryFg, fontWeight: "700", fontSize: 15 },
  disabled: { opacity: 0.5 },
});
