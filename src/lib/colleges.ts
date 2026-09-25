export const QR_CODE_COLLEGE_PROGRAM_OPTIONS: Record<string, string[]> = {
  "College of Business Administration": ["BSBA", "BSAB", "BSHM"],
  "College of Teacher Education": [
    "BSED Filipino",
    "BSED English",
    "BSED Math",
    "BSED Social Studies",
    "Bachelor of Physical Education",
    "BEED",
  ],
  "College of Computing Studies": [
    "BS Information Systems",
    "BS Computer Science",
  ],
  "College of Agriculture and Forestry": ["BS Agriculture", "BS Forestry"],
  "College of Liberal Arts, Mathematics and Sciences": ["BAELS"],
  "School of Engineering": ["Agricultural Biosystems Engineering"],
  "School of Criminal Justice Education": ["BS Criminology"],
};

export const QR_CODE_COLLEGE_OPTIONS = Object.keys(
  QR_CODE_COLLEGE_PROGRAM_OPTIONS,
);

export function getStudentProgramOptions(college: string) {
  return QR_CODE_COLLEGE_PROGRAM_OPTIONS[college] ?? [];
}
