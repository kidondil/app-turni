import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
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

type Notification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};

const dateToStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatDateIt = (d: Date) => {
  const days = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
};

export default function HomeScreen() {
  const { currentUser } = useUser();
  const router = useRouter();
  const [todayShifts, setTodayShifts] = useState<Shift[]>([]);
  const [myShifts, setMyShifts] = useState<Shift[]>([]);
  const [upcoming, setUpcoming] = useState<Shift[]>([]);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date();
  const todayStr = dateToStr(today);

  const load = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [todayData, mineData, notifData] = await Promise.all([
        apiRequest<Shift[]>(`/api/shifts?date_str=${todayStr}`),
        apiRequest<Shift[]>(`/api/shifts?user_id=${currentUser.id}`),
        apiRequest<Notification[]>(`/api/notifications?user_id=${currentUser.id}`),
      ]);
      setTodayShifts(todayData);
      const mineToday = mineData.filter((s) => s.date === todayStr);
      setMyShifts(mineToday);
      const future = mineData.filter((s) => s.date > todayStr).slice(0, 5);
      setUpcoming(future);
      setNotifs(notifData);
    } catch (e) {
      Alert.alert("Errore", apiErrorMessage(e, "Impossibile caricare i turni"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser, todayStr]);

  useFocusEffect(useCallback(() => {
    if (!currentUser) {
      router.replace("/");
      return;
    }
    load();
  }, [currentUser, load, router]));

  const unreadCount = notifs.filter((n) => !n.read).length;

  if (!currentUser) return null;

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const groupedByShift: Record<string, Shift[]> = { Mattina: [], Pomeriggio: [], Notte: [] };
  todayShifts.forEach((s) => groupedByShift[s.shift_type]?.push(s));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Ciao,</Text>
            <Text style={styles.userName}>{currentUser.name.split(" ")[0]}</Text>
            <Text style={styles.dateText}>{formatDateIt(today)}</Text>
          </View>
          <TouchableOpacity style={styles.notifBtn} onPress={() => router.push("/profile")} testID="notif-button">
            <Ionicons name="notifications" size={22} color={colors.textPrimary} />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* My Today's Shift */}
        <Text style={styles.sectionTitle}>{myShifts.length > 1 ? "I miei turni oggi" : "Il mio turno oggi"}</Text>
        {myShifts.length > 0 ? (
          <View style={styles.myShiftsList}>
            {myShifts.map((myShift) => {
              const ss = shiftStyle(myShift.shift_type);
              return (
                <View key={myShift.id} style={[styles.myShiftCard, { backgroundColor: ss.bg, borderColor: ss.border }]}>
                  <View style={styles.myShiftRow}>
                    <View>
                      <Text style={[styles.myShiftType, { color: ss.text }]}>{myShift.shift_type}</Text>
                      <Text style={[styles.myShiftTime, { color: ss.text }]}>{ss.time}</Text>
                    </View>
                    <View style={[styles.roleBadge, { backgroundColor: roleColor(currentUser.role) }]}>
                      <Text style={styles.roleBadgeText}>{currentUser.role}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="cafe-outline" size={28} color={colors.textMuted} />
            <Text style={styles.emptyText}>Riposo oggi</Text>
          </View>
        )}

        {/* Today's Team */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Squadra di oggi</Text>
          <TouchableOpacity onPress={() => router.push(`/day/${todayStr}`)} testID="see-details-today">
            <Text style={styles.linkText}>Dettagli →</Text>
          </TouchableOpacity>
        </View>

        {(["Mattina", "Pomeriggio", "Notte"] as const).map((type) => {
          const ss = shiftStyle(type);
          const members = groupedByShift[type] || [];
          return (
            <View key={type} style={[styles.teamCard, { backgroundColor: ss.bg, borderColor: ss.border }]} testID={`team-${type}`}>
              <View style={styles.teamHeader}>
                <Text style={[styles.teamTitle, { color: ss.text }]}>{type}</Text>
                <Text style={[styles.teamTime, { color: ss.text }]}>{ss.time}</Text>
              </View>
              {members.length === 0 ? (
                <Text style={[styles.teamEmpty, { color: ss.text }]}>Nessuno assegnato</Text>
              ) : (
                members.map((m) => (
                  <View key={m.id} style={styles.teamMember}>
                    <View style={[styles.memberDot, { backgroundColor: roleColor(m.role) }]} />
                    <Text style={[styles.memberName, { color: ss.text }]}>{m.user_name}</Text>
                    <Text style={[styles.memberRole, { color: ss.text, opacity: 0.7 }]}>{m.role}</Text>
                  </View>
                ))
              )}
            </View>
          );
        })}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Prossimi turni</Text>
            {upcoming.map((s) => {
              const d = new Date(s.date);
              const ss = shiftStyle(s.shift_type);
              return (
                <TouchableOpacity key={s.id} style={styles.upcomingCard} onPress={() => router.push(`/day/${s.date}`)}>
                  <View style={[styles.upcomingDot, { backgroundColor: ss.bg, borderColor: ss.border }]}>
                    <Text style={styles.upcomingDay}>{d.getDate()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.upcomingTitle}>{s.shift_type}</Text>
                    <Text style={styles.upcomingSubtitle}>{formatDateIt(d)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              );
            })}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 8, paddingBottom: 20 },
  greeting: { fontSize: 14, color: colors.textSecondary },
  userName: { fontSize: 26, fontWeight: "700", color: colors.textPrimary, letterSpacing: -0.5 },
  dateText: { fontSize: 13, color: colors.textMuted, marginTop: 4, textTransform: "capitalize" },
  notifBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border,
  },
  notifBadge: {
    position: "absolute", top: -2, right: -2, backgroundColor: colors.danger,
    minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  notifBadgeText: { color: "#FFF", fontSize: 10, fontWeight: "700" },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: 12, marginTop: 8 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 12 },
  linkText: { color: colors.primaryFg, fontSize: 14, fontWeight: "600" },
  myShiftCard: { padding: 20, borderRadius: 20, borderWidth: 1 },
  myShiftsList: { gap: 10 },
  myShiftRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  myShiftType: { fontSize: 24, fontWeight: "700" },
  myShiftTime: { fontSize: 14, marginTop: 4, opacity: 0.85 },
  roleBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  roleBadgeText: { color: "#FFF", fontWeight: "600", fontSize: 12 },
  emptyCard: {
    padding: 24, borderRadius: 20, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, alignItems: "center",
  },
  emptyText: { color: colors.textSecondary, marginTop: 8, fontSize: 14, fontWeight: "500" },
  teamCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  teamHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  teamTitle: { fontSize: 16, fontWeight: "700" },
  teamTime: { fontSize: 12, opacity: 0.85, fontWeight: "500" },
  teamEmpty: { fontSize: 13, opacity: 0.7, fontStyle: "italic" },
  teamMember: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  memberDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  memberName: { fontSize: 14, fontWeight: "500", flex: 1 },
  memberRole: { fontSize: 11, fontWeight: "500" },
  upcomingCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface,
    padding: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  upcomingDot: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 12, borderWidth: 1 },
  upcomingDay: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  upcomingTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  upcomingSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2, textTransform: "capitalize" },
});
