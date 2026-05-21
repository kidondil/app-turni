import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@/src/context/UserContext";
import { colors, API_URL } from "@/src/theme";

type Leave = {
  id: string;
  user_id: string;
  user_name: string;
  start_date: string;
  end_date: string;
  reason?: string;
  status: string;
  created_at: string;
};

export default function LeavesScreen() {
  const { currentUser, users } = useUser();
  const router = useRouter();
  const [tab, setTab] = useState<"mine" | "team" | "pending">("mine");
  const [myLeaves, setMyLeaves] = useState<Leave[]>([]);
  const [teamLeaves, setTeamLeaves] = useState<Leave[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isSameRole = useCallback(
    (uid: string) => {
      if (!currentUser) return false;
      const u = users.find((x) => x.id === uid);
      return !!u && u.role === currentUser.role;
    },
    [currentUser, users]
  );

  const load = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [mineRes, allRes] = await Promise.all([
        fetch(`${API_URL}/api/leaves?user_id=${currentUser.id}`),
        fetch(`${API_URL}/api/leaves`),
      ]);
      const mine: Leave[] = await mineRes.json();
      const all: Leave[] = await allRes.json();
      setMyLeaves(mine);
      // Team = same role colleagues only (excluding self)
      setTeamLeaves(all.filter((l) => l.user_id !== currentUser.id && isSameRole(l.user_id)));
      if (currentUser.is_admin) {
        setPendingLeaves(all.filter((l) => l.status === "pending"));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) { router.replace("/"); return; }
    load();
  }, [currentUser, load, router]);

  const respondLeave = async (id: string, action: "approve" | "reject") => {
    try {
      const res = await fetch(`${API_URL}/api/leaves/${id}?action=${action}`, { method: "PATCH" });
      if (res.ok) {
        Alert.alert("Successo", `Ferie ${action === "approve" ? "approvate" : "rifiutate"}`);
        load();
      }
    } catch (e) {
      Alert.alert("Errore", "Operazione fallita");
    }
  };

  if (!currentUser) return null;
  if (loading) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></SafeAreaView>;
  }

  const list = tab === "mine" ? myLeaves : tab === "team" ? teamLeaves : pendingLeaves;
  const pendingCount = pendingLeaves.length;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Ferie & Permessi</Text>
          <Text style={styles.subtitle}>Gestisci le richieste di assenza</Text>
        </View>
        <TouchableOpacity style={styles.newBtn} onPress={() => router.push("/leave-new")} testID="new-leave-btn">
          <Ionicons name="add" size={18} color={colors.primaryFg} />
          <Text style={styles.newBtnText}>Nuova</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === "mine" && styles.tabActive]}
          onPress={() => setTab("mine")}
          testID="tab-mine"
        >
          <Text style={[styles.tabText, tab === "mine" && styles.tabTextActive]}>Le mie</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "team" && styles.tabActive]}
          onPress={() => setTab("team")}
          testID="tab-team"
        >
          <Text style={[styles.tabText, tab === "team" && styles.tabTextActive]}>Squadra</Text>
        </TouchableOpacity>
        {currentUser.is_admin && (
          <TouchableOpacity
            style={[styles.tab, tab === "pending" && styles.tabActive]}
            onPress={() => setTab("pending")}
            testID="tab-pending"
          >
            <Text style={[styles.tabText, tab === "pending" && styles.tabTextActive]}>
              Da approvare{pendingCount > 0 ? ` (${pendingCount})` : ""}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="airplane-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {tab === "mine" ? "Nessuna richiesta" : tab === "team" ? "Nessuna ferie in squadra" : "Niente da approvare"}
            </Text>
            <Text style={styles.emptyText}>
              {tab === "mine" ? "Inizia richiedendo le tue prime ferie" : "Tutto tranquillo qui"}
            </Text>
          </View>
        ) : (
          list.map((l) => (
            <View key={l.id} style={styles.card} testID={`leave-${l.id}`}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  {tab !== "mine" && <Text style={styles.cardUser}>{l.user_name}</Text>}
                  <Text style={styles.cardDates}>{l.start_date} → {l.end_date}</Text>
                </View>
                <View style={[styles.statusPill, statusStyle(l.status).box]}>
                  <Text style={[styles.statusText, statusStyle(l.status).text]}>{statusLabel(l.status)}</Text>
                </View>
              </View>
              {l.reason && <Text style={styles.cardReason}>"{l.reason}"</Text>}
              {currentUser.is_admin && l.status === "pending" && (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => respondLeave(l.id, "reject")} testID={`reject-${l.id}`}>
                    <Text style={styles.rejectText}>Rifiuta</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => respondLeave(l.id, "approve")} testID={`approve-${l.id}`}>
                    <Text style={styles.approveText}>Approva</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const statusLabel = (s: string) => s === "pending" ? "In attesa" : s === "approved" ? "Approvata" : "Rifiutata";
const statusStyle = (s: string) => {
  if (s === "approved") return { box: { backgroundColor: "#D1FAE5" }, text: { color: "#065F46" } };
  if (s === "rejected") return { box: { backgroundColor: "#FEE2E2" }, text: { color: "#991B1B" } };
  return { box: { backgroundColor: "#FEF3C7" }, text: { color: "#92400E" } };
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  newBtn: { flexDirection: "row", alignItems: "center", backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 4 },
  newBtnText: { color: colors.primaryFg, fontWeight: "700", fontSize: 13 },
  tabBar: { flexDirection: "row", paddingHorizontal: 16, gap: 6, marginBottom: 12 },
  tab: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flex: 1, alignItems: "center" },
  tabActive: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  tabText: { color: colors.textPrimary, fontWeight: "600", fontSize: 12 },
  tabTextActive: { color: colors.secondaryFg },
  scroll: { paddingHorizontal: 16 },
  empty: { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginTop: 12 },
  emptyText: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  card: { backgroundColor: colors.surface, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardUser: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  cardDates: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  cardReason: { fontSize: 13, color: colors.textSecondary, fontStyle: "italic", marginTop: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  approveBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center" },
  approveText: { color: colors.primaryFg, fontWeight: "700" },
  rejectBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  rejectText: { color: colors.textPrimary, fontWeight: "600" },
});
