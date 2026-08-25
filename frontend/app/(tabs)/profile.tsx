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
  leave_balance: {
    configured: boolean;
    monthly_accrual: number;
    initial_balance?: number;
    balance_date?: string;
    accrued?: number;
    used?: number;
    scheduled?: number;
    remaining?: number;
    available_after_scheduled?: number;
    as_of?: string;
  };
};

type Leave = { id: string; user_id: string; user_name: string; start_date: string; end_date: string; absence_type?: "Ferie" | "Permesso" | "Malattia"; reason?: string; status: string };

export default function ProfileScreen() {
  const { currentUser, clearUser } = useUser();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [myLeaves, setMyLeaves] = useState<Leave[]>([]);
  const [sicknessLeaves, setSicknessLeaves] = useState<Leave[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date();
  const year = today.getFullYear();

  const load = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [statsData, leavesData, allLeaves] = await Promise.all([
        apiRequest<Stats>(`/api/stats/${currentUser.id}?year=${year}`),
        apiRequest<Leave[]>(`/api/leaves?user_id=${currentUser.id}`),
        currentUser.is_admin ? apiRequest<Leave[]>("/api/leaves") : Promise.resolve([] as Leave[]),
      ]);
      setStats(statsData);
      setMyLeaves(leavesData.filter((leave) => leave.absence_type !== "Malattia"));
      setSicknessLeaves((currentUser.is_admin ? allLeaves : leavesData).filter((leave) => leave.absence_type === "Malattia"));

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
      Alert.alert("Successo", `Richiesta ${action === "approve" ? "approvata" : "rifiutata"}`);
      load();
    } catch (e) {
      Alert.alert("Errore", apiErrorMessage(e));
    }
  };

  const cancelLeave = (leave: Leave) => {
    Alert.alert(
      "Annulla richiesta",
      `Vuoi annullare la richiesta dal ${formatIsoDateIt(leave.start_date)} al ${formatIsoDateIt(leave.end_date)}?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Sì, annulla",
          style: "destructive",
          onPress: async () => {
            try {
              await apiRequest(`/api/leaves/${leave.id}/cancel`, { method: "PATCH" });
              Alert.alert("Richiesta annullata", "La richiesta è stata annullata correttamente");
              load();
            } catch (error) {
              Alert.alert("Errore", apiErrorMessage(error, "Impossibile annullare le ferie"));
            }
          },
        },
      ],
    );
  };

  if (!currentUser) return null;
  if (loading) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></SafeAreaView>;
  }

  const initials = currentUser.name.split(" ").map((n) => n[0]).slice(0, 2).join("");
  const leaveBalance = stats?.leave_balance;
  const formatDays = (value?: number) => (value || 0).toLocaleString("it-IT", { maximumFractionDigits: 1 });

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

        {currentUser.role !== "Volontario" && (
          <View style={styles.leaveBalanceCard}>
            <View style={styles.leaveBalanceHeading}>
              <View style={styles.leaveBalanceIcon}>
                <Ionicons name="sunny-outline" size={25} color="#A16207" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.leaveBalanceTitle}>Ferie residue</Text>
                <Text style={styles.leaveBalanceSubtitle}>+2,5 giorni maturati ogni mese</Text>
              </View>
              {leaveBalance?.configured && (
                <Text style={styles.leaveBalanceNumber}>{formatDays(leaveBalance.remaining)}</Text>
              )}
            </View>
            {leaveBalance?.configured ? (
              <>
                <View style={styles.leaveBalanceDetails}>
                  <View style={styles.leaveBalanceDetail}>
                    <Text style={styles.leaveDetailValue}>+{formatDays(leaveBalance.accrued)}</Text>
                    <Text style={styles.leaveDetailLabel}>Maturate</Text>
                  </View>
                  <View style={styles.leaveBalanceDetail}>
                    <Text style={styles.leaveDetailValue}>{formatDays(leaveBalance.used)}</Text>
                    <Text style={styles.leaveDetailLabel}>Godute</Text>
                  </View>
                  <View style={styles.leaveBalanceDetail}>
                    <Text style={styles.leaveDetailValue}>{formatDays(leaveBalance.scheduled)}</Text>
                    <Text style={styles.leaveDetailLabel}>Programmate</Text>
                  </View>
                </View>
                <Text style={styles.leaveBalanceReference}>
                  Saldo iniziale {formatDays(leaveBalance.initial_balance)} al {formatIsoDateIt(leaveBalance.balance_date)} · Disponibili dopo le ferie future: {formatDays(leaveBalance.available_after_scheduled)}
                </Text>
              </>
            ) : (
              <Text style={styles.leaveBalanceMissing}>
                Il saldo iniziale non è ancora stato inserito dall&apos;amministratore.
              </Text>
            )}
          </View>
        )}

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
        <TouchableOpacity style={styles.actionRow} onPress={() => router.push("/transport-rates")} testID="action-transport-rates">
          <Ionicons name="car-outline" size={22} color={colors.textPrimary} />
          <Text style={styles.actionText}>Tariffario trasporti</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => router.push({ pathname: "/leave-new", params: { type: "Malattia" } })}
          testID="action-sickness"
        >
          <Ionicons name="medkit-outline" size={22} color={colors.textPrimary} />
          <Text style={styles.actionText}>Registra malattia</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        {currentUser.role !== "Volontario" && (
          <>
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
          </>
        )}
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

            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push("/admin-settings")}
              testID="manage-admins-btn"
            >
              <Ionicons name="shield-checkmark-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.actionText}>Gestisci amministratori</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push("/admin-leave-balances")}
              testID="manage-leave-balances-btn"
            >
              <Ionicons name="wallet-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.actionText}>Gestisci saldi ferie</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {pendingLeaves.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Ferie da approvare ({pendingLeaves.length})</Text>
                {pendingLeaves.map((l) => (
                  <View key={l.id} style={styles.leaveCard}>
                    <Text style={styles.leaveUser}>{l.user_name} · {l.absence_type || "Ferie"}</Text>
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

        {/* Sickness is managed separately from holidays */}
        {sicknessLeaves.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
              {currentUser.is_admin ? "Malattie registrate" : "Le mie malattie"}
            </Text>
            {sicknessLeaves.map((l) => (
              <View key={l.id} style={styles.leaveCard}>
                <View style={styles.leaveTop}>
                  <View style={{ flex: 1 }}>
                    {currentUser.is_admin && <Text style={styles.leaveUser}>{l.user_name}</Text>}
                    <Text style={styles.leaveDates}>{formatIsoDateIt(l.start_date)} → {formatIsoDateIt(l.end_date)}</Text>
                  </View>
                  <View style={[styles.statusPill, leaveStatusStyle(l.status).box]}>
                    <Text style={[styles.statusPillText, leaveStatusStyle(l.status).text]}>
                      {leaveStatusLabel(l.status)}
                    </Text>
                  </View>
                </View>
                {l.reason && <Text style={styles.leaveReason}>“{l.reason}”</Text>}
                {l.status === "approved" && l.end_date >= todayIsoLocal() && (
                  <TouchableOpacity style={styles.cancelLeaveBtn} onPress={() => cancelLeave(l)}>
                    <Ionicons name="close-circle-outline" size={17} color={colors.danger} />
                    <Text style={styles.cancelLeaveText}>Annulla malattia</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </>
        )}

        {/* My leaves */}
        {myLeaves.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Le mie richieste ferie</Text>
            {myLeaves.map((l) => (
              <View key={l.id} style={styles.leaveCard}>
                <View style={styles.leaveTop}>
                  <View>
                    <Text style={styles.absenceLabel}>{l.absence_type || "Ferie"}</Text>
                    <Text style={styles.leaveDates}>{formatIsoDateIt(l.start_date)} → {formatIsoDateIt(l.end_date)}</Text>
                  </View>
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
  leaveBalanceCard: { padding: 15, borderRadius: 16, borderWidth: 1, borderColor: "#FDE68A", backgroundColor: "#FFFBEB", marginBottom: 10 },
  leaveBalanceHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  leaveBalanceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FEF3C7" },
  leaveBalanceTitle: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  leaveBalanceSubtitle: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  leaveBalanceNumber: { fontSize: 26, fontWeight: "800", color: "#854D0E" },
  leaveBalanceDetails: { flexDirection: "row", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#FDE68A" },
  leaveBalanceDetail: { flex: 1, alignItems: "center" },
  leaveDetailValue: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  leaveDetailLabel: { fontSize: 10, fontWeight: "600", color: colors.textSecondary, marginTop: 2 },
  leaveBalanceReference: { fontSize: 10, lineHeight: 15, color: colors.textSecondary, textAlign: "center", marginTop: 11 },
  leaveBalanceMissing: { fontSize: 12, lineHeight: 17, color: "#A16207", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#FDE68A" },
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
  absenceLabel: { fontSize: 11, fontWeight: "800", color: colors.textPrimary, textTransform: "uppercase" },
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
