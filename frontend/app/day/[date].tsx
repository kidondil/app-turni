import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@/src/context/UserContext";
import { colors, shiftStyle, roleColor } from "@/src/theme";
import { apiErrorMessage, apiRequest } from "@/src/api";

type Shift = {
  id: string;
  date: string;
  shift_type: string;
  user_id: string;
  user_name: string;
  role: string;
};

const formatDateIt = (dateStr: string) => {
  const d = new Date(dateStr);
  const days = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

export default function DayDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { currentUser } = useUser();
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [holiday, setHoliday] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [shiftData, hols] = await Promise.all([
        apiRequest<Shift[]>(`/api/shifts?date_str=${date}`),
        apiRequest<{ date: string; name: string }[]>(`/api/holidays?year=${date?.slice(0, 4)}`),
      ]);
      setShifts(shiftData);
      const h = hols.find((x: { date: string; name: string }) => x.date === date);
      setHoliday(h?.name || null);
    } catch (e) {
      Alert.alert("Errore", apiErrorMessage(e, "Impossibile caricare la giornata"));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const deleteShift = (id: string) => {
    if (!currentUser?.is_admin) return;
    Alert.alert("Conferma", "Eliminare questo turno?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Elimina", style: "destructive",
        onPress: async () => {
          try {
            await apiRequest(`/api/shifts/${id}`, { method: "DELETE" });
            load();
          } catch (error) {
            Alert.alert("Errore", apiErrorMessage(error, "Eliminazione non riuscita"));
          }
        },
      },
    ]);
  };

  const requestSwap = (shift: Shift) => {
    router.push({ pathname: "/swap-new", params: { shift_id: shift.id } });
  };

  const editShift = (shift: Shift) => {
    if (!currentUser?.is_admin) return;
    router.push({
      pathname: "/shift-new",
      params: {
        mode: "edit",
        shift_id: shift.id,
        date: shift.date,
        shift_type: shift.shift_type,
        user_id: shift.user_id,
      },
    });
  };

  if (loading) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></SafeAreaView>;
  }

  const grouped: Record<string, Shift[]> = { Mattina: [], Pomeriggio: [], Notte: [] };
  shifts.forEach((s) => grouped[s.shift_type]?.push(s));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="back-btn">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerDate}>{date}</Text>
          <Text style={styles.headerDay}>{date ? formatDateIt(date) : ""}</Text>
        </View>
      </View>

      {holiday && (
        <View style={styles.holidayBanner}>
          <Ionicons name="star" size={16} color={colors.danger} />
          <Text style={styles.holidayText}>Festività: {holiday}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>
        {(["Mattina", "Pomeriggio", "Notte"] as const).map((type) => {
          const ss = shiftStyle(type);
          const members = grouped[type];
          return (
            <View key={type} style={[styles.shiftBlock, { backgroundColor: ss.bg, borderColor: ss.border }]}>
              <View style={styles.shiftBlockHeader}>
                <Text style={[styles.shiftTitle, { color: ss.text }]}>{type}</Text>
                <Text style={[styles.shiftTime, { color: ss.text }]}>{ss.time}</Text>
              </View>
              {members.length === 0 ? (
                <Text style={[styles.emptyText, { color: ss.text }]}>Nessuno assegnato</Text>
              ) : (
                members.map((m) => {
                  const isMe = m.user_id === currentUser?.id;
                  const canSwap = currentUser && isMe && new Date(m.date) > new Date();
                  return (
                    <View key={m.id} style={styles.memberRow}>
                      <View style={[styles.memberDot, { backgroundColor: roleColor(m.role) }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.memberName, { color: ss.text }]}>
                          {m.user_name} {isMe && "(Tu)"}
                        </Text>
                        <Text style={[styles.memberRole, { color: ss.text, opacity: 0.7 }]}>{m.role}</Text>
                      </View>
                      {canSwap && (
                        <TouchableOpacity style={styles.swapBtn} onPress={() => requestSwap(m)} testID={`swap-${m.id}`}>
                          <Ionicons name="swap-horizontal" size={14} color={ss.text} />
                          <Text style={[styles.swapBtnText, { color: ss.text }]}>Scambia</Text>
                        </TouchableOpacity>
                      )}
                      {currentUser?.is_admin && (
                        <>
                          <TouchableOpacity style={styles.iconBtn} onPress={() => editShift(m)} testID={`edit-${m.id}`}>
                            <Ionicons name="pencil" size={16} color={ss.text} />
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.iconBtn} onPress={() => deleteShift(m.id)} testID={`del-${m.id}`}>
                            <Ionicons name="trash-outline" size={16} color={ss.text} />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          );
        })}

        {currentUser?.is_admin && (
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push({ pathname: "/shift-new", params: { date } })} testID="add-shift-btn">
            <Ionicons name="add-circle" size={20} color={colors.primaryFg} />
            <Text style={styles.addBtnText}>Aggiungi turno</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  headerBar: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerDate: { fontSize: 13, color: colors.textSecondary },
  headerDay: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, textTransform: "capitalize" },
  holidayBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, marginHorizontal: 16, backgroundColor: "#FEE2E2", borderRadius: 12, marginBottom: 8 },
  holidayText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  shiftBlock: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  shiftBlockHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  shiftTitle: { fontSize: 18, fontWeight: "700" },
  shiftTime: { fontSize: 13, fontWeight: "500", opacity: 0.85 },
  emptyText: { fontSize: 13, opacity: 0.7, fontStyle: "italic" },
  memberRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 10 },
  memberDot: { width: 10, height: 10, borderRadius: 5 },
  memberName: { fontSize: 14, fontWeight: "600" },
  memberRole: { fontSize: 11, marginTop: 2 },
  swapBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  swapBtnText: { fontSize: 11, fontWeight: "600" },
  iconBtn: { padding: 6 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, padding: 14, borderRadius: 14, gap: 8, marginTop: 8 },
  addBtnText: { color: colors.primaryFg, fontWeight: "700", fontSize: 14 },
});
