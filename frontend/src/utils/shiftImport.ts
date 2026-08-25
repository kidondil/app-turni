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

export type ShiftImportAbsenceRow = {
  line: number;
  start_date: string;
  end_date: string;
  person: string;
  absence_type: "Malattia";
};

export type ShiftImportParseResult = {
  rows: ShiftImportRow[];
  absences: ShiftImportAbsenceRow[];
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

const canonicalAbsenceType = (value: string): "Malattia" | null => (
  normalize(value) === normalize("Malattia") ? "Malattia" : null
);

export const parseShiftImportCsv = (text: string): ShiftImportParseResult => {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim().length > 0);
  if (headerIndex < 0) return { rows: [], absences: [], errors: ["Il file è vuoto"] };

  const delimiter = (lines[headerIndex].match(/;/g) || []).length
    >= (lines[headerIndex].match(/,/g) || []).length ? ";" : ",";
  const headers = parseCsvLine(lines[headerIndex], delimiter).map(normalize);
  const indexes = {
    date: headers.indexOf("data"),
    shift: headers.indexOf("turno"),
    autista: headers.indexOf("autista"),
    capoturno: headers.indexOf("capoturno"),
    soccorritore: headers.indexOf("soccorritore"),
    endDate: headers.indexOf("data fine"),
    absentPerson: headers.indexOf("assente"),
    absenceType: headers.indexOf("tipo assenza"),
  };
  const requiredIndexes = {
    date: indexes.date,
    shift: indexes.shift,
    autista: indexes.autista,
    capoturno: indexes.capoturno,
    soccorritore: indexes.soccorritore,
  };
  const missing = Object.entries(requiredIndexes)
    .filter(([, index]) => index < 0)
    .map(([name]) => name);
  if (missing.length > 0) {
    return {
      rows: [],
      absences: [],
      errors: ["Intestazioni richieste: Data;Turno;Autista;Capoturno;Soccorritore"],
    };
  }

  const rows: ShiftImportRow[] = [];
  const absences: ShiftImportAbsenceRow[] = [];
  const errors: string[] = [];
  const keys = new Set<string>();
  const absenceKeys = new Set<string>();
  lines.slice(headerIndex + 1).forEach((line, offset) => {
    if (!line.trim()) return;
    const lineNumber = headerIndex + offset + 2;
    const values = parseCsvLine(line, delimiter);
    const dateValue = values[indexes.date]?.trim() || "";
    const endDateValue = indexes.endDate >= 0 ? values[indexes.endDate]?.trim() || "" : "";
    const absentPerson = indexes.absentPerson >= 0 ? values[indexes.absentPerson]?.trim() || "" : "";
    const absenceTypeValue = indexes.absenceType >= 0 ? values[indexes.absenceType]?.trim() || "" : "";
    const isAbsenceRow = !!absentPerson || !!absenceTypeValue;
    if (isAbsenceRow) {
      const parsedStartDate = canonicalDate(dateValue);
      const parsedEndDate = canonicalDate(endDateValue || dateValue);
      const parsedAbsenceType = canonicalAbsenceType(absenceTypeValue);
      if (!absentPerson) errors.push(`Riga ${lineNumber}: nome dell'assente mancante`);
      if (!parsedStartDate) errors.push(`Riga ${lineNumber}: data iniziale non valida (${dateValue || "mancante"})`);
      if (!parsedEndDate) errors.push(`Riga ${lineNumber}: data finale non valida (${endDateValue || dateValue || "mancante"})`);
      if (!parsedAbsenceType) errors.push(`Riga ${lineNumber}: tipo assenza non valido (${absenceTypeValue || "mancante"})`);
      if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
        errors.push(`Riga ${lineNumber}: la data finale precede quella iniziale`);
      }
      if (!absentPerson || !parsedStartDate || !parsedEndDate || !parsedAbsenceType || parsedStartDate > parsedEndDate) return;
      const absenceKey = `${normalizeImportName(absentPerson)}|${parsedStartDate}|${parsedEndDate}|${parsedAbsenceType}`;
      if (absenceKeys.has(absenceKey)) {
        errors.push(`Riga ${lineNumber}: la malattia di ${absentPerson} è presente due volte`);
        return;
      }
      absenceKeys.add(absenceKey);
      absences.push({
        line: lineNumber,
        start_date: parsedStartDate,
        end_date: parsedEndDate,
        person: absentPerson,
        absence_type: parsedAbsenceType,
      });
      return;
    }

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

  if (rows.length === 0 && absences.length === 0 && errors.length === 0) errors.push("Il file non contiene turni o assenze");
  return { rows, absences, errors };
};

// Spaces inside a person's name are not significant during CSV matching:
// "Mura Gianfranco" and "Mura Gian Franco" must identify the same user.
export const normalizeImportName = (value: string) => normalize(value).replace(/\s+/g, "");
