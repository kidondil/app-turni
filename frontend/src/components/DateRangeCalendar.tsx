import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, monthNamesIt, weekdaysShortIt } from "@/src/theme";
import { dateFromIso, formatIsoDateIt, isoDateFromParts } from "@/src/utils/dates";

type Props = {
  visible: boolean;
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
  onClose: () => void;
};

export function DateRangeCalendar({ visible, startDate, endDate, onChange, onClose }: Props) {
  const [visibleMonth, setVisibleMonth] = useState(() => dateFromIso(startDate) || new Date());

  useEffect(() => {
    if (visible) setVisibleMonth(dateFromIso(startDate) || new Date());
  }, [visible, startDate]);

  const year = visibleMonth.getFullYear();
  const monthIndex = visibleMonth.getMonth();
  const days = useMemo(() => {
    const firstWeekdayMondayFirst = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cells: (number | null)[] = Array(firstWeekdayMondayFirst).fill(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthIndex, year]);

  const moveMonth = (amount: number) => {
    setVisibleMonth(new Date(year, monthIndex + amount, 1));
  };

  const selectDay = (day: number) => {
    const selected = isoDateFromParts(year, monthIndex, day);
    if (!startDate || endDate) {
      onChange(selected, "");
      return;
    }
    if (selected < startDate) {
      onChange(selected, "");
      return;
    }
    onChange(startDate, selected);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Seleziona il periodo</Text>
              <Text style={styles.subtitle}>
                {!startDate
                  ? "Tocca il primo giorno"
                  : !endDate
                    ? `Dal ${formatIsoDateIt(startDate)} · ora scegli il giorno finale`
                    : `${formatIsoDateIt(startDate)} → ${formatIsoDateIt(endDate)}`}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.monthHeader}>
            <TouchableOpacity style={styles.monthBtn} onPress={() => moveMonth(-1)} testID="calendar-prev-month">
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{monthNamesIt[monthIndex]} {year}</Text>
            <TouchableOpacity style={styles.monthBtn} onPress={() => moveMonth(1)} testID="calendar-next-month">
              <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {weekdaysShortIt.map((weekday, index) => (
              <View key={`${weekday}-${index}`} style={styles.weekCell}>
                <Text style={styles.weekText}>{weekday}</Text>
              </View>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {days.map((day, index) => {
              if (!day) return <View key={`blank-${index}`} style={styles.dayCell} />;
              const isoDate = isoDateFromParts(year, monthIndex, day);
              const isStart = isoDate === startDate;
              const isEnd = isoDate === endDate;
              const inRange = !!startDate && !!endDate && isoDate > startDate && isoDate < endDate;
              return (
                <View key={isoDate} style={[styles.dayCell, inRange && styles.dayCellInRange]}>
                  <TouchableOpacity
                    style={[styles.dayButton, (isStart || isEnd) && styles.dayButtonSelected]}
                    onPress={() => selectDay(day)}
                    testID={`calendar-day-${isoDate}`}
                  >
                    <Text style={[styles.dayText, (isStart || isEnd) && styles.dayTextSelected]}>{day}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.resetBtn} onPress={() => onChange("", "")}>
              <Text style={styles.resetText}>Azzera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, (!startDate || !endDate) && styles.disabled]}
              onPress={onClose}
              disabled={!startDate || !endDate}
              testID="calendar-confirm"
            >
              <Text style={styles.confirmText}>Conferma periodo</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: "rgba(0,0,0,0.5)" },
  card: { width: "100%", maxWidth: 460, backgroundColor: colors.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: colors.border },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16 },
  title: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 4, lineHeight: 17 },
  closeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  monthBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.background },
  monthTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, textTransform: "capitalize" },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekCell: { width: "14.2857%", alignItems: "center", paddingVertical: 5 },
  weekText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  daysGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: "14.2857%", height: 42, alignItems: "center", justifyContent: "center" },
  dayCellInRange: { backgroundColor: "#FEF9C3" },
  dayButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dayButtonSelected: { backgroundColor: colors.secondary },
  dayText: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  dayTextSelected: { color: colors.secondaryFg, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 8, marginTop: 16 },
  resetBtn: { paddingHorizontal: 16, paddingVertical: 13, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  resetText: { color: colors.textPrimary, fontWeight: "600" },
  confirmBtn: { flex: 1, paddingHorizontal: 16, paddingVertical: 13, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.primary },
  confirmText: { color: colors.primaryFg, fontWeight: "700" },
  disabled: { opacity: 0.35 },
});
