import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@/src/context/UserContext";
import { apiErrorMessage, apiRequest } from "@/src/api";
import { colors } from "@/src/theme";

type Notification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  type: string;
};

const notificationAppearance = (type: string) => {
  if (type === "leave") return { icon: "airplane-outline" as const, color: "#7C3AED", background: "#EDE9FE" };
  if (type === "swap") return { icon: "swap-horizontal-outline" as const, color: "#2563EB", background: "#DBEAFE" };
  return { icon: "calendar-outline" as const, color: "#A16207", background: "#FEF3C7" };
};

const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
};

export default function NotificationsScreen() {
  const { currentUser } = useUser();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentUser) return;
    try {
      setNotifications(await apiRequest<Notification[]>(`/api/notifications?user_id=${currentUser.id}`));
    } catch (error) {
      Alert.alert("Errore", apiErrorMessage(error, "Impossibile caricare le notifiche"));
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
  }, [currentUser, load, router]));

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const markRead = async (notification: Notification) => {
    if (notification.read || savingId) return;
    setSavingId(notification.id);
    try {
      await apiRequest(`/api/notifications/${notification.id}/read`, { method: "PATCH" });
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read: true } : item));
    } catch (error) {
      Alert.alert("Errore", apiErrorMessage(error, "Impossibile aggiornare la notifica"));
    } finally {
      setSavingId(null);
    }
  };

  const markAllRead = async () => {
    if (!currentUser || unreadCount === 0) return;
    try {
      await apiRequest(`/api/notifications/mark-all-read?user_id=${currentUser.id}`, { method: "POST" });
      setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    } catch (error) {
      Alert.alert("Errore", apiErrorMessage(error, "Impossibile aggiornare le notifiche"));
    }
  };

  if (!currentUser) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Indietro">
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Notifiche</Text>
          <Text style={styles.subtitle}>{unreadCount === 0 ? "Tutto letto" : `${unreadCount} ${unreadCount === 1 ? "da leggere" : "da leggere"}`}</Text>
        </View>
        <View style={{ width: 48 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primaryDark} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primaryDark} />}
        >
          {unreadCount > 0 && (
            <TouchableOpacity style={styles.markAllButton} onPress={markAllRead} testID="mark-all-read">
              <Ionicons name="checkmark-done" size={24} color={colors.primaryFg} />
              <Text style={styles.markAllText}>Segna tutte come lette</Text>
            </TouchableOpacity>
          )}

          {notifications.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="notifications-off-outline" size={34} color={colors.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>Nessuna notifica</Text>
              <Text style={styles.emptyText}>Qui compariranno aggiornamenti sui turni, ferie e scambi.</Text>
            </View>
          ) : (
            notifications.map((notification) => {
              const appearance = notificationAppearance(notification.type);
              const saving = savingId === notification.id;
              return (
                <View key={notification.id} style={[styles.notificationCard, !notification.read && styles.notificationUnread]}>
                  <View style={[styles.typeIcon, { backgroundColor: appearance.background }]}>
                    <Ionicons name={appearance.icon} size={25} color={appearance.color} />
                  </View>
                  <View style={styles.notificationContent}>
                    <View style={styles.titleRow}>
                      <Text style={styles.notificationTitle}>{notification.title}</Text>
                      {!notification.read && <View style={styles.unreadDot} />}
                    </View>
                    <Text style={styles.notificationBody}>{notification.body}</Text>
                    <Text style={styles.notificationDate}>{formatDateTime(notification.created_at)}</Text>
                    {!notification.read && (
                      <TouchableOpacity
                        style={styles.readButton}
                        onPress={() => markRead(notification)}
                        disabled={!!savingId}
                        testID={`mark-read-${notification.id}`}
                      >
                        {saving ? <ActivityIndicator size="small" color={colors.primaryFg} /> : (
                          <>
                            <Ionicons name="checkmark" size={20} color={colors.primaryFg} />
                            <Text style={styles.readButtonText}>Segna come letta</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerBar: { minHeight: 68, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  backBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  headerTitleWrap: { flex: 1, alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, paddingBottom: 40 },
  markAllButton: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 15, backgroundColor: colors.primary, marginBottom: 16 },
  markAllText: { fontSize: 15, fontWeight: "800", color: colors.primaryFg },
  notificationCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, marginBottom: 12, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  notificationUnread: { borderColor: colors.primaryDark, borderWidth: 2, backgroundColor: "#FEFCE8" },
  typeIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  notificationContent: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  notificationTitle: { flex: 1, fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  notificationBody: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 6 },
  notificationDate: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  readButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 13, backgroundColor: colors.primary, marginTop: 12, paddingHorizontal: 14 },
  readButtonText: { fontSize: 14, fontWeight: "800", color: colors.primaryFg },
  emptyCard: { alignItems: "center", padding: 28, marginTop: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 66, height: 66, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#F4F4F5", marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: "center", color: colors.textSecondary, marginTop: 6 },
});
