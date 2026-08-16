import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser, User } from "@/src/context/UserContext";
import { colors, roleColor, shiftStyle, SHIFT_TYPES, ShiftType } from "@/src/theme";
import { apiErrorMessage, apiRequest } from "@/src/api";

type Role = User["role"];
type Shift = {
  id: string;
  date: string;
  shift_type: ShiftType;
  user_id: string;
  user_name: string;
  role: Role;
};

const ROLES: Role[] = ["Autista", "Capoturno", "Soccorritore"];
const EMPTY_TEAM: Record<Role, string | null> = {
  Autista: null,
  Capoturno: null,
  Soccorritore: null,
};

export default function ShiftNewScreen() {
  const { currentUser, users } = useUser();
  const router = useRouter();
  const params = useLocalSearchParams<{
    date?: string;
    shift_type?: ShiftType;
  }>();

  const date = params.date || new Date().toISOString().slice(0, 10);
  const [shiftType, setShiftType] = useState<ShiftType>(params.shift_type || "Mattina");
  const [selectedByRole, setSelectedByRole] = useState<Record<Role, string | null>>({ ...EMPTY_TEAM });
  const [teamExists, setTeamExists] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingTeam(true);
    apiRequest<Shift[]>(`/api/shifts?date_str=${date}`)
      .then((dayShifts) => {
        if (!active) return;
        const members = dayShifts.filter((shift) => shift.shift_type === shiftType);
        const next = { ...EMPTY_TEAM };
        members.forEach((member) => {
          if (ROLES.includes(member.role)) next[member.role] = member.user_id;
        });
        setSelectedByRole(next);
        setTeamExists(members.length > 0);
      })
      .catch((error) => {
        if (active) Alert.alert("Errore", apiErrorMessage(error, "Impossibile caricare la squadra"));
      })
      .finally(() => {
        if (active) setLoadingTeam(false);
      });
    return () => { active = false; };
  }, [date, shiftType]);

  const selectedUsers = useMemo(
    () => ROLES.map((role) => selectedByRole[role]).filter((id): id is string => !!id),
    [selectedByRole],
  );
  const complete = selectedUsers.length === 3;

  if (!currentUser?.is_admin) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.deniedTitle}>Accesso negato</Text>
      </SafeAreaView>
    );
  }

  const selectUser = (role: Role, userId: string) => {
    setSelectedByRole((current) => ({
      ...current,
      [role]: current[role] === userId ? null : userId,
    }));
  };

  const submit = async () => {
    if (!complete) {
      Alert.alert("Squadra incompleta", "Seleziona una persona per ogni gruppo");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("/api/shift-teams", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, shift_type: shiftType, user_ids: selectedUsers }),
      });
      Alert.alert(
        "Squadra salvata",
        `Il turno ${shiftType.toLowerCase()} del ${date} è stato aggiornato.`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error) {
      Alert.alert("Errore", apiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const deleteTeam = () => {
    Alert.alert(
      "Elimina squadra",
      `Vuoi eliminare tutte le assegnazioni del turno ${shiftType.toLowerCase()} del ${date}?`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: async () => {
            setSubmitting(true);
            try {
              await apiRequest(
                `/api/shift-teams?date_str=${date}&shift_type=${encodeURIComponent(shiftType)}`,
                { method: "DELETE" },
              );
              router.back();
            } catch (error) {
              Alert.alert("Errore", apiErrorMessage(error, "Eliminazione non riuscita"));
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>{teamExists ? "Modifica squadra" : "Crea squadra"}</Text>
          <Text style={styles.subtitle}>{date}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.label}>Turno</Text>
        <View style={styles.shiftTypesRow}>
          {SHIFT_TYPES.map((type) => {
            const palette = shiftStyle(type);
            const selected = type === shiftType;
            return (
              <TouchableOpacity
                key={type}
                style={[
                  styles.shiftBtn,
                  {
                    backgroundColor: palette.bg,
                    borderColor: selected ? colors.secondary : palette.border,
                    borderWidth: selected ? 2 : 1,
                  },
                ]}
                onPress={() => setShiftType(type)}
                testID={`shift-type-${type}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.shiftBtnText, { color: palette.text }]}>{type}</Text>
                  <Text style={[styles.shiftBtnTime, { color: palette.text }]}>{palette.time}</Text>
                </View>
                {selected && <Ionicons name="checkmark-circle" size={22} color={palette.text} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.teamHeading}>
          <View>
            <Text style={styles.label}>Componi la squadra</Text>
            <Text style={styles.helpText}>Scegli una persona per ciascun gruppo.</Text>
          </View>
          <View style={[styles.counter, complete && styles.counterComplete]}>
            <Text style={[styles.counterText, complete && styles.counterTextComplete]}>{selectedUsers.length}/3</Text>
          </View>
        </View>

        {loadingTeam ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : (
          ROLES.map((role) => {
            const roleUsers = users.filter((user) => user.role === role);
            const selectedId = selectedByRole[role];
            return (
              <View key={role} style={styles.roleCard}>
                <View style={styles.roleHeader}>
                  <View style={[styles.roleDot, { backgroundColor: roleColor(role) }]} />
                  <Text style={styles.roleTitle}>{role}</Text>
                  <Ionicons
                    name={selectedId ? "checkmark-circle" : "ellipse-outline"}
                    size={20}
                    color={selectedId ? roleColor(role) : colors.textMuted}
                  />
                </View>
                <View style={styles.userGrid}>
                  {roleUsers.map((user) => {
                    const selected = user.id === selectedId;
                    return (
                      <TouchableOpacity
                        key={user.id}
                        style={[
                          styles.userChip,
                          selected && {
                            backgroundColor: roleColor(role),
                            borderColor: roleColor(role),
                          },
                        ]}
                        onPress={() => selectUser(role, user.id)}
                        testID={`user-pick-${user.id}`}
                      >
                        <Text style={[styles.userChipText, selected && styles.userChipTextSelected]}>
                          {user.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}

        <TouchableOpacity
          style={[styles.submitBtn, (!complete || submitting || loadingTeam) && styles.disabled]}
          onPress={submit}
          disabled={!complete || submitting || loadingTeam}
          testID="submit-team"
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryFg} />
          ) : (
            <>
              <Ionicons name="people" size={20} color={colors.primaryFg} />
              <Text style={styles.submitText}>{teamExists ? "Salva modifiche" : "Crea squadra"}</Text>
            </>
          )}
        </TouchableOpacity>

        {teamExists && (
          <TouchableOpacity
            style={[styles.deleteBtn, submitting && styles.disabled]}
            onPress={deleteTeam}
            disabled={submitting}
            testID="delete-team"
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
            <Text style={styles.deleteText}>Elimina tutta la squadra</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  deniedTitle: { margin: 24, fontSize: 20, fontWeight: "700", color: colors.textPrimary },
  headerBar: { flexDirection: "row", alignItems: "center", padding: 12 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, alignItems: "center" },
  title: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  subtitle: { marginTop: 2, fontSize: 12, color: colors.textSecondary },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginBottom: 8, marginTop: 16 },
  shiftTypesRow: { gap: 8 },
  shiftBtn: { padding: 14, borderRadius: 12, flexDirection: "row", alignItems: "center" },
  shiftBtnText: { fontSize: 15, fontWeight: "700" },
  shiftBtnTime: { fontSize: 12, opacity: 0.85, marginTop: 2 },
  teamHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 8 },
  helpText: { fontSize: 12, color: colors.textSecondary },
  counter: { minWidth: 42, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  counterComplete: { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" },
  counterText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  counterTextComplete: { color: "#166534" },
  roleCard: { marginTop: 12, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16 },
  roleHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  roleDot: { width: 10, height: 10, borderRadius: 5 },
  roleTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  userGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  userChip: { paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.background, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  userChipText: { color: colors.textPrimary, fontWeight: "600", fontSize: 12 },
  userChipTextSelected: { color: "#FFFFFF" },
  submitBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: colors.primary, padding: 16, borderRadius: 14, marginTop: 24 },
  submitText: { color: colors.primaryFg, fontWeight: "700", fontSize: 16 },
  deleteBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7, padding: 14, marginTop: 10 },
  deleteText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
  disabled: { opacity: 0.4 },
});
