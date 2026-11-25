const cleanStudentNumber = (value: unknown) => String(value ?? "").toUpperCase().replace(/[–—]/g, "-").replace(/\s/g, "");
const digits = (value: string) => value.replace(/O/g, "0");
const fullStudentNumber = /^(?:TC-?)?([0-9O]{2})-?([A-Z])-?([0-9O]+)$/;

export function normalizeStudentNumberKey(value: unknown): string {
  const text = cleanStudentNumber(value);
  const match = /^[0-9O]{1,5}$/.test(text) ? null : fullStudentNumber.exec(text);
  return match && match[3].length <= 5
    ? `TC-${digits(match[1])}-${match[2]}-${digits(match[3]).padStart(5, "0")}`
    : text.replace(/[^A-Z0-9-]/g, "");
}

