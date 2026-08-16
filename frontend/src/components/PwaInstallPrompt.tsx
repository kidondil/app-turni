import React, { useEffect, useState } from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const runningStandalone = () => {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia?.("(display-mode: standalone)").matches || iosStandalone === true;
};

export default function PwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    setInstalled(runningStandalone());
    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent)
      || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    setIsIos(ios);

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  if (Platform.OS !== "web" || installed || (!isIos && !installPrompt)) return null;

  const install = async () => {
    if (isIos) {
      setShowIosHelp(true);
      return;
    }
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  };

  return (
    <>
      <View style={styles.banner}>
        <View style={styles.iconBox}>
          <Ionicons name="phone-portrait-outline" size={23} color={colors.primaryFg} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Installa LAPS Turni</Text>
          <Text style={styles.subtitle}>Aggiungi l’icona al telefono e aprila come una normale app.</Text>
        </View>
        <TouchableOpacity style={styles.installButton} onPress={install} testID="install-pwa-button">
          <Text style={styles.installText}>{isIos ? "Come fare" : "Installa"}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showIosHelp} transparent animationType="fade" onRequestClose={() => setShowIosHelp(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="logo-apple" size={28} color={colors.primaryFg} />
            </View>
            <Text style={styles.modalTitle}>Installa su iPhone</Text>
            <Text style={styles.modalIntro}>Apri questo sito con Safari, poi segui questi tre passaggi:</Text>

            <View style={styles.step}>
              <Text style={styles.stepNumber}>1</Text>
              <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.stepText}>Premi il pulsante Condividi in Safari.</Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNumber}>2</Text>
              <Ionicons name="add-circle-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.stepText}>Scegli “Aggiungi alla schermata Home”.</Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNumber}>3</Text>
              <Ionicons name="checkmark-circle-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.stepText}>Premi “Aggiungi” in alto a destra.</Text>
            </View>

            <TouchableOpacity style={styles.closeButton} onPress={() => setShowIosHelp(false)}>
              <Text style={styles.closeText}>Ho capito</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FEFCE8", borderWidth: 1, borderColor: colors.primaryDark, borderRadius: 16, padding: 12, marginBottom: 18 },
  iconBox: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1 },
  title: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  subtitle: { fontSize: 11, lineHeight: 15, color: colors.textSecondary, marginTop: 2 },
  installButton: { backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  installText: { fontSize: 12, fontWeight: "800", color: colors.primaryFg },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 440, borderRadius: 20, backgroundColor: colors.surface, padding: 20 },
  modalIcon: { alignSelf: "center", width: 54, height: 54, borderRadius: 17, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  modalTitle: { fontSize: 21, fontWeight: "800", color: colors.textPrimary, textAlign: "center" },
  modalIntro: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, textAlign: "center", marginTop: 6, marginBottom: 18 },
  step: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12, padding: 11, borderRadius: 12, backgroundColor: colors.background },
  stepNumber: { width: 24, height: 24, borderRadius: 12, textAlign: "center", lineHeight: 24, backgroundColor: colors.primary, fontWeight: "800", color: colors.primaryFg },
  stepText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.textPrimary },
  closeButton: { marginTop: 8, backgroundColor: colors.primary, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
  closeText: { fontSize: 14, fontWeight: "800", color: colors.primaryFg },
});
