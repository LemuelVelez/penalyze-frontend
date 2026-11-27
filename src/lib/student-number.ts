const cleanStudentNumber = (value: unknown) => String(value ?? "").toUpperCase().replace(/[–—]/g, "-").replace(/\s/g, "");
const digits = (value: string) => value.replace(/O/g, "0");
const fullStudentNumber = /^(?:TC-?)?([0-9O]{2})-?([A-Z])-?([0-9O]+)$/;

export function normalizeStudentNumberKey(value: unknown): string {
  const text = cleanStudentNumber(value);
  const match = /^[0-9O]+$/.test(text) ? null : fullStudentNumber.exec(text);
  return match && digits(match[3]).replace(/^0+(?=\d)/, "").length <= 5
    ? `TC-${digits(match[1])}-${match[2]}-${digits(match[3]).replace(/^0+(?=\d)/, "").padStart(5, "0")}`
    : text.replace(/[^A-Z0-9-]/g, "");
}

export type StudentNumberParts = { year?: string; letter?: string; serial: string };
function rawStudentNumberParts(value: unknown): StudentNumberParts | null {
  const text = cleanStudentNumber(value);
  const full = /^[0-9O]+$/.test(text) ? null : fullStudentNumber.exec(text);
  const serial = (value: string) => digits(value).replace(/^0+(?=\d)/, "").padStart(5, "0");
  if (full) return { year: digits(full[1]), letter: full[2], serial: serial(full[3]) };
  const partial = /^(?:TC-?([0-9O]{2})-?|([0-9O]{2})-)([0-9O]+)$/.exec(text);
  if (partial) return { year: digits(partial[1] ?? partial[2]), serial: serial(partial[3]) };
  if (/^[0-9O]+$/.test(text)) return { serial: serial(text) };
  return null;
}

export function isPlaceholderStudentNumber(value: unknown): boolean {
  return !cleanStudentNumber(value) || rawStudentNumberParts(value)?.serial === "00000" || /-00000$/.test(normalizeStudentNumberKey(value));
}


export const placeholderStudentNumberMessage = (studentId: string) => `${studentId} is a placeholder ID recorded when a QR code was not scanned. It is not a real Student ID. Search using your own Student ID. Attendance recorded under a wrong or placeholder ID is moved to your real Student ID when your name matches the masterlist; if it is still missing, submit an Attendance Review using your real Student ID.`;
