import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
import { AuthResponse, useUser } from "@/src/context/UserContext";
import { colors, roleColor } from "@/src/theme";

export default function PinSetupScreen() {
  const router = useRouter();
  const { users, loading, initialized, pinSetupRequired, acceptSession, refreshStatus } = useUser();
  const [pins, setPins] = useState<Record<string, string>>({});
  const [bootstrapKey, setBootstrapKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!initialized || !pinSetupRequired) router.replace("/");
  }, [initialized, loading, pinSetupRequired, router]);

  const updatePin = (userId: string, value: string) => {
    setPins((current) => ({
      ...current,
      [userId]: value.replace(/\D/g, "").slice(0, 6),
    }));
  };

  const submit = async () => {
    const incomplete = users.find((user) => !/^\d{4,6}$/.test(pins[user.id] || ""));
    if (incomplete) {
      Alert.alert("PIN mancante", `Imposta un PIN da 4 a 6 cifre per ${incomplete.name}`);
      return;
    }
    if (!bootstrapKey.trim()) {
      Alert.alert("Codice mancante", "Inserisci il codice di migrazione configurato sul server");
      return;
    }
    setSubmitting(true);
    try {
      const auth = await apiRequest<AuthResponse>("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bootstrap_key: bootstrapKey.trim(),
          members: users.map((user) => ({ user_id: user.id, pin: pins[user.id] })),
        }),
      });
      await acceptSession(auth);
      await refreshStatus();
      Alert.alert("PIN configurati", "I dati esistenti sono stati conservati. Hai effettuato l’accesso come amministratore.", [
        { text: "Continua", onPress: () => router.replace("/(tabs)/home") },
      ]);
    } catch (error) {
      Alert.alert("Configurazione non riuscita", apiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !initialized || !pinSetupRequired) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons name="keypad" size={30} color={colors.primaryFg} />
            </View>
            <Text style={styles.title}>Proteggi gli accessi</Text>
            <Text style={styles.subtitle}>
              Questa versione conserva utenti e turni già presenti. Imposta una sola volta il PIN personale di ciascun operatore.
            </Text>
          </View>

          <Text style={styles.keyLabel}>Codice di migrazione</Text>
          <TextInput
            style={styles.keyInput}
            value={bootstrapKey}
            onChangeText={setBootstrapKey}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Configurato in PIN_BOOTSTRAP_KEY"
            placeholderTextColor={colors.textMuted}
            testID="bootstrap-key"
          />

          {users.map((user) => (
            <View key={user.id} style={styles.userRow}>
              <View style={[styles.dot, { backgroundColor: roleColor(user.role) }]} />
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{user.name}</Text>
                <Text style={styles.userRole}>{user.role}{user.is_admin ? " · Admin" : ""}</Text>
              </View>
              <TextInput
                style={styles.pinInput}
                value={pins[user.id] || ""}
                onChangeText={(value) => updatePin(user.id, value)}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                placeholder="PIN"
                placeholderTextColor={colors.textMuted}
                testID={`bootstrap-pin-${user.id}`}
              />
            </View>
          ))}

          <TouchableOpacity style={[styles.submit, submitting && styles.disabled]} onPress={submit} disabled={submitting} testID="bootstrap-submit">
            {submitting ? <ActivityIndicator color={colors.primaryFg} /> : <Text style={styles.submitText}>Salva tutti i PIN</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  scroll: { padding: 16, paddingBottom: 40 },
  header: { alignItems: "center", paddingVertical: 18, paddingHorizontal: 12 },
  iconWrap: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  subtitle: { marginTop: 8, fontSize: 13, lineHeight: 19, color: colors.textSecondary, textAlign: "center" },
  keyLabel: { fontSize: 13, fontWeight: "700", color: colors.textPrimary, marginBottom: 7 },
  keyInput: { padding: 13, marginBottom: 14, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary },
  userRow: { flexDirection: "row", alignItems: "center", padding: 12, marginBottom: 7, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 13, gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  userRole: { marginTop: 2, fontSize: 11, color: colors.textSecondary },
  pinInput: { width: 92, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, textAlign: "center", letterSpacing: 3 },
  submit: { marginTop: 18, padding: 16, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center" },
  submitText: { color: colors.primaryFg, fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
