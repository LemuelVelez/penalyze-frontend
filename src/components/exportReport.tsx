import { Fragment, useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type ExportReportProps = {
  attendanceRecords: AttendanceRecord[];
  fines: FineRecord[];
  isLoading?: boolean;
  yearLabel?: string;
};

type FineSummary = {
  absences: number;
  penalty: string;
  status: string;
};

type ReportRow = {
  key: string;
  college: string;
  studentId: string;
  name: string;
  fines: FineSummary[];
  latestDate: string;
};

const ALL_COLLEGES_VALUE = "__all_colleges__";

function cleanValue(value?: string | number | null) {
  return String(value ?? "").trim();
}

function normalizeValue(value?: string | number | null) {
  return cleanValue(value).toLowerCase().replace(/\s+/g, " ");
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

function getSafeFileNamePart(value: string) {
  const normalized = normalizeValue(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "all-colleges";
}

function getAbsenceCount(value?: number | null) {
  const absences = Number(value ?? 0);
  return Number.isFinite(absences) && absences > 0 ? absences : 0;
}

function getReportRows(
  attendanceRecords: AttendanceRecord[],
  fines: FineRecord[],
) {
  const rows = new Map<string, ReportRow>();
  const rowsByStudentId = new Map<string, ReportRow[]>();

  attendanceRecords
    .filter((record) => !record.deleted_at)
    .forEach((record) => {
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
          fines: [],
          latestDate: recordDate ?? "",
        };

        rows.set(key, row);

        const studentKey = normalizeValue(studentId);
        if (studentKey) {
          rowsByStudentId.set(studentKey, [
            ...(rowsByStudentId.get(studentKey) ?? []),
            row,
          ]);
        }

        return;
      }

      if (!current.name && record.name) current.name = cleanValue(record.name);

      const latestTime = getRecordTime(current.latestDate);
      if (recordTime >= latestTime) {
        current.latestDate = recordDate ?? current.latestDate;
        if (record.name) current.name = cleanValue(record.name);
      }
    });

  fines.forEach((fine) => {
    const studentKey = normalizeValue(fine.student_id);
    const matchedRows = studentKey
      ? (rowsByStudentId.get(studentKey) ?? [])
      : [];
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
                fines: [],
                latestDate: fine.created_at ?? "",
              };

              rows.set(key, row);

              if (studentKey) {
                rowsByStudentId.set(studentKey, [
                  ...(rowsByStudentId.get(studentKey) ?? []),
                  row,
                ]);
              }

              return row;
            })(),
          ];

    targetRows.forEach((row) => {
      if (!row.name && fine.name) row.name = cleanValue(fine.name);
      if (!row.studentId && fine.student_id)
        row.studentId = cleanValue(fine.student_id);

      const absences = getAbsenceCount(fine.no_of_absences);
      const penalty =
        cleanValue(fine.prescribed_penalty) || "No prescribed penalty";
      const status = cleanValue(fine.status).toUpperCase() || "NO STATUS";
      const fineKey = `${absences}::${normalizeValue(penalty)}::${normalizeValue(status)}`;

      if (
        !row.fines.some(
          (item) =>
            `${item.absences}::${normalizeValue(item.penalty)}::${normalizeValue(item.status)}` ===
            fineKey,
        )
      ) {
        row.fines.push({ absences, penalty, status });
      }
    });
  });

  return Array.from(rows.values()).sort((left, right) => {
    const collegeCompare = left.college.localeCompare(
      right.college,
      undefined,
      {
        numeric: true,
        sensitivity: "base",
      },
    );

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

function getAbsenceText(row: ReportRow) {
  if (!row.fines.length) return "0";

  const absences = Array.from(new Set(row.fines.map((fine) => fine.absences)))
    .filter((value) => value > 0)
    .sort((left, right) => left - right);

  return absences.length ? absences.join(", ") : "0";
}

function getFineText(row: ReportRow) {
  if (!row.fines.length) return "No fine";
  return row.fines.map((fine) => `${fine.penalty} (${fine.status})`).join("; ");
}

function buildExcelDocument(
  rowsByCollege: Record<string, ReportRow[]>,
  selectedCollegeLabel: string,
  selectedYearLabel: string,
) {
  const generatedAt = new Date().toLocaleString();

  const bodyRows = Object.entries(rowsByCollege)
    .map(([college, rows]) => {
      return `
        <tr class="college-row">
          <td colspan="5">${escapeHtml(college)} — ${rows.length} attendee/s</td>
        </tr>
        ${rows
          .map(
            (row) => `
              <tr>
                <td>${escapeHtml(row.studentId || "—")}</td>
                <td>${escapeHtml(row.name || "—")}</td>
                <td>${escapeHtml(row.college)}</td>
                <td class="absences-cell">${escapeHtml(getAbsenceText(row))}</td>
                <td>${escapeHtml(getFineText(row))}</td>
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
      table-layout: fixed;
    }
    th {
      background: #1d4ed8;
      color: #ffffff;
      border: 1px solid #1e40af;
      padding: 10px;
      text-align: left;
      font-weight: 700;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    td {
      border: 1px solid #cbd5e1;
      padding: 9px;
      vertical-align: top;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .college-row td {
      background: #dbeafe;
      color: #1e3a8a;
      font-weight: 700;
    }
    .absences-cell {
      text-align: center;
      vertical-align: middle;
    }
  </style>
</head>
<body>
  <h1>Penalyze Attendees Fines Report</h1>
  <p>Generated: ${escapeHtml(generatedAt)}</p>
  <p>Year filter: ${escapeHtml(selectedYearLabel)}</p>
  <p>College filter: ${escapeHtml(selectedCollegeLabel)}</p>
  <table>
    <thead>
      <tr>
        <th>Student ID</th>
        <th>Name</th>
        <th>College</th>
        <th class="absences-cell">Absences</th>
        <th>Fine / Penalty</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || '<tr><td colspan="5">No report data available.</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
}

export default function ExportReport(props: ExportReportProps) {
  const [selectedCollege, setSelectedCollege] = useState(ALL_COLLEGES_VALUE);
  const reportRows = useMemo(
    () => getReportRows(props.attendanceRecords, props.fines),
    [props.attendanceRecords, props.fines],
  );
  const collegeOptions = useMemo(
    () => Object.keys(getRowsByCollege(reportRows)),
    [reportRows],
  );
  const filteredReportRows = useMemo(() => {
    if (selectedCollege === ALL_COLLEGES_VALUE) return reportRows;
    return reportRows.filter((row) => row.college === selectedCollege);
  }, [reportRows, selectedCollege]);
  const rowsByCollege = useMemo(
    () => getRowsByCollege(filteredReportRows),
    [filteredReportRows],
  );
  const selectedCollegeLabel =
    selectedCollege === ALL_COLLEGES_VALUE ? "All colleges" : selectedCollege;
  const selectedYearLabel = props.yearLabel ?? "All years";

  useEffect(() => {
    if (
      selectedCollege !== ALL_COLLEGES_VALUE &&
      !collegeOptions.includes(selectedCollege)
    ) {
      setSelectedCollege(ALL_COLLEGES_VALUE);
    }
  }, [collegeOptions, selectedCollege]);

  function handleExport() {
    const workbook = buildExcelDocument(
      rowsByCollege,
      selectedCollegeLabel,
      selectedYearLabel,
    );
    const blob = new Blob(["\ufeff", workbook], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const collegeFileName = getSafeFileNamePart(selectedCollegeLabel);
    const yearFileName = getSafeFileNamePart(selectedYearLabel);

    link.href = url;
    link.download = `penalyze-fines-report-${collegeFileName}-${yearFileName}-${new Date().toISOString().slice(0, 10)}.xls`;
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
          className="min-h-11 rounded-2xl px-4 py-2 text-xs font-black"
        >
          <Eye className="size-4" aria-hidden="true" />
          Preview & Export
        </Button>
      </DialogTrigger>
      <DialogContent
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden sm:max-w-6xl"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Report preview by college</DialogTitle>
          <DialogDescription>
            Preview attendees with fines for the selected year, then export all
            colleges or one specific college.
          </DialogDescription>
        </DialogHeader>

        <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0 rounded-2xl border bg-muted/40 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
              College to preview/export
            </p>
            <Select value={selectedCollege} onValueChange={setSelectedCollege}>
              <SelectTrigger className="mt-2 min-h-11 w-full max-w-64 overflow-hidden rounded-2xl bg-background text-left text-xs font-semibold">
                <SelectValue placeholder="All colleges" className="truncate" />
              </SelectTrigger>
              <SelectContent className="max-w-xs">
                <SelectItem value={ALL_COLLEGES_VALUE}>All colleges</SelectItem>
                {collegeOptions.map((college) => (
                  <SelectItem
                    key={college}
                    value={college}
                    className="break-words"
                  >
                    {college}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-2xl border bg-muted/40 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
              Year
            </p>
            <p className="mt-1 break-words text-2xl font-black">
              {selectedYearLabel}
            </p>
          </div>
          <div className="rounded-2xl border bg-muted/40 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
              Attendees
            </p>
            <p className="mt-1 text-2xl font-black">
              {filteredReportRows.length}
            </p>
          </div>
          <div className="rounded-2xl border bg-muted/40 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
              Colleges
            </p>
            <p className="mt-1 text-2xl font-black">
              {Object.keys(rowsByCollege).length}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-3 md:grid-cols-2 lg:hidden">
            {Object.entries(rowsByCollege).length ? (
              Object.entries(rowsByCollege).flatMap(([college, rows]) =>
                rows.map((row) => (
                  <article key={row.key} className="min-w-0 rounded-2xl border bg-background p-4">
                    <div className="min-w-0">
                      <p className="break-all font-black" title={row.studentId || "—"}>{row.studentId || "—"}</p>
                      <p className="mt-1 break-words text-sm font-semibold" title={row.name || "—"}>{row.name || "—"}</p>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase text-muted-foreground">College</p>
                        <p className="mt-1 truncate font-semibold" title={college}>{college}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase text-muted-foreground">Absences</p>
                        <p className="mt-1 font-black">{getAbsenceText(row)}</p>
                      </div>
                      <div className="col-span-2 min-w-0">
                        <p className="text-xs font-bold uppercase text-muted-foreground">Fine / Penalty</p>
                        <p className="mt-1 break-words font-semibold">{getFineText(row)}</p>
                      </div>
                    </div>
                  </article>
                )),
              )
            ) : (
              <div className="rounded-2xl border border-dashed p-6 text-center text-sm font-semibold text-muted-foreground md:col-span-2">
                No report data available.
              </div>
            )}
          </div>

          <div className="hidden overflow-auto rounded-2xl border lg:block">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b bg-background text-xs uppercase text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-20 bg-background px-3 py-3">Student ID</th>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">College</th>
                <th className="px-3 py-3 text-center">Absences</th>
                <th className="px-3 py-3">Fine / Penalty</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(rowsByCollege).length ? (
                Object.entries(rowsByCollege).map(([college, rows]) => (
                  <Fragment key={college}>
                    <tr key={`${college}-heading`} className="bg-muted/60">
                      <td
                        colSpan={5}
                        className="break-words px-3 py-3 font-black"
                      >
                        {college}
                      </td>
                    </tr>
                    {rows.map((row) => (
                      <tr key={row.key} className="border-b last:border-b-0">
                        <td className="sticky left-0 z-10 max-w-40 break-all bg-background px-3 py-3">
                          {row.studentId || "—"}
                        </td>
                        <td className="max-w-56 break-words px-3 py-3 font-semibold">
                          {row.name || "—"}
                        </td>
                        <td className="max-w-56 break-words px-3 py-3">
                          {row.college}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {getAbsenceText(row)}
                        </td>
                        <td className="max-w-sm break-words px-3 py-3 text-muted-foreground">
                          {getFineText(row)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-10 text-center text-sm font-semibold text-muted-foreground"
                  >
                    No report data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            disabled={props.isLoading || !filteredReportRows.length}
            onClick={handleExport}
            className="min-h-11 rounded-2xl px-5 py-2 text-sm font-black"
          >
            <Download className="size-4" aria-hidden="true" />
            Export Excel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}