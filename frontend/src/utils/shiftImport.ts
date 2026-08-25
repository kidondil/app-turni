import { parseDateInputIt } from "@/src/utils/dates";
import { SHIFT_TYPES, ShiftType } from "@/src/theme";

export type ShiftImportRow = {
  line: number;
  date: string;
  shift_type: ShiftType;
  autista: string;
  capoturno: string;
  soccorritore: string;
};

export type ShiftImportParseResult = {
  rows: ShiftImportRow[];
  errors: string[];
};

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLocaleLowerCase("it-IT");

export type ImportRole = "Autista" | "Capoturno" | "Soccorritore";

const importRolePersonKey = (value: string) => normalize(value)
  .split(/\s+/)
  .filter(Boolean)
  .sort()
  .join(" ");

const EXTRA_IMPORT_ROLES: Record<string, ImportRole[]> = {
  [importRolePersonKey("Andrea Caddeo")]: ["Soccorritore"],
  [importRolePersonKey("Lucia Murtas")]: ["Capoturno"],
};

export const canImportUserAsRole = (
  userName: string,
  primaryRole: string,
  importedRole: ImportRole,
) => primaryRole === importedRole
  || EXTRA_IMPORT_ROLES[importRolePersonKey(userName)]?.includes(importedRole)
  || false;

const parseCsvLine = (line: string, delimiter: string) => {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
};

const canonicalShiftType = (value: string): ShiftType | null => {
  const normalized = normalize(value);
  return SHIFT_TYPES.find((type) => normalize(type) === normalized) || null;
};

const canonicalDate = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return parseDateInputIt(value);
};

export const parseShiftImportCsv = (text: string): ShiftImportParseResult => {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim().length > 0);
  if (headerIndex < 0) return { rows: [], errors: ["Il file è vuoto"] };

  const delimiter = (lines[headerIndex].match(/;/g) || []).length
    >= (lines[headerIndex].match(/,/g) || []).length ? ";" : ",";
  const headers = parseCsvLine(lines[headerIndex], delimiter).map(normalize);
  const indexes = {
    date: headers.indexOf("data"),
    shift: headers.indexOf("turno"),
    autista: headers.indexOf("autista"),
    capoturno: headers.indexOf("capoturno"),
    soccorritore: headers.indexOf("soccorritore"),
  };
  const missing = Object.entries(indexes)
    .filter(([, index]) => index < 0)
    .map(([name]) => name);
  if (missing.length > 0) {
    return {
      rows: [],
      errors: ["Intestazioni richieste: Data;Turno;Autista;Capoturno;Soccorritore"],
    };
  }

  const rows: ShiftImportRow[] = [];
  const errors: string[] = [];
  const keys = new Set<string>();
  lines.slice(headerIndex + 1).forEach((line, offset) => {
    if (!line.trim()) return;
    const lineNumber = headerIndex + offset + 2;
    const values = parseCsvLine(line, delimiter);
    const dateValue = values[indexes.date]?.trim() || "";
    const shiftValue = values[indexes.shift]?.trim() || "";
    const parsedDate = canonicalDate(dateValue);
    const parsedShift = canonicalShiftType(shiftValue);
    if (!parsedDate) errors.push(`Riga ${lineNumber}: data non valida (${dateValue || "mancante"})`);
    if (!parsedShift) errors.push(`Riga ${lineNumber}: turno non valido (${shiftValue || "mancante"})`);

    const autista = values[indexes.autista]?.trim() || "";
    const capoturno = values[indexes.capoturno]?.trim() || "";
    const soccorritore = values[indexes.soccorritore]?.trim() || "";
    if (!autista || !capoturno || !soccorritore) {
      errors.push(`Riga ${lineNumber}: la squadra deve contenere tutti e tre i gruppi`);
    }
    if (!parsedDate || !parsedShift || !autista || !capoturno || !soccorritore) return;

    const key = `${parsedDate}|${parsedShift}`;
    if (keys.has(key)) {
      errors.push(`Riga ${lineNumber}: ${shiftValue} del ${dateValue} è presente due volte`);
      return;
    }
    keys.add(key);
    rows.push({
      line: lineNumber,
      date: parsedDate,
      shift_type: parsedShift,
      autista,
      capoturno,
      soccorritore,
    });
  });

  if (rows.length === 0 && errors.length === 0) errors.push("Il file non contiene turni");
  return { rows, errors };
};

// Spaces inside a person's name are not significant during CSV matching:
// "Mura Gianfranco" and "Mura Gian Franco" must identify the same user.
export const normalizeImportName = (value: string) => normalize(value).replace(/\s+/g, "");
