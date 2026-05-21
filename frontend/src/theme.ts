export const colors = {
  background: "#F8F9FA",
  surface: "#FFFFFF",
  primary: "#FACC15",
  primaryDark: "#EAB308",
  primaryFg: "#111111",
  secondary: "#111111",
  secondaryFg: "#FFFFFF",
  border: "#E4E4E7",
  borderStrong: "#D4D4D8",
  textPrimary: "#111111",
  textSecondary: "#52525B",
  textMuted: "#A1A1AA",
  danger: "#EF4444",
  success: "#10B981",
  mattinaBg: "#FEF9C3",
  mattinaBorder: "#FDE68A",
  mattinaText: "#854D0E",
  pomeriggioBg: "#FFEDD5",
  pomeriggioBorder: "#FED7AA",
  pomeriggioText: "#9A3412",
  notteBg: "#1F2937",
  notteBorder: "#111827",
  notteText: "#FFFFFF",
};

export const shiftStyle = (type: string) => {
  if (type === "Mattina") return { bg: colors.mattinaBg, border: colors.mattinaBorder, text: colors.mattinaText, time: "08:00 - 14:00" };
  if (type === "Pomeriggio") return { bg: colors.pomeriggioBg, border: colors.pomeriggioBorder, text: colors.pomeriggioText, time: "14:00 - 20:00" };
  return { bg: colors.notteBg, border: colors.notteBorder, text: colors.notteText, time: "20:00 - 08:00" };
};

export const roleColor = (role: string) => {
  if (role === "Autista") return "#3B82F6";
  if (role === "Capoturno") return "#8B5CF6";
  return "#10B981";
};

export const roleLabel = (role: string) => {
  if (role === "Autista") return "Autista";
  if (role === "Capoturno") return "Capoturno";
  return "Soccorritore";
};

export const monthNamesIt = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export const weekdaysShortIt = ["L", "M", "M", "G", "V", "S", "D"];

export const SHIFT_TYPES = ["Mattina", "Pomeriggio", "Notte"] as const;

export const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
