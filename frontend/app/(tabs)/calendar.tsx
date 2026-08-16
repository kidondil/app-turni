import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@/src/context/UserContext";
import { colors, shiftStyle, monthNamesIt, weekdaysShortIt, SHIFT_TYPES } from "@/src/theme";
import { apiErrorMessage, apiRequest } from "@/src/api";

type Shift = {
  id: string;
  date: string;
  shift_type: string;
  user_id: string;
  user_name: string;
  role: string;
};

type Holiday = { date: string; name: string };
type VolunteerAttendance = { id: string; date: string; shift_type: string; user_id: string; user_name: string };

const pad = (n: number) => String(n).padStart(2, "0");

export default function CalendarScreen() {
  const { currentUser } = useUser();
  const router = useRouter();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [volunteerAttendances, setVolunteerAttendances] = useState<VolunteerAttendance[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"all" | "mine">("all");

  const monthStr = `${year}-${pad(month + 1)}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shiftData, holidayData, volunteerData] = await Promise.all([
        apiRequest<Shift[]>(`/api/shifts?month=${monthStr}`),
        apiRequest<Holiday[]>(`/api/holidays?year=${year}`),
        apiRequest<VolunteerAttendance[]>(`/api/volunteer-attendances?month=${monthStr}`),
      ]);
      setShifts(shiftData);
      setHolidays(holidayData);
      setVolunteerAttendances(volunteerData);
    } catch (e) {
      Alert.alert("Errore", apiErrorMessage(e, "Impossibile caricare il calendario"));
    } finally {
      setLoading(false);
    }
  }, [monthStr, year]);

  useFocusEffect(useCallback(() => {
    if (!currentUser) {
      router.replace("/");
      return;
    }
    load();
  }, [load, currentUser, router]));

  const shiftsByDate = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    const filtered = viewMode === "mine" && currentUser ? shifts.filter((s) => s.user_id === currentUser.id) : shifts;
    filtered.forEach((s) => {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    });
    return map;
  }, [shifts, viewMode, currentUser]);

  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.date)), [holidays]);

  const goPrevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); } else { setMonth(month - 1); }
  };
  const goNextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); } else { setMonth(month + 1); }
  };

  // Calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  // Monday-based: getDay() 0=Sun..6=Sat; we want 0=Mon..6=Sun
  const firstWeekday = (firstDay.getDay() + 6) % 7;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const myShiftTypes = (dateStr: string) => {
    const list = shiftsByDate[dateStr] || [];
    if (!currentUser) return [];
    const mine = new Set(
      list.filter((shift) => shift.user_id === currentUser.id).map((shift) => shift.shift_type),
    );
    volunteerAttendances
      .filter((attendance) => attendance.date === dateStr && attendance.user_id === currentUser.id)
      .forEach((attendance) => mine.add(attendance.shift_type));
    return SHIFT_TYPES.filter((type) => mine.has(type));
  };

  const handleExport = async () => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      Alert.alert("Disponibile sul sito", "Per esportare il calendario apri l’app dal browser.");
      return;
    }
    try {
      const csv = await apiRequest<string>(`/api/export/${monthStr}`);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `turni_${monthStr}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      Alert.alert("Errore", apiErrorMessage(error, "Impossibile esportare il calendario"));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Calendario</Text>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExport} testID="export-button">
          <Ionicons name="download-outline" size={18} color={colors.primaryFg} />
          <Text style={styles.exportText}>Esporta</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === "all" && styles.toggleActive]}
          onPress={() => setViewMode("all")}
          testID="filter-all"
        >
          <Text style={[styles.toggleText, viewMode === "all" && styles.toggleTextActive]}>Tutti</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === "mine" && styles.toggleActive]}
          onPress={() => setViewMode("mine")}
          testID="filter-mine"
        >
          <Text style={[styles.toggleText, viewMode === "mine" && styles.toggleTextActive]}>I miei</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.monthBar}>
        <TouchableOpacity onPress={goPrevMonth} style={styles.navBtn} testID="prev-month">
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthNamesIt[month]} {year}</Text>
        <TouchableOpacity onPress={goNextMonth} style={styles.navBtn} testID="next-month">
          <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {weekdaysShortIt.map((w, i) => (
          <Text key={i} style={styles.weekDay}>{w}</Text>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.gridScroll}>
          <View style={styles.grid}>
            {cells.map((day, idx) => {
              if (day === null) return <View key={idx} style={styles.dayCell} />;
              const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
              const isToday = dateStr === `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
              const isHoliday = holidaySet.has(dateStr);
              const mineTypes = myShiftTypes(dateStr);
              const dayShifts = shiftsByDate[dateStr] || [];

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.dayCell,
                    isToday && styles.dayCellToday,
                    isHoliday && styles.dayCellHoliday,
                  ]}
                  onPress={() => router.push(`/day/${dateStr}`)}
                  testID={`day-${dateStr}`}
                >
                  <Text style={[styles.dayNumber, isHoliday && { color: colors.danger }]}>{day}</Text>
                  {viewMode === "mine" ? (
                    <View style={styles.pillsRow}>
                      {mineTypes.map((type) => {
                        const palette = shiftStyle(type);
                        return (
                          <View key={type} style={[styles.shiftPill, { backgroundColor: palette.bg, borderColor: palette.border }]}>
                            <Text style={[styles.shiftPillText, { color: palette.text }]}>{type[0]}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.dotsRow}>
                      {dayShifts.some((s) => s.shift_type === "Mattina") && <View style={[styles.dot, { backgroundColor: "#FBBF24" }]} />}
                      {dayShifts.some((s) => s.shift_type === "Pomeriggio") && <View style={[styles.dot, { backgroundColor: "#F97316" }]} />}
                      {dayShifts.some((s) => s.shift_type === "Trasporti") && <View style={[styles.dot, { backgroundColor: "#3B82F6" }]} />}
                      {dayShifts.some((s) => s.shift_type === "Notte") && <View style={[styles.dot, { backgroundColor: "#111827" }]} />}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <Text style={styles.legendTitle}>Legenda</Text>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: "#FBBF24" }]} />
              <Text style={styles.legendText}>Mattina 08-14</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: "#F97316" }]} />
              <Text style={styles.legendText}>Pomeriggio 14-20</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: "#3B82F6" }]} />
              <Text style={styles.legendText}>Trasporti 08-16</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: "#111827" }]} />
              <Text style={styles.legendText}>Notte 20-08</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
              <Text style={styles.legendText}>Festivo</Text>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 24, fontWeight: "700", color: colors.textPrimary, letterSpacing: -0.5 },
  exportBtn: { flexDirection: "row", alignItems: "center", backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 4 },
  exportText: { color: colors.primaryFg, fontWeight: "600", fontSize: 13 },
  toggleRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  toggleActive: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  toggleText: { color: colors.textPrimary, fontWeight: "600", fontSize: 13 },
  toggleTextActive: { color: colors.secondaryFg },
  monthBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 10 },
  navBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  monthLabel: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, textTransform: "capitalize" },
  weekRow: { flexDirection: "row", paddingHorizontal: 8, marginBottom: 4 },
  weekDay: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.5 },
  gridScroll: { paddingHorizontal: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: `${100 / 7}%`, aspectRatio: 1, padding: 2,
    alignItems: "center", justifyContent: "flex-start",
  },
  dayCellToday: { backgroundColor: colors.primary, borderRadius: 12 },
  dayCellHoliday: {},
  dayNumber: { fontSize: 14, fontWeight: "600", color: colors.textPrimary, marginTop: 4 },
  dotsRow: { flexDirection: "row", gap: 3, marginTop: 4 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  pillsRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 2, marginTop: 3 },
  shiftPill: { minWidth: 15, paddingHorizontal: 3, paddingVertical: 1, borderRadius: 5, borderWidth: 1, alignItems: "center" },
  shiftPillText: { fontSize: 9, fontWeight: "700" },
  legend: { marginTop: 20, padding: 16, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginHorizontal: 8 },
  legendTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginBottom: 8 },
  legendRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  legendText: { fontSize: 13, color: colors.textSecondary },
});
