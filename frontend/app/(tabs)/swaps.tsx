import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@/src/context/UserContext";
import { colors, shiftStyle } from "@/src/theme";
import { apiErrorMessage, apiRequest } from "@/src/api";
import { formatIsoDateIt } from "@/src/utils/dates";

type Swap = {
  id: string;
  from_user_id: string;
  from_user_name: string;
  to_user_id: string;
  to_user_name: string;
  shift_id: string;
  shift_date: string;
  shift_type: string;
  status: string;
  message?: string;
  created_at: string;
};

export default function SwapsScreen() {
  const { currentUser } = useUser();
  const router = useRouter();
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");

  const load = useCallback(async () => {
    if (!currentUser) return;
    try {
      const data = await apiRequest<Swap[]>(`/api/swaps?user_id=${currentUser.id}`);
      setSwaps(data);
    } catch (e) {
      Alert.alert("Errore", apiErrorMessage(e, "Impossibile caricare gli scambi"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser]);

  useFocusEffect(useCallback(() => {
    if (!currentUser) {
      router.replace("/");
      return;
    }
    load();
  }, [load, currentUser, router]));

  const respondSwap = async (id: string, action: "accept" | "reject") => {
    try {
      await apiRequest(`/api/swaps/${id}?action=${action}`, { method: "PATCH" });
      Alert.alert("Successo", `Scambio ${action === "accept" ? "accettato" : "rifiutato"}`);
      load();
    } catch (e) {
      Alert.alert("Errore", apiErrorMessage(e, "Impossibile aggiornare lo scambio"));
    }
  };

  const cancelSwap = (swap: Swap) => {
    Alert.alert(
      "Annulla scambio",
      `Vuoi annullare la richiesta per il turno ${swap.shift_type} del ${formatIsoDateIt(swap.shift_date)}?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Sì, annulla",
          style: "destructive",
          onPress: async () => {
            try {
              await apiRequest(`/api/swaps/${swap.id}?action=cancel`, { method: "PATCH" });
              Alert.alert("Scambio annullato", "La richiesta è stata annullata correttamente");
              load();
            } catch (e) {
              Alert.alert("Errore", apiErrorMessage(e, "Impossibile annullare lo scambio"));
            }
          },
        },
      ],
    );
  };

  if (!currentUser) return null;

  const incoming = swaps.filter((s) => s.to_user_id === currentUser.id);
  const outgoing = swaps.filter((s) => s.from_user_id === currentUser.id);
  const list = tab === "incoming" ? incoming : outgoing;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Scambi turno</Text>
        <Text style={styles.subtitle}>Gestisci le richieste di scambio con i colleghi</Text>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === "incoming" && styles.tabActive]}
          onPress={() => setTab("incoming")}
          testID="tab-incoming"
        >
          <Text style={[styles.tabText, tab === "incoming" && styles.tabTextActive]}>
            Ricevute {incoming.filter((s) => s.status === "pending").length > 0 && `(${incoming.filter((s) => s.status === "pending").length})`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "outgoing" && styles.tabActive]}
          onPress={() => setTab("outgoing")}
          testID="tab-outgoing"
        >
          <Text style={[styles.tabText, tab === "outgoing" && styles.tabTextActive]}>Inviate</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {list.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="swap-horizontal-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Nessuno scambio</Text>
              <Text style={styles.emptyText}>
                {tab === "incoming" ? "Non hai richieste in entrata" : "Non hai inviato richieste"}
              </Text>
              <TouchableOpacity style={styles.newBtn} onPress={() => router.push("/swap-new")} testID="new-swap-btn">
                <Ionicons name="add" size={18} color={colors.primaryFg} />
                <Text style={styles.newBtnText}>Nuovo scambio</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {list.map((s) => {
                const ss = shiftStyle(s.shift_type);
                const isIncoming = s.to_user_id === currentUser.id;
                return (
                  <View key={s.id} style={styles.swapCard} testID={`swap-${s.id}`}>
                    <View style={styles.swapHeader}>
                      <View style={[styles.shiftBadge, { backgroundColor: ss.bg, borderColor: ss.border }]}>
                        <Text style={[styles.shiftBadgeText, { color: ss.text }]}>{s.shift_type}</Text>
                      </View>
                      <View style={[styles.statusBadge, statusStyle(s.status).box]}>
                        <Text style={[styles.statusText, statusStyle(s.status).text]}>{statusLabel(s.status)}</Text>
                      </View>
                    </View>
                    <Text style={styles.swapDate}>{formatIsoDateIt(s.shift_date)}</Text>
                    <Text style={styles.swapPeople}>
                      {isIncoming ? `Da: ${s.from_user_name}` : `A: ${s.to_user_name}`}
                    </Text>
                    {s.message && <Text style={styles.swapMessage}>“{s.message}”</Text>}

                    {isIncoming && s.status === "pending" && (
                      <View style={styles.actions}>
                        <TouchableOpacity
                          style={styles.rejectBtn}
                          onPress={() => respondSwap(s.id, "reject")}
                          testID={`reject-${s.id}`}
                        >
                          <Text style={styles.rejectText}>Rifiuta</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.acceptBtn}
                          onPress={() => respondSwap(s.id, "accept")}
                          testID={`accept-${s.id}`}
                        >
                          <Text style={styles.acceptText}>Accetta</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {!isIncoming && s.status === "pending" && (
                      <TouchableOpacity
                        style={styles.cancelBtn}
                        onPress={() => cancelSwap(s)}
                        testID={`cancel-${s.id}`}
                      >
                        <Ionicons name="close-circle-outline" size={17} color={colors.danger} />
                        <Text style={styles.cancelText}>Annulla richiesta</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
              <TouchableOpacity style={styles.fabBtn} onPress={() => router.push("/swap-new")} testID="fab-new-swap">
                <Ionicons name="add" size={20} color={colors.primaryFg} />
                <Text style={styles.fabText}>Nuova richiesta</Text>
              </TouchableOpacity>
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const statusLabel = (s: string) => s === "pending" ? "In attesa" : s === "accepted" ? "Accettato" : s === "cancelled" ? "Annullato" : "Rifiutato";
const statusStyle = (s: string) => {
  if (s === "accepted") return { box: { backgroundColor: "#D1FAE5" }, text: { color: "#065F46" } };
  if (s === "rejected") return { box: { backgroundColor: "#FEE2E2" }, text: { color: "#991B1B" } };
  if (s === "cancelled") return { box: { backgroundColor: "#E4E4E7" }, text: { color: "#52525B" } };
  return { box: { backgroundColor: "#FEF3C7" }, text: { color: "#92400E" } };
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  tabBar: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  tab: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flex: 1, alignItems: "center" },
  tabActive: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  tabText: { color: colors.textPrimary, fontWeight: "600", fontSize: 13 },
  tabTextActive: { color: colors.secondaryFg },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginTop: 12 },
  emptyText: { fontSize: 13, color: colors.textSecondary, marginTop: 4, marginBottom: 20 },
  newBtn: { flexDirection: "row", alignItems: "center", backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, gap: 6 },
  newBtnText: { color: colors.primaryFg, fontWeight: "700" },
  swapCard: { padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  swapHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  shiftBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  shiftBadgeText: { fontSize: 12, fontWeight: "700" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: "700" },
  swapDate: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  swapPeople: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  swapMessage: { fontSize: 13, color: colors.textSecondary, marginTop: 8, fontStyle: "italic" },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  rejectBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  rejectText: { color: colors.textPrimary, fontWeight: "600" },
  acceptBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center" },
  acceptText: { color: colors.primaryFg, fontWeight: "700" },
  cancelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: colors.danger, marginTop: 12 },
  cancelText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
  fabBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 14, gap: 6, marginTop: 8 },
  fabText: { color: colors.primaryFg, fontWeight: "700", fontSize: 15 },
});
