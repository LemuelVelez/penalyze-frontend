import type { AttendanceEvent } from "../api/attendance";
import { isCollegeExemptFromEvent, normalizeCollegeKey } from "./colleges";

export const QR_CODE_YEAR_LEVEL_OPTIONS = [
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year",
  "5th Year",
] as const;

// Keep this normalization in sync with the backend TypeScript and SQL helpers.
export function normalizeYearLevelKey(value: unknown): string | null {
  const normalized = String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u00A0\u202F]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  const aliases: Record<string, string> = {
    "1": "1", "1styear": "1", "1styr": "1", "firstyear": "1", "firstyr": "1", "year1": "1", i: "1",
    "2": "2", "2ndyear": "2", "2ndyr": "2", "secondyear": "2", "secondyr": "2", "year2": "2", ii: "2",
    "3": "3", "3rdyear": "3", "3rdyr": "3", "thirdyear": "3", "thirdyr": "3", "year3": "3", iii: "3",
    "4": "4", "4thyear": "4", "4thyr": "4", "fourthyear": "4", "fourthyr": "4", "year4": "4", iv: "4",
    "5": "5", "5thyear": "5", "5thyr": "5", "fifthyear": "5", "fifthyr": "5", "year5": "5", v: "5",
  };

  return aliases[normalized] ?? null;
}

export function getYearLevelLabel(value: unknown) {
  const key = normalizeYearLevelKey(value);
  return ({
    "1": "1st Year",
    "2": "2nd Year",
    "3": "3rd Year",
    "4": "4th Year",
    "5": "5th Year",
  } as Record<string, string>)[key ?? ""] ?? String(value ?? "").trim();
}

export function isYearLevelExemptFromEvent(
  event: AttendanceEvent | null | undefined,
  yearLevel: unknown,
  college: unknown,
) {
  const yearLevelKey = normalizeYearLevelKey(yearLevel);
  if (!event || !yearLevelKey) return false;

  const collegeKey = normalizeCollegeKey(college);
  return (event.exempted_year_levels ?? []).some((exemption) => {
    if (normalizeYearLevelKey(exemption.year_level_key) !== yearLevelKey) return false;
    const exemptionCollegeKey = normalizeCollegeKey(exemption.college_key);
    return exemptionCollegeKey === null || exemptionCollegeKey === collegeKey;
  });
}

export function isStudentExemptFromEvent(
  event: AttendanceEvent | null | undefined,
  college: unknown,
  yearLevel: unknown,
) {
  return (
    isCollegeExemptFromEvent(event, college) ||
    isYearLevelExemptFromEvent(event, yearLevel, college)
  );
}
