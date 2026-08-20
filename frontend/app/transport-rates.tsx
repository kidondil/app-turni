import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { apiErrorMessage, apiRequest } from "@/src/api";
import { colors } from "@/src/theme";
import { useUser } from "@/src/context/UserContext";

type TransportRate = {
  paese: string;
  km: number;
  andata: number;
  andata_ritorno: number;
  visita: number;
};

type RatesResponse = {
  origin: string;
  rates: TransportRate[];
};

type EstimateResponse = {
  km: number;
  andata: number;
  andata_ritorno: number;
  visita: number;
  source: "tariffario" | "manuale" | "openstreetmap";
  official: boolean;
  requested_town: string;
  display_name: string;
};

const euros = (value: number) => `${value.toLocaleString("it-IT")} €`;

export default function TransportRatesScreen() {
  const { currentUser } = useUser();
  const router = useRouter();
  const [rates, setRates] = useState<TransportRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [town, setTown] = useState("");
  const [manualKm, setManualKm] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);

  const load = useCallback(async () => {
    if (!currentUser) return;
    try {
      const data = await apiRequest<RatesResponse>("/api/transport-rates");
      setRates(data.rates);
    } catch (error) {
      Alert.alert("Errore", apiErrorMessage(error, "Impossibile caricare il tariffario"));
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useFocusEffect(useCallback(() => {
    if (!currentUser) {
      router.replace("/");
      return;
    }
    load();
  }, [currentUser, load, router]));

  const filteredRates = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("it-IT");
    if (!needle) return rates;
    return rates.filter((rate) => rate.paese.toLocaleLowerCase("it-IT").includes(needle));
  }, [rates, search]);

  const runEstimate = async () => {
    const cleanTown = town.trim();
    const cleanKm = manualKm.replace(",", ".").trim();
    if (!manualMode && !cleanTown) {
      Alert.alert("Località mancante", "Inserisci il paese da cercare");
      return;
    }
    if (manualMode && (!cleanKm || Number.isNaN(Number(cleanKm)))) {
      Alert.alert("Chilometri non validi", "Inserisci la distanza stradale da Cabras");
      return;
    }
    setEstimating(true);
    setEstimate(null);
    try {
      const params = new URLSearchParams();
      if (cleanTown) params.set("town", cleanTown);
      if (manualMode) params.set("km", cleanKm);
      setEstimate(await apiRequest<EstimateResponse>(`/api/transport-rates/estimate?${params.toString()}`));
    } catch (error) {
      Alert.alert("Stima non disponibile", apiErrorMessage(error));
    } finally {
      setEstimating(false);
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
          <Text style={styles.title}>Tariffario trasporti</Text>
          <Text style={styles.subtitle}>Partenza da Cabras</Text>
        </View>
        <View style={{ width: 48 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.estimatorCard}>
            <View style={styles.estimatorTitleRow}>
              <View style={styles.estimatorIcon}>
                <Ionicons name="calculator-outline" size={26} color="#1E3A8A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Calcola una località non in elenco</Text>
                <Text style={styles.cardSubtitle}>Distanza stradale da Cabras e tariffa proporzionale</Text>
              </View>
            </View>

            <TextInput
              style={styles.input}
              value={town}
              onChangeText={setTown}
              placeholder="Nome del paese"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              returnKeyType="search"
              onSubmitEditing={() => { if (!manualMode) runEstimate(); }}
              testID="estimate-town"
            />

            <TouchableOpacity
              style={styles.modeButton}
              onPress={() => { setManualMode((current) => !current); setEstimate(null); }}
            >
              <Ionicons name={manualMode ? "map-outline" : "speedometer-outline"} size={20} color={colors.textPrimary} />
              <Text style={styles.modeButtonText}>
                {manualMode ? "Usa il calcolo automatico" : "Inserisci i chilometri manualmente"}
              </Text>
            </TouchableOpacity>

            {manualMode && (
              <TextInput
                style={styles.input}
                value={manualKm}
                onChangeText={(value) => setManualKm(value.replace(/[^0-9,.]/g, ""))}
                placeholder="Km stradali da Cabras"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                testID="estimate-km"
              />
            )}

            <TouchableOpacity style={styles.calculateButton} onPress={runEstimate} disabled={estimating} testID="estimate-submit">
              {estimating ? <ActivityIndicator color={colors.primaryFg} /> : (
                <>
                  <Ionicons name="search" size={22} color={colors.primaryFg} />
                  <Text style={styles.calculateButtonText}>Calcola tariffa</Text>
                </>
              )}
            </TouchableOpacity>

            {estimate && (
              <View style={[styles.resultCard, estimate.official && styles.officialResult]}>
                <View style={styles.resultHeading}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultTitle}>{estimate.display_name}</Text>
                    <Text style={styles.resultDistance}>{estimate.km} km da Cabras</Text>
                  </View>
                  <View style={[styles.resultBadge, estimate.official ? styles.officialBadge : styles.estimateBadge]}>
                    <Text style={styles.resultBadgeText}>{estimate.official ? "Tariffario" : "Stima"}</Text>
                  </View>
                </View>
                <PriceGrid rate={estimate} />
                {!estimate.official && (
                  <Text style={styles.estimateNote}>
                    Valore orientativo: verifica il percorso e conferma l&apos;importo prima del servizio.
                  </Text>
                )}
              </View>
            )}

            <TouchableOpacity onPress={() => Linking.openURL("https://www.openstreetmap.org/copyright") }>
              <Text style={styles.attribution}>Distanze automatiche: © OpenStreetMap contributors · OSRM</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Tariffario ufficiale</Text>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={22} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Cerca paese"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              testID="rate-search"
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch("")} style={styles.clearButton} accessibilityLabel="Cancella ricerca">
                <Ionicons name="close-circle" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primaryDark} size="large" style={{ marginTop: 30 }} />
          ) : filteredRates.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="location-outline" size={34} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>Paese non trovato</Text>
              <Text style={styles.emptyText}>Puoi calcolarlo nel riquadro qui sopra.</Text>
            </View>
          ) : (
            filteredRates.map((rate) => (
              <View key={rate.paese} style={styles.rateCard}>
                <View style={styles.rateHeading}>
                  <View style={styles.locationIcon}>
                    <Ionicons name="location" size={19} color="#A16207" />
                  </View>
                  <Text style={styles.rateTown}>{rate.paese}</Text>
                  <Text style={styles.rateDistance}>{rate.km} km</Text>
                </View>
                <PriceGrid rate={rate} />
              </View>
            ))
          )}

          <View style={styles.rulesCard}>
            <Ionicons name="information-circle-outline" size={22} color={colors.textSecondary} />
            <Text style={styles.rulesText}>
              Gli importi sono arrotondati a 10 €. La visita corrisponde all&apos;andata/ritorno più 20 €.
              Per le dimissioni non si conteggia il rientro in sede.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PriceGrid({ rate }: { rate: Pick<TransportRate, "andata" | "andata_ritorno" | "visita"> }) {
  return (
    <View style={styles.priceGrid}>
      <View style={styles.priceCell}>
        <Text style={styles.priceLabel}>Andata</Text>
        <Text style={styles.priceValue}>{euros(rate.andata)}</Text>
      </View>
      <View style={styles.priceDivider} />
      <View style={styles.priceCell}>
        <Text style={styles.priceLabel}>A/R</Text>
        <Text style={styles.priceValue}>{euros(rate.andata_ritorno)}</Text>
      </View>
      <View style={styles.priceDivider} />
      <View style={styles.priceCell}>
        <Text style={styles.priceLabel}>Visita</Text>
        <Text style={styles.priceValue}>{euros(rate.visita)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerBar: { minHeight: 68, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  backBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  headerTitleWrap: { flex: 1, alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 50 },
  estimatorCard: { padding: 16, borderRadius: 20, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE" },
  estimatorTitleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  estimatorIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#DBEAFE" },
  cardTitle: { fontSize: 17, fontWeight: "800", color: colors.textPrimary },
  cardSubtitle: { fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginTop: 3 },
  input: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: 14, fontSize: 16, color: colors.textPrimary, marginBottom: 10 },
  modeButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 13, borderWidth: 1, borderColor: "#93C5FD", backgroundColor: "#FFFFFF", marginBottom: 10, paddingHorizontal: 12 },
  modeButtonText: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  calculateButton: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 15, backgroundColor: colors.primary },
  calculateButtonText: { fontSize: 16, fontWeight: "800", color: colors.primaryFg },
  resultCard: { marginTop: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: "#93C5FD", backgroundColor: colors.surface },
  officialResult: { borderColor: "#86EFAC", backgroundColor: "#F0FDF4" },
  resultHeading: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 12 },
  resultTitle: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  resultDistance: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  resultBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  officialBadge: { backgroundColor: "#BBF7D0" },
  estimateBadge: { backgroundColor: "#FEF3C7" },
  resultBadgeText: { fontSize: 11, fontWeight: "800", color: colors.textPrimary },
  estimateNote: { marginTop: 10, fontSize: 11, lineHeight: 16, color: colors.textSecondary, fontStyle: "italic" },
  attribution: { textAlign: "center", fontSize: 10, color: "#2563EB", marginTop: 12, textDecorationLine: "underline" },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.textPrimary, marginTop: 24, marginBottom: 10 },
  searchBox: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 16, color: colors.textPrimary, paddingVertical: 12 },
  clearButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  rateCard: { padding: 15, marginBottom: 10, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  rateHeading: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  locationIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#FEF3C7", marginRight: 9 },
  rateTown: { flex: 1, fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  rateDistance: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  priceGrid: { flexDirection: "row", alignItems: "stretch", paddingTop: 11, borderTopWidth: 1, borderTopColor: colors.border },
  priceCell: { flex: 1, alignItems: "center" },
  priceDivider: { width: 1, backgroundColor: colors.border },
  priceLabel: { fontSize: 10, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase" },
  priceValue: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, marginTop: 3 },
  emptyCard: { alignItems: "center", padding: 26, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, marginTop: 8 },
  emptyText: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  rulesCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, marginTop: 8, borderRadius: 15, backgroundColor: "#F4F4F5" },
  rulesText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.textSecondary },
});
