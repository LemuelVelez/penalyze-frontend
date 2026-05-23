import { Fragment, useMemo } from "react";
import { Download, Eye } from "lucide-react";

import type { AttendanceRecord } from "../api/attendance";
import type { FineRecord } from "../api/fines";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

type ExportReportProps = {
  attendanceRecords: AttendanceRecord[];
  fines: FineRecord[];
  isLoading?: boolean;
};

type FineSummary = {
  penalty: string;
  status: string;
};

type ReportRow = {
  key: string;
  college: string;
  studentId: string;
  name: string;
  totalAbsences: number;
  fines: FineSummary[];
  recordsCount: number;
  latestDate: string;
};

function cleanValue(value?: string | number | null) {
  return String(value ?? "").trim();
}

function normalizeValue(value?: string | number | null) {
  return cleanValue(value).toLowerCase().replace(/\s+/g, " ");
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function getRecordTime(value?: string | null) {
  if (!value) return 0;

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getReportRows(attendanceRecords: AttendanceRecord[], fines: FineRecord[]) {
  const rows = new Map<string, ReportRow>();
  const rowsByStudentId = new Map<string, ReportRow[]>();

  attendanceRecords.forEach((record) => {
    const studentId = cleanValue(record.student_id);
    const college = cleanValue(record.college) || "No college";
    const key = `${normalizeValue(studentId) || `record-${record.id}`}::${normalizeValue(college)}`;
    const current = rows.get(key);
    const recordDate = record.scanned_at ?? record.created_at ?? null;
    const recordTime = getRecordTime(recordDate);

    if (!current) {
      const row: ReportRow = {
        key,
        college,
        studentId,
        name: cleanValue(record.name) || "No name",
        totalAbsences: Math.max(0, Number(record.no_of_absences ?? 0)),
        fines: [],
        recordsCount: 1,
        latestDate: recordDate ?? "",
      };

      rows.set(key, row);

      const studentKey = normalizeValue(studentId);
      if (studentKey) {
        rowsByStudentId.set(studentKey, [...(rowsByStudentId.get(studentKey) ?? []), row]);
      }

      return;
    }

    current.totalAbsences = Math.max(current.totalAbsences, Math.max(0, Number(record.no_of_absences ?? 0)));
    current.recordsCount += 1;

    if (!current.name && record.name) current.name = cleanValue(record.name);

    const latestTime = getRecordTime(current.latestDate);
    if (recordTime >= latestTime) {
      current.latestDate = recordDate ?? current.latestDate;
      if (record.name) current.name = cleanValue(record.name);
    }
  });

  fines.forEach((fine) => {
    const studentKey = normalizeValue(fine.student_id);
    const matchedRows = studentKey ? rowsByStudentId.get(studentKey) ?? [] : [];
    const targetRows =
      matchedRows.length > 0
        ? matchedRows
        : [
            (() => {
              const key = `${studentKey || `fine-${fine.id}`}::no-college`;
              const existing = rows.get(key);

              if (existing) return existing;

              const row: ReportRow = {
                key,
                college: "No college",
                studentId: cleanValue(fine.student_id),
                name: cleanValue(fine.name) || "No name",
                totalAbsences: Math.max(0, Number(fine.no_of_absences ?? 0)),
                fines: [],
                recordsCount: 0,
                latestDate: fine.created_at ?? "",
              };

              rows.set(key, row);

              if (studentKey) {
                rowsByStudentId.set(studentKey, [...(rowsByStudentId.get(studentKey) ?? []), row]);
              }

              return row;
            })(),
          ];

    targetRows.forEach((row) => {
      row.totalAbsences = Math.max(row.totalAbsences, Math.max(0, Number(fine.no_of_absences ?? 0)));

      if (!row.name && fine.name) row.name = cleanValue(fine.name);
      if (!row.studentId && fine.student_id) row.studentId = cleanValue(fine.student_id);

      const penalty = cleanValue(fine.prescribed_penalty) || "No prescribed penalty";
      const status = cleanValue(fine.status).toUpperCase() || "NO STATUS";
      const fineKey = `${normalizeValue(penalty)}::${normalizeValue(status)}`;

      if (!row.fines.some((item) => `${normalizeValue(item.penalty)}::${normalizeValue(item.status)}` === fineKey)) {
        row.fines.push({ penalty, status });
      }
    });
  });

  return Array.from(rows.values()).sort((left, right) => {
    const collegeCompare = left.college.localeCompare(right.college, undefined, {
      numeric: true,
      sensitivity: "base",
    });

    if (collegeCompare !== 0) return collegeCompare;

    return left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function getRowsByCollege(rows: ReportRow[]) {
  return rows.reduce<Record<string, ReportRow[]>>((groups, row) => {
    const college = row.college || "No college";
    groups[college] = [...(groups[college] ?? []), row];
    return groups;
  }, {});
}

function getFineText(row: ReportRow) {
  if (!row.fines.length) return "No fine";
  return row.fines.map((fine) => `${fine.penalty} (${fine.status})`).join("; ");
}

function buildExcelDocument(rowsByCollege: Record<string, ReportRow[]>) {
  const generatedAt = new Date().toLocaleString();

  const bodyRows = Object.entries(rowsByCollege)
    .map(([college, rows]) => {
      const collegeTotal = rows.reduce((total, row) => total + row.totalAbsences, 0);

      return `
        <tr class="college-row">
          <td colspan="7">${escapeHtml(college)} — ${rows.length} attendee/s — ${collegeTotal} total absence/s</td>
        </tr>
        ${rows
          .map(
            (row) => `
              <tr>
                <td>${escapeHtml(row.studentId || "—")}</td>
                <td>${escapeHtml(row.name || "—")}</td>
                <td>${escapeHtml(row.college)}</td>
                <td class="number">${escapeHtml(row.totalAbsences)}</td>
                <td>${escapeHtml(getFineText(row))}</td>
                <td class="number">${escapeHtml(row.recordsCount)}</td>
                <td>${escapeHtml(formatDate(row.latestDate))}</td>
              </tr>
            `,
          )
          .join("")}
      `;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      font-family: Arial, sans-serif;
      color: #0f172a;
    }
    h1 {
      color: #1d4ed8;
      margin-bottom: 4px;
    }
    p {
      color: #475569;
      margin-top: 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    th {
      background: #1d4ed8;
      color: #ffffff;
      border: 1px solid #1e40af;
      padding: 10px;
      text-align: left;
      font-weight: 700;
    }
    td {
      border: 1px solid #cbd5e1;
      padding: 9px;
      vertical-align: top;
    }
    .college-row td {
      background: #dbeafe;
      color: #1e3a8a;
      font-weight: 700;
    }
    .number {
      text-align: center;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <h1>Penalyze Attendees Absences and Fines Report</h1>
  <p>Generated: ${escapeHtml(generatedAt)}</p>
  <table>
    <thead>
      <tr>
        <th>Student ID</th>
        <th>Name</th>
        <th>College</th>
        <th>Total Absences</th>
        <th>Fine / Penalty</th>
        <th>Attendance Records</th>
        <th>Latest Date</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || '<tr><td colspan="7">No report data available.</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
}

export default function ExportReport(props: ExportReportProps) {
  const reportRows = useMemo(
    () => getReportRows(props.attendanceRecords, props.fines),
    [props.attendanceRecords, props.fines],
  );
  const rowsByCollege = useMemo(() => getRowsByCollege(reportRows), [reportRows]);
  const totalAbsences = useMemo(
    () => reportRows.reduce((total, row) => total + row.totalAbsences, 0),
    [reportRows],
  );

  function handleExport() {
    const workbook = buildExcelDocument(rowsByCollege);
    const blob = new Blob(["\ufeff", workbook], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `penalyze-fines-report-by-college-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={props.isLoading}
          className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black"
        >
          <Eye className="mr-2 size-4" aria-hidden="true" />
          Preview & Export
        </Button>
      </DialogTrigger>
      <DialogContent
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="flex max-h-[95svh] flex-col overflow-hidden sm:max-w-6xl"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Report preview by college</DialogTitle>
          <DialogDescription>
            Preview attendees with total absences and fines, including zero-absence attendees.
          </DialogDescription>
        </DialogHeader>

        <div className="grid shrink-0 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-muted/40 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Attendees</p>
            <p className="mt-1 text-2xl font-black">{reportRows.length}</p>
          </div>
          <div className="rounded-2xl border bg-muted/40 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Colleges</p>
            <p className="mt-1 text-2xl font-black">{Object.keys(rowsByCollege).length}</p>
          </div>
          <div className="rounded-2xl border bg-muted/40 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Total absences</p>
            <p className="mt-1 text-2xl font-black">{totalAbsences}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border">
          <table className="w-full min-w-max text-left text-sm">
            <thead className="sticky top-0 z-10 border-b bg-background text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Student ID</th>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">College</th>
                <th className="px-3 py-3">Total Absences</th>
                <th className="px-3 py-3">Fine / Penalty</th>
                <th className="px-3 py-3">Records</th>
                <th className="px-3 py-3">Latest</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(rowsByCollege).length ? (
                Object.entries(rowsByCollege).map(([college, rows]) => (
                  <Fragment key={college}>
                    <tr key={`${college}-heading`} className="bg-muted/60">
                      <td colSpan={7} className="px-3 py-3 font-black">
                        {college}
                      </td>
                    </tr>
                    {rows.map((row) => (
                      <tr key={row.key} className="border-b last:border-b-0">
                        <td className="px-3 py-3">{row.studentId || "—"}</td>
                        <td className="px-3 py-3 font-semibold">{row.name || "—"}</td>
                        <td className="px-3 py-3">{row.college}</td>
                        <td className="px-3 py-3 font-black">{row.totalAbsences}</td>
                        <td className="max-w-sm px-3 py-3 text-muted-foreground">{getFineText(row)}</td>
                        <td className="px-3 py-3">{row.recordsCount}</td>
                        <td className="px-3 py-3">{formatDate(row.latestDate)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm font-semibold text-muted-foreground">
                    No report data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            disabled={props.isLoading || !reportRows.length}
            onClick={handleExport}
            className="min-h-11 rounded-2xl px-5 py-2 text-sm font-black"
          >
            <Download className="mr-2 size-4" aria-hidden="true" />
            Export Excel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}