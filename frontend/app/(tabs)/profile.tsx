import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@/src/context/UserContext";
import { colors, roleColor } from "@/src/theme";
import { apiErrorMessage, apiRequest } from "@/src/api";
import { formatIsoDateIt, todayIsoLocal } from "@/src/utils/dates";

type Stats = {
  total_shifts: number;
  by_type: { Mattina: number; Pomeriggio: number; Trasporti: number; Notte: number };
  total_hours: number;
  holidays_worked: { date: string; name: string; shift: string }[];
};

type Notification = { id: string; title: string; body: string; read: boolean; created_at: string; type: string };
type Leave = { id: string; user_id: string; user_name: string; start_date: string; end_date: string; reason?: string; status: string };

export default function ProfileScreen() {
  const { currentUser, clearUser, users } = useUser();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [myLeaves, setMyLeaves] = useState<Leave[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date();
  const year = today.getFullYear();

  const load = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [statsData, notifData, leavesData] = await Promise.all([
        apiRequest<Stats>(`/api/stats/${currentUser.id}?year=${year}`),
        apiRequest<Notification[]>(`/api/notifications?user_id=${currentUser.id}`),
        apiRequest<Leave[]>(`/api/leaves?user_id=${currentUser.id}`),
      ]);
      setStats(statsData);
      setNotifs(notifData);
      setMyLeaves(leavesData);

      if (currentUser.is_admin) {
        setPendingLeaves(await apiRequest<Leave[]>("/api/leaves?status=pending"));
      }
    } catch (e) {
      Alert.alert("Errore", apiErrorMessage(e, "Impossibile caricare il profilo"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser, year]);

  useFocusEffect(useCallback(() => {
    if (!currentUser) {
      router.replace("/");
      return;
    }
    load();
  }, [load, currentUser, router]));

  const handleLogout = async () => {
    await clearUser();
    router.replace("/");
  };

  const respondLeave = async (id: string, action: "approve" | "reject") => {
    try {
      await apiRequest(`/api/leaves/${id}?action=${action}`, { method: "PATCH" });
      Alert.alert("Successo", `Ferie ${action === "approve" ? "approvate" : "rifiutate"}`);
      load();
    } catch (e) {
      Alert.alert("Errore", apiErrorMessage(e));
    }
  };

  const cancelLeave = (leave: Leave) => {
    Alert.alert(
      "Annulla ferie",
      `Vuoi annullare la richiesta dal ${formatIsoDateIt(leave.start_date)} al ${formatIsoDateIt(leave.end_date)}?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Sì, annulla",
          style: "destructive",
          onPress: async () => {
            try {
              await apiRequest(`/api/leaves/${leave.id}/cancel`, { method: "PATCH" });
              Alert.alert("Ferie annullate", "La richiesta è stata annullata correttamente");
              load();
            } catch (error) {
              Alert.alert("Errore", apiErrorMessage(error, "Impossibile annullare le ferie"));
            }
          },
        },
      ],
    );
  };

  const markAllRead = async () => {
    if (!currentUser) return;
    try {
      await apiRequest(`/api/notifications/mark-all-read?user_id=${currentUser.id}`, { method: "POST" });
      load();
    } catch (error) {
      Alert.alert("Errore", apiErrorMessage(error));
    }
  };

  if (!currentUser) return null;
  if (loading) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></SafeAreaView>;
  }

  const initials = currentUser.name.split(" ").map((n) => n[0]).slice(0, 2).join("");
  const unread = notifs.filter((n) => !n.read);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Profile header */}
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, { backgroundColor: roleColor(currentUser.role) }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.userName}>{currentUser.name}</Text>
            <Text style={styles.userRole}>{currentUser.role}{currentUser.is_admin ? " · Admin" : ""}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} testID="logout-btn">
            <Ionicons name="log-out-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <Text style={styles.sectionTitle}>Statistiche {year}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats?.total_shifts || 0}</Text>
            <Text style={styles.statLabel}>Turni</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats?.total_hours || 0}</Text>
            <Text style={styles.statLabel}>Ore</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats?.holidays_worked.length || 0}</Text>
            <Text style={styles.statLabel}>Festività</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.miniStat, { backgroundColor: "#FEF9C3" }]}>
            <Text style={[styles.miniNumber, { color: "#854D0E" }]}>{stats?.by_type.Mattina || 0}</Text>
            <Text style={[styles.miniLabel, { color: "#854D0E" }]}>Mattine</Text>
          </View>
          <View style={[styles.miniStat, { backgroundColor: "#FFEDD5" }]}>
            <Text style={[styles.miniNumber, { color: "#9A3412" }]}>{stats?.by_type.Pomeriggio || 0}</Text>
            <Text style={[styles.miniLabel, { color: "#9A3412" }]}>Pomeriggi</Text>
          </View>
          <View style={[styles.miniStat, { backgroundColor: "#DBEAFE" }]}>
            <Text style={[styles.miniNumber, { color: "#1E3A8A" }]}>{stats?.by_type.Trasporti || 0}</Text>
            <Text style={[styles.miniLabel, { color: "#1E3A8A" }]}>Trasporti</Text>
          </View>
          <View style={[styles.miniStat, { backgroundColor: "#1F2937" }]}>
            <Text style={[styles.miniNumber, { color: "#FFF" }]}>{stats?.by_type.Notte || 0}</Text>
            <Text style={[styles.miniLabel, { color: "#FFF" }]}>Notti</Text>
          </View>
        </View>

        {/* Holidays worked */}
        {(stats?.holidays_worked.length || 0) > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Festività lavorate</Text>
            <View style={styles.card}>
              {stats!.holidays_worked.map((h, i) => (
                <View key={i} style={[styles.holidayRow, i > 0 && styles.holidayBorder]}>
                  <Ionicons name="star" size={16} color={colors.danger} />
                  <Text style={styles.holidayName}>{h.name}</Text>
                  <Text style={styles.holidayDate}>{formatIsoDateIt(h.date)}</Text>
                </View>
              ))}
              <Text style={styles.holidayNote}>Nel prossimo anno avrai priorità per non lavorarle</Text>
            </View>
          </>
        )}

        {/* Actions */}
        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Azioni</Text>
        <TouchableOpacity style={styles.actionRow} onPress={() => router.push("/leave-new")} testID="action-leave">
          <Ionicons name="airplane-outline" size={22} color={colors.textPrimary} />
          <Text style={styles.actionText}>Richiedi ferie/permesso</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionRow} onPress={() => router.push("/swap-new")} testID="action-swap">
          <Ionicons name="swap-horizontal-outline" size={22} color={colors.textPrimary} />
          <Text style={styles.actionText}>Nuovo scambio turno</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionRow} onPress={() => router.push("/change-pin")} testID="action-change-pin">
          <Ionicons name="keypad-outline" size={22} color={colors.textPrimary} />
          <Text style={styles.actionText}>Cambia PIN personale</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Admin section */}
        {currentUser.is_admin && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Pannello Admin</Text>
            <TouchableOpacity
              style={[styles.actionRow, { backgroundColor: colors.primary }]}
              onPress={() => router.push("/generate-shifts")}
              testID="generate-shifts-btn"
            >
              <Ionicons name="sparkles" size={22} color={colors.primaryFg} />
              <Text style={[styles.actionText, { color: colors.primaryFg, fontWeight: "700" }]}>
                Genera o rigenera turni
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push("/import-shifts")}
              testID="import-shifts-btn"
            >
              <Ionicons name="cloud-upload-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.actionText}>Importa turni del mese</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push("/admin-users")}
              testID="manage-users-btn"
            >
              <Ionicons name="people" size={22} color={colors.textPrimary} />
              <Text style={styles.actionText}>Gestisci utenti</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Cambia amministratore</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {users.filter((u) => u.id !== currentUser.id).map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.actionRow, { paddingVertical: 8, paddingHorizontal: 10, marginBottom: 0, flex: 0 }]}
                  testID={`make-admin-${u.id}`}
                  onPress={() => {
                    Alert.alert("Cambia admin", `Trasferire i diritti di amministratore a ${u.name}? Perderai il ruolo admin.`, [
                      { text: "Annulla", style: "cancel" },
                      {
                        text: "Conferma", style: "destructive",
                        onPress: async () => {
                          try {
                            await apiRequest(`/api/users/${u.id}/admin?value=true`, { method: "PATCH" });
                            Alert.alert("Fatto", `${u.name} è ora amministratore`);
                            await clearUser();
                            router.replace("/");
                          } catch (error) {
                            Alert.alert("Errore", apiErrorMessage(error, "Cambio amministratore non riuscito"));
                          }
                        },
                      },
                    ]);
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textPrimary }}>{u.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {pendingLeaves.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Ferie da approvare ({pendingLeaves.length})</Text>
                {pendingLeaves.map((l) => (
                  <View key={l.id} style={styles.leaveCard}>
                    <Text style={styles.leaveUser}>{l.user_name}</Text>
                    <Text style={styles.leaveDates}>{formatIsoDateIt(l.start_date)} → {formatIsoDateIt(l.end_date)}</Text>
                    {l.reason && <Text style={styles.leaveReason}>“{l.reason}”</Text>}
                    <View style={styles.leaveActions}>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => respondLeave(l.id, "reject")}>
                        <Text style={styles.rejectText}>Rifiuta</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.approveBtn} onPress={() => respondLeave(l.id, "approve")}>
                        <Text style={styles.approveText}>Approva</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* My leaves */}
        {myLeaves.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Le mie richieste ferie</Text>
            {myLeaves.map((l) => (
              <View key={l.id} style={styles.leaveCard}>
                <View style={styles.leaveTop}>
                  <Text style={styles.leaveDates}>{formatIsoDateIt(l.start_date)} → {formatIsoDateIt(l.end_date)}</Text>
                  <View style={[styles.statusPill, leaveStatusStyle(l.status).box]}>
                    <Text style={[styles.statusPillText, leaveStatusStyle(l.status).text]}>
                      {leaveStatusLabel(l.status)}
                    </Text>
                  </View>
                </View>
                {l.reason && <Text style={styles.leaveReason}>“{l.reason}”</Text>}
                {["pending", "approved"].includes(l.status) && l.end_date >= todayIsoLocal() && (
                  <TouchableOpacity style={styles.cancelLeaveBtn} onPress={() => cancelLeave(l)}>
                    <Ionicons name="close-circle-outline" size={17} color={colors.danger} />
                    <Text style={styles.cancelLeaveText}>Annulla richiesta</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </>
        )}

        {/* Notifications */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Notifiche {unread.length > 0 && `(${unread.length})`}</Text>
          {unread.length > 0 && (
            <TouchableOpacity onPress={markAllRead}>
              <Text style={styles.linkText}>Segna tutte come lette</Text>
            </TouchableOpacity>
          )}
        </View>
        {notifs.length === 0 ? (
          <View style={[styles.card, { alignItems: "center", padding: 24 }]}>
            <Text style={styles.muted}>Nessuna notifica</Text>
          </View>
        ) : (
          notifs.slice(0, 10).map((n) => (
            <View key={n.id} style={[styles.notifRow, !n.read && styles.notifUnread]}>
              {!n.read && <View style={styles.unreadDot} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.notifTitle}>{n.title}</Text>
                <Text style={styles.notifBody}>{n.body}</Text>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const leaveStatusLabel = (status: string) => status === "approved" ? "Approvata" : status === "rejected" ? "Rifiutata" : status === "cancelled" ? "Annullata" : "In attesa";
const leaveStatusStyle = (status: string) => {
  if (status === "approved") return { box: { backgroundColor: "#D1FAE5" }, text: { color: "#065F46" } };
  if (status === "rejected") return { box: { backgroundColor: "#FEE2E2" }, text: { color: "#991B1B" } };
  if (status === "cancelled") return { box: { backgroundColor: "#E4E4E7" }, text: { color: "#52525B" } };
  return { box: { backgroundColor: "#FEF3C7" }, text: { color: "#92400E" } };
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  profileHeader: { flexDirection: "row", alignItems: "center", paddingVertical: 16, backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFF", fontWeight: "700", fontSize: 18 },
  userName: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
  userRole: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  logoutBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginTop: 24, marginBottom: 10 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 10 },
  linkText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  statCard: { flex: 1, padding: 16, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  statNumber: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: "500" },
  miniStat: { flex: 1, padding: 12, borderRadius: 12, alignItems: "center" },
  miniNumber: { fontSize: 18, fontWeight: "700" },
  miniLabel: { fontSize: 10, fontWeight: "600", marginTop: 2 },
  card: { backgroundColor: colors.surface, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  holidayRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 8 },
  holidayBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  holidayName: { flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: "600" },
  holidayDate: { fontSize: 12, color: colors.textSecondary },
  holidayNote: { fontSize: 11, color: colors.textSecondary, fontStyle: "italic", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  actionRow: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8, gap: 12 },
  actionText: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  leaveCard: { backgroundColor: colors.surface, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  leaveUser: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  leaveDates: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  leaveReason: { fontSize: 12, color: colors.textSecondary, fontStyle: "italic", marginTop: 6 },
  leaveTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  statusPillText: { fontSize: 11, fontWeight: "700" },
  leaveActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  approveBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center" },
  approveText: { color: colors.primaryFg, fontWeight: "700" },
  rejectBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  rejectText: { color: colors.textPrimary, fontWeight: "600" },
  cancelLeaveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.danger, marginTop: 10 },
  cancelLeaveText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
  notifRow: { flexDirection: "row", alignItems: "flex-start", padding: 12, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 6, gap: 8 },
  notifUnread: { borderColor: colors.primary, backgroundColor: "#FEFCE8" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
  notifTitle: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  notifBody: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  muted: { color: colors.textMuted, fontSize: 13 },
});
