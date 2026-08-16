import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@/src/context/UserContext";
import { colors, shiftStyle, roleColor, SHIFT_TYPES } from "@/src/theme";
import { apiErrorMessage, apiRequest } from "@/src/api";
import { formatIsoDateIt, todayIsoLocal } from "@/src/utils/dates";

type Shift = {
  id: string;
  date: string;
  shift_type: string;
  user_id: string;
  user_name: string;
  role: string;
};

type VolunteerAttendance = {
  id: string;
  date: string;
  shift_type: string;
  user_id: string;
  user_name: string;
};

const formatDateIt = (dateStr: string) => {
  const d = new Date(dateStr);
  const days = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

export default function DayDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { currentUser, users } = useUser();
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [volunteerAttendances, setVolunteerAttendances] = useState<VolunteerAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [holiday, setHoliday] = useState<string | null>(null);
  const [volunteerModalType, setVolunteerModalType] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [shiftData, hols, volunteerData] = await Promise.all([
        apiRequest<Shift[]>(`/api/shifts?date_str=${date}`),
        apiRequest<{ date: string; name: string }[]>(`/api/holidays?year=${date?.slice(0, 4)}`),
        apiRequest<VolunteerAttendance[]>(`/api/volunteer-attendances?date_str=${date}`),
      ]);
      setShifts(shiftData);
      setVolunteerAttendances(volunteerData);
      const h = hols.find((x: { date: string; name: string }) => x.date === date);
      setHoliday(h?.name || null);
    } catch (e) {
      Alert.alert("Errore", apiErrorMessage(e, "Impossibile caricare la giornata"));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const requestSwap = (shift: Shift) => {
    router.push({ pathname: "/swap-new", params: { shift_id: shift.id } });
  };

  const manageTeam = (shiftType: string) => {
    if (!currentUser?.is_admin) return;
    router.push({
      pathname: "/shift-new",
      params: {
        date,
        shift_type: shiftType,
      },
    });
  };

  const addVolunteer = async (shiftType: string, userId?: string) => {
    setSubmitting(true);
    try {
      await apiRequest("/api/volunteer-attendances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, shift_type: shiftType, ...(userId ? { user_id: userId } : {}) }),
      });
      setVolunteerModalType(null);
      await load();
    } catch (error) {
      Alert.alert("Errore", apiErrorMessage(error, "Impossibile aggiungere la presenza"));
    } finally {
      setSubmitting(false);
    }
  };

  const removeVolunteer = (attendance: VolunteerAttendance) => {
    const ownAttendance = attendance.user_id === currentUser?.id;
    Alert.alert(
      ownAttendance ? "Ritirati dal turno" : "Rimuovi volontario",
      ownAttendance
        ? `Vuoi ritirare la tua presenza dal turno ${attendance.shift_type}?`
        : `Vuoi rimuovere ${attendance.user_name} dal turno ${attendance.shift_type}?`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: ownAttendance ? "Ritirati" : "Rimuovi",
          style: "destructive",
          onPress: async () => {
            setSubmitting(true);
            try {
              await apiRequest(`/api/volunteer-attendances/${attendance.id}`, { method: "DELETE" });
              await load();
            } catch (error) {
              Alert.alert("Errore", apiErrorMessage(error, "Impossibile rimuovere la presenza"));
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></SafeAreaView>;
  }

  const grouped: Record<string, Shift[]> = Object.fromEntries(
    SHIFT_TYPES.map((type) => [type, []]),
  );
  shifts.forEach((s) => grouped[s.shift_type]?.push(s));
  const volunteersByShift: Record<string, VolunteerAttendance[]> = Object.fromEntries(
    SHIFT_TYPES.map((type) => [type, []]),
  );
  volunteerAttendances.forEach((attendance) => volunteersByShift[attendance.shift_type]?.push(attendance));
  const volunteerUsers = users.filter((user) => user.role === "Volontario");
  const isPast = !!date && date < todayIsoLocal();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="back-btn">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerDate}>{formatIsoDateIt(date)}</Text>
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
        {SHIFT_TYPES.map((type) => {
          const ss = shiftStyle(type);
          const members = grouped[type];
          const volunteers = volunteersByShift[type];
          const myVolunteerAttendance = volunteers.find((attendance) => attendance.user_id === currentUser?.id);
          return (
            <View key={type} style={[styles.shiftBlock, { backgroundColor: ss.bg, borderColor: ss.border }]}>
              <View style={styles.shiftBlockHeader}>
                <View>
                  <Text style={[styles.shiftTitle, { color: ss.text }]}>{type}</Text>
                  <Text style={[styles.shiftTime, { color: ss.text }]}>{ss.time}</Text>
                </View>
                {currentUser?.is_admin && members.length > 0 && (
                  <View style={styles.teamActions}>
                    <TouchableOpacity style={styles.teamActionBtn} onPress={() => manageTeam(type)} testID={`edit-team-${type}`}>
                      <Ionicons name="pencil" size={15} color={ss.text} />
                      <Text style={[styles.teamActionText, { color: ss.text }]}>Modifica</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              {members.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Text style={[styles.emptyText, { color: ss.text }]}>Nessuno assegnato</Text>
                  {currentUser?.is_admin && (
                    <TouchableOpacity style={styles.createTeamBtn} onPress={() => manageTeam(type)} testID={`create-team-${type}`}>
                      <Ionicons name="add" size={16} color={ss.text} />
                      <Text style={[styles.teamActionText, { color: ss.text }]}>Crea squadra</Text>
                    </TouchableOpacity>
                  )}
                </View>
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
                    </View>
                  );
                })
              )}
              {volunteers.length > 0 && (
                <View style={styles.volunteerSection}>
                  <Text style={[styles.volunteerTitle, { color: ss.text }]}>Volontari</Text>
                  {volunteers.map((volunteer) => (
                    <View key={volunteer.id} style={styles.memberRow}>
                      <View style={[styles.memberDot, { backgroundColor: roleColor("Volontario") }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.memberName, { color: ss.text }]}>
                          {volunteer.user_name} {volunteer.user_id === currentUser?.id && "(Tu)"}
                        </Text>
                        <Text style={[styles.memberRole, { color: ss.text, opacity: 0.7 }]}>Presenza aggiuntiva</Text>
                      </View>
                      {(currentUser?.is_admin || volunteer.user_id === currentUser?.id) && !isPast && (
                        <TouchableOpacity
                          style={styles.removeVolunteerBtn}
                          onPress={() => removeVolunteer(volunteer)}
                          disabled={submitting}
                          testID={`remove-volunteer-${volunteer.id}`}
                        >
                          <Ionicons name="trash-outline" size={16} color={ss.text} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )}
              {!isPast && currentUser?.role === "Volontario" && (
                <TouchableOpacity
                  style={[styles.volunteerAction, { borderColor: ss.text }]}
                  onPress={() => myVolunteerAttendance ? removeVolunteer(myVolunteerAttendance) : addVolunteer(type)}
                  disabled={submitting}
                  testID={`volunteer-toggle-${type}`}
                >
                  <Ionicons name={myVolunteerAttendance ? "remove-circle-outline" : "add-circle-outline"} size={17} color={ss.text} />
                  <Text style={[styles.volunteerActionText, { color: ss.text }]}>
                    {myVolunteerAttendance ? "Ritirati dal turno" : "Aggiungimi a questo turno"}
                  </Text>
                </TouchableOpacity>
              )}
              {!isPast && currentUser?.is_admin && (
                <TouchableOpacity
                  style={[styles.volunteerAction, { borderColor: ss.text }]}
                  onPress={() => setVolunteerModalType(type)}
                  testID={`admin-add-volunteer-${type}`}
                >
                  <Ionicons name="person-add-outline" size={17} color={ss.text} />
                  <Text style={[styles.volunteerActionText, { color: ss.text }]}>Aggiungi volontario</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={!!volunteerModalType}
        transparent
        animationType="fade"
        onRequestClose={() => setVolunteerModalType(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Aggiungi volontario</Text>
            <Text style={styles.modalSubtitle}>{volunteerModalType} · {formatIsoDateIt(date)}</Text>
            <ScrollView style={styles.modalList}>
              {volunteerUsers.filter((volunteer) => (
                !volunteerAttendances.some((attendance) => (
                  attendance.shift_type === volunteerModalType && attendance.user_id === volunteer.id
                ))
              )).map((volunteer) => (
                <TouchableOpacity
                  key={volunteer.id}
                  style={styles.volunteerChoice}
                  onPress={() => addVolunteer(volunteerModalType!, volunteer.id)}
                  disabled={submitting}
                >
                  <View style={[styles.memberDot, { backgroundColor: roleColor("Volontario") }]} />
                  <Text style={styles.volunteerChoiceText}>{volunteer.name}</Text>
                  <Ionicons name="add-circle" size={20} color={colors.primaryDark} />
                </TouchableOpacity>
              ))}
              {volunteerUsers.length === 0 && (
                <Text style={styles.noVolunteers}>Crea prima un profilo Volontario da Gestisci utenti.</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setVolunteerModalType(null)}>
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
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  headerBar: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerDate: { fontSize: 13, color: colors.textSecondary },
  headerDay: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, textTransform: "capitalize" },
  holidayBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, marginHorizontal: 16, backgroundColor: "#FEE2E2", borderRadius: 12, marginBottom: 8 },
  holidayText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  shiftBlock: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  shiftBlockHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  shiftTitle: { fontSize: 18, fontWeight: "700" },
  shiftTime: { fontSize: 13, fontWeight: "500", opacity: 0.85, marginTop: 2 },
  teamActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  teamActionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: "rgba(0,0,0,0.12)" },
  teamActionText: { fontSize: 11, fontWeight: "700" },
  emptyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  createTeamBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: "rgba(0,0,0,0.12)" },
  emptyText: { fontSize: 13, opacity: 0.7, fontStyle: "italic" },
  memberRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 10 },
  memberDot: { width: 10, height: 10, borderRadius: 5 },
  memberName: { fontSize: 14, fontWeight: "600" },
  memberRole: { fontSize: 11, marginTop: 2 },
  swapBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  swapBtnText: { fontSize: 11, fontWeight: "600" },
  volunteerSection: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.14)" },
  volunteerTitle: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2, opacity: 0.8 },
  removeVolunteerBtn: { padding: 8, borderRadius: 8, borderWidth: 1, borderColor: "rgba(0,0,0,0.12)" },
  volunteerAction: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  volunteerActionText: { fontSize: 12, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 480, maxHeight: "75%", backgroundColor: colors.surface, borderRadius: 18, padding: 18 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  modalSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4, marginBottom: 14 },
  modalList: { maxHeight: 380 },
  volunteerChoice: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginBottom: 8 },
  volunteerChoiceText: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  noVolunteers: { fontSize: 13, color: colors.textSecondary, textAlign: "center", paddingVertical: 24 },
  modalClose: { marginTop: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.background, alignItems: "center" },
  modalCloseText: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
});
