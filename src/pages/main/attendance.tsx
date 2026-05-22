import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  deleteAttendanceEvent,
  deleteAttendanceRecord,
  getAcceptedAttendanceFileTypes,
  listAttendanceEvents,
  listAttendanceRecords,
  previewAttendanceFile,
  saveAttendanceEvent,
  saveAttendanceFile,
  saveManualAttendanceRecord,
  updateAttendanceEvent,
  updateAttendanceRecord
} from "../../api/attendance";
import type {
  AttendanceEvent,
  AttendanceEventInput,
  AttendancePreviewResult,
  SavedAttendanceImportResult,
  AttendanceRecord,
  ManualAttendanceInput
} from "../../api/attendance";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";

type ManualAttendanceFormState = {
  eventId: string;
  studentId: string;
  name: string;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
  noOfAbsences: string;
  remarks: string;
};

type AttendanceEventFormState = {
  name: string;
  eventDate: string;
  description: string;
};

const emptyManualAttendanceForm: ManualAttendanceFormState = {
  eventId: "",
  studentId: "",
  name: "",
  yearLevel: "",
  college: "",
  program: "",
  institution: "",
  noOfAbsences: "0",
  remarks: ""
};

const emptyAttendanceEventForm: AttendanceEventFormState = {
  name: "",
  eventDate: "",
  description: ""
};

const ATTENDANCE_EXCEL_FILE_TYPES = [
  ".xlsx",
  ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel"
];

const ATTENDANCE_TEXT_FILE_TYPES = [".csv", ".txt", "text/csv", "text/plain"];

const ATTENDANCE_IMPORT_HEADERS = [
  "Event",
  "Student ID",
  "Name",
  "Year Level",
  "College",
  "Program",
  "Institution",
  "No. of Absences",
  "Remarks"
];

type NormalizedAttendanceImportRow = {
  eventName: string;
  studentId: string;
  name: string;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
  noOfAbsences: string;
  remarks: string;
};

type AttendanceHeaderKey = keyof NormalizedAttendanceImportRow;

const ATTENDANCE_HEADER_ALIASES: Record<AttendanceHeaderKey, string[]> = {
  eventName: ["event", "event name", "eventname", "activity", "activity name"],
  studentId: [
    "student id",
    "studentid",
    "student no",
    "student number",
    "student id no",
    "student id number",
    "id number",
    "id no"
  ],
  name: ["name", "full name", "fullname", "student name", "complete name"],
  yearLevel: ["year level", "yearlevel", "year", "level", "grade level"],
  college: ["college", "department", "school college"],
  program: ["program", "course", "degree", "section program"],
  institution: ["institution", "school", "campus", "university"],
  noOfAbsences: ["no of absences", "no. of absences", "number of absences", "absences", "absence", "total absences"],
  remarks: ["remarks", "remark", "notes", "note", "status"]
};

function getAttendanceUploadAccept() {
  const configuredTypes = getAcceptedAttendanceFileTypes()
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean);

  return Array.from(new Set([...configuredTypes, ...ATTENDANCE_EXCEL_FILE_TYPES, ...ATTENDANCE_TEXT_FILE_TYPES])).join(",");
}

function getFileExtension(fileName: string) {
  return fileName.toLowerCase().split(".").pop() ?? "";
}

function isTextBasedAttendanceFile(file: File) {
  const extension = getFileExtension(file.name);
  const type = file.type.toLowerCase();

  return extension === "csv" || extension === "txt" || type.includes("csv") || type.includes("text");
}

function cleanImportValue(value?: string | number | null) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeImportHeader(value?: string | number | null) {
  return cleanImportValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectDelimiter(text: string) {
  const sampleLine = text
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0) ?? "";

  const delimiters = [",", "\t", ";", "|"];

  return delimiters.reduce(
    (selected, delimiter) => {
      const count = sampleLine.split(delimiter).length;
      return count > selected.count ? { delimiter, count } : selected;
    },
    { delimiter: ",", count: 0 }
  ).delimiter;
}

function parseDelimitedText(text: string, delimiter = detectDelimiter(text)) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let isQuoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (isQuoted && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else {
        isQuoted = !isQuoted;
      }
      continue;
    }

    if (character === delimiter && !isQuoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !isQuoted) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(cell);
      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

function getHeaderIndex(headers: string[], key: AttendanceHeaderKey) {
  const normalizedAliases = ATTENDANCE_HEADER_ALIASES[key].map(normalizeImportHeader);

  return headers.findIndex((header) => normalizedAliases.includes(normalizeImportHeader(header)));
}

function getHeaderValue(row: string[], headers: string[], key: AttendanceHeaderKey) {
  const index = getHeaderIndex(headers, key);
  return index >= 0 ? cleanImportValue(row[index]) : "";
}

function getLabeledValue(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`${escapeRegExp(label)}\\s*[:=\\-]\\s*([^\\n\\r]+)`, "i");
    const match = text.match(pattern);

    if (match?.[1]) {
      return cleanImportValue(match[1]);
    }
  }

  return "";
}

function getNumericAbsenceValue(value: string) {
  const numericValue = Number.parseInt(value.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(numericValue) && numericValue >= 0 ? String(numericValue) : "0";
}

function getDefaultUploadEventName(selectedFile: File) {
  const baseName = selectedFile.name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return baseName || "Attendance event";
}

function escapeCsvValue(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function toNormalizedAttendanceCsv(rows: NormalizedAttendanceImportRow[]) {
  const csvRows = [
    ATTENDANCE_IMPORT_HEADERS,
    ...rows.map((row) => [
      row.eventName,
      row.studentId,
      row.name,
      row.yearLevel,
      row.college,
      row.program,
      row.institution,
      row.noOfAbsences,
      row.remarks
    ])
  ];

  return csvRows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}

function getNormalizedAttendanceRowsFromText(text: string, fileName: string) {
  const rows = parseDelimitedText(text);
  if (!rows.length) return [];

  const headers = rows[0].map(cleanImportValue);
  const recordsByStudentId = new Map<string, NormalizedAttendanceImportRow>();

  rows.slice(1).forEach((row, index) => {
    const searchableText = row.join("\n");
    const studentId =
      getHeaderValue(row, headers, "studentId") ||
      getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.studentId);
    const name = getHeaderValue(row, headers, "name") || getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.name);

    if (!studentId || !name) return;

    const normalizedStudentId = cleanImportValue(studentId).toUpperCase();
    const currentRecord = recordsByStudentId.get(normalizedStudentId);

    const normalizedRow: NormalizedAttendanceImportRow = {
      eventName:
        getHeaderValue(row, headers, "eventName") ||
        getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.eventName) ||
        currentRecord?.eventName ||
        "",
      studentId: normalizedStudentId,
      name: cleanImportValue(name),
      yearLevel:
        getHeaderValue(row, headers, "yearLevel") ||
        getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.yearLevel) ||
        currentRecord?.yearLevel ||
        "",
      college:
        getHeaderValue(row, headers, "college") ||
        getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.college) ||
        currentRecord?.college ||
        "",
      program:
        getHeaderValue(row, headers, "program") ||
        getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.program) ||
        currentRecord?.program ||
        "",
      institution:
        getHeaderValue(row, headers, "institution") ||
        getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.institution) ||
        currentRecord?.institution ||
        "",
      noOfAbsences: getNumericAbsenceValue(getHeaderValue(row, headers, "noOfAbsences") || currentRecord?.noOfAbsences || "0"),
      remarks:
        getHeaderValue(row, headers, "remarks") ||
        currentRecord?.remarks ||
        `Imported from ${fileName} row ${index + 2}`
    };

    recordsByStudentId.set(normalizedStudentId, normalizedRow);
  });

  return Array.from(recordsByStudentId.values());
}

async function getAttendanceUploadFile(file: File) {
  if (!isTextBasedAttendanceFile(file)) {
    return { file, normalizedRowsCount: 0 };
  }

  const fileText = await file.text();
  const normalizedRows = getNormalizedAttendanceRowsFromText(fileText, file.name);

  if (!normalizedRows.length) {
    return { file, normalizedRowsCount: 0 };
  }

  const normalizedCsv = toNormalizedAttendanceCsv(normalizedRows);
  const normalizedFileName = file.name.replace(/\.[^.]+$/, "") || "attendance-import";

  return {
    file: new File([normalizedCsv], `${normalizedFileName}-normalized.csv`, { type: "text/csv" }),
    normalizedRowsCount: normalizedRows.length
  };
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(date);
}

function getManualRecordSource(record: AttendanceRecord) {
  if (record.event_name) return record.event_name;
  return record.import_id ? "File import" : "Manual";
}

function FileDropZone(props: {
  file: File | null;
  isDragging: boolean;
  onFileChange: (file: File | null) => void;
  onDragStateChange: (isDragging: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function selectFile(fileList: FileList | null) {
    props.onFileChange(fileList?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    props.onDragStateChange(false);
    selectFile(event.dataTransfer.files);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    props.onDragStateChange(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    props.onDragStateChange(false);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files);
  }

  return (
    <Label
      htmlFor="attendance-upload"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed bg-card p-6 text-center shadow-sm transition sm:p-8 ${
        props.isDragging ? "border-primary bg-accent" : "border-border hover:border-primary/70 hover:bg-accent/40"
      }`}
    >
      <Input
        ref={inputRef}
        id="attendance-upload"
        type="file"
        accept={getAttendanceUploadAccept()}
        onChange={handleInputChange}
        className="sr-only"
      />

      <div className="rounded-full border bg-background px-4 py-2 text-xs font-black uppercase tracking-wide text-muted-foreground">
        XLSX, XLS, CSV, TXT, DOCX, DOC
      </div>
      <h2 className="mt-4 text-2xl font-black">Upload attendance file</h2>

      {props.file ? (
        <div className="mt-5 w-full max-w-xl rounded-2xl border bg-background p-4 text-left">
          <p className="truncate text-sm font-black">{props.file.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{(props.file.size / 1024).toFixed(1)} KB</p>
        </div>
      ) : null}
    </Label>
  );
}

function EventFields(props: {
  events: AttendanceEvent[];
  eventId: string;
  eventName: string;
  eventDate: string;
  eventDescription: string;
  onEventIdChange: (value: string) => void;
  onEventNameChange: (value: string) => void;
  onEventDateChange: (value: string) => void;
  onEventDescriptionChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <Label htmlFor="upload-event-id">Event</Label>
        <select
          id="upload-event-id"
          value={props.eventId}
          onChange={(event) => props.onEventIdChange(event.target.value)}
          className="mt-2 flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Create new event from the uploaded file</option>
          {props.events.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="upload-event-name">Event name</Label>
        <Input
          id="upload-event-name"
          value={props.eventName}
          onChange={(event) => props.onEventNameChange(event.target.value)}
          disabled={Boolean(props.eventId)}
          className="mt-2"
          placeholder="Required before saving the import"
        />
      </div>

      <div>
        <Label htmlFor="upload-event-date">Event date</Label>
        <Input
          id="upload-event-date"
          type="date"
          value={props.eventDate}
          onChange={(event) => props.onEventDateChange(event.target.value)}
          disabled={Boolean(props.eventId)}
          className="mt-2"
        />
      </div>

      <div>
        <Label htmlFor="upload-event-description">Description</Label>
        <Input
          id="upload-event-description"
          value={props.eventDescription}
          onChange={(event) => props.onEventDescriptionChange(event.target.value)}
          disabled={Boolean(props.eventId)}
          className="mt-2"
          placeholder="Optional"
        />
      </div>
    </div>
  );
}

function DeleteAttendanceConfirmation(props: {
  record: AttendanceRecord;
  isDeleting: boolean;
  onConfirm: (id: string) => void;
  className?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" disabled={props.isDeleting} className={`border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:border-destructive/50 focus-visible:ring-destructive/30 ${props.className ?? ""}`}>
          {props.isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete attendance record?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the attendance record for {props.record.name}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => props.onConfirm(props.record.id)}
            className="bg-destructive text-destructive-foreground hover:opacity-90"
          >
            Delete Record
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteAttendanceRecordsConfirmation(props: {
  label: string;
  title: string;
  description: string;
  isDeleting: boolean;
  disabled: boolean;
  onConfirm: () => void | Promise<void>;
  className?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={props.disabled || props.isDeleting}
          className={`border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:border-destructive/50 focus-visible:ring-destructive/30 ${props.className ?? ""}`}
        >
          {props.isDeleting ? "Deleting..." : props.label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={props.isDeleting}
            onClick={() => {
              void props.onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:opacity-90"
          >
            Confirm Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteEventConfirmation(props: {
  event: AttendanceEvent;
  isDeleting: boolean;
  onConfirm: (id: string) => void;
  className?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" disabled={props.isDeleting} className={`border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:border-destructive/50 focus-visible:ring-destructive/30 ${props.className ?? ""}`}>
          {props.isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete event?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete {props.event.name} and its linked attendance records.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => props.onConfirm(props.event.id)}
            className="bg-destructive text-destructive-foreground hover:opacity-90"
          >
            Delete Event
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ManualAttendanceDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: AttendanceEvent[];
  form: ManualAttendanceFormState;
  editingRecordId: string;
  isSaving: boolean;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onClear: () => void;
  onChange: <K extends keyof ManualAttendanceFormState>(key: K, value: ManualAttendanceFormState[K]) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" className="min-h-11 rounded-xl px-5 py-2">
          Add Attendance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[95svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{props.editingRecordId ? "Edit attendance" : "Add attendance"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={props.onSubmit} className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <Label htmlFor="manual-event-id">Event</Label>
            <select
              id="manual-event-id"
              value={props.form.eventId}
              onChange={(event) => props.onChange("eventId", event.target.value)}
              className="mt-2 flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">No event</option>
              {props.events.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="manual-student-id">Student ID</Label>
            <Input
              id="manual-student-id"
              value={props.form.studentId}
              onChange={(event) => props.onChange("studentId", event.target.value)}
              className="mt-2"
              required
            />
          </div>

          <div>
            <Label htmlFor="manual-name">Name</Label>
            <Input
              id="manual-name"
              value={props.form.name}
              onChange={(event) => props.onChange("name", event.target.value)}
              className="mt-2"
              required
            />
          </div>

          <div>
            <Label htmlFor="manual-year-level">Year level</Label>
            <Input
              id="manual-year-level"
              value={props.form.yearLevel}
              onChange={(event) => props.onChange("yearLevel", event.target.value)}
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="manual-college">College</Label>
            <Input
              id="manual-college"
              value={props.form.college}
              onChange={(event) => props.onChange("college", event.target.value)}
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="manual-program">Program</Label>
            <Input
              id="manual-program"
              value={props.form.program}
              onChange={(event) => props.onChange("program", event.target.value)}
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="manual-institution">Institution</Label>
            <Input
              id="manual-institution"
              value={props.form.institution}
              onChange={(event) => props.onChange("institution", event.target.value)}
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="manual-absences">No. of Absences</Label>
            <Input
              id="manual-absences"
              type="number"
              min="0"
              value={props.form.noOfAbsences}
              onChange={(event) => props.onChange("noOfAbsences", event.target.value)}
              className="mt-2"
              required
            />
          </div>

          <div className="lg:col-span-2">
            <Label htmlFor="manual-remarks">Remarks</Label>
            <Textarea
              id="manual-remarks"
              value={props.form.remarks}
              onChange={(event) => props.onChange("remarks", event.target.value)}
              className="mt-2"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
            <Button type="submit" disabled={props.isSaving} className="min-h-12 rounded-2xl">
              {props.isSaving ? "Saving..." : props.editingRecordId ? "Update Attendance" : "Save Attendance"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={props.isSaving}
              onClick={props.onClear}
              className="min-h-12 rounded-2xl"
            >
              {props.editingRecordId ? "Cancel Edit" : "Clear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AttendanceEventDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: AttendanceEventFormState;
  editingEventId: string;
  isSaving: boolean;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onClear: () => void;
  onChange: <K extends keyof AttendanceEventFormState>(key: K, value: AttendanceEventFormState[K]) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11 rounded-xl px-5 py-2">
          Add Event
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[95svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{props.editingEventId ? "Edit event" : "Add event"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={props.onSubmit} className="grid gap-4">
          <div>
            <Label htmlFor="event-name">Event name</Label>
            <Input
              id="event-name"
              value={props.form.name}
              onChange={(event) => props.onChange("name", event.target.value)}
              className="mt-2"
              required
            />
          </div>

          <div>
            <Label htmlFor="event-date">Event date</Label>
            <Input
              id="event-date"
              type="date"
              value={props.form.eventDate}
              onChange={(event) => props.onChange("eventDate", event.target.value)}
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="event-description">Description</Label>
            <Textarea
              id="event-description"
              value={props.form.description}
              onChange={(event) => props.onChange("description", event.target.value)}
              className="mt-2"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button type="submit" disabled={props.isSaving} className="min-h-12 rounded-2xl">
              {props.isSaving ? "Saving..." : props.editingEventId ? "Update Event" : "Save Event"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={props.isSaving}
              onClick={props.onClear}
              className="min-h-12 rounded-2xl"
            >
              {props.editingEventId ? "Cancel Edit" : "Clear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AttendancePage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AttendancePreviewResult | null>(null);
  const [saved, setSaved] = useState<SavedAttendanceImportResult | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [manualForm, setManualForm] = useState<ManualAttendanceFormState>(emptyManualAttendanceForm);
  const [eventForm, setEventForm] = useState<AttendanceEventFormState>(emptyAttendanceEventForm);
  const [uploadEventId, setUploadEventId] = useState("");
  const [uploadEventName, setUploadEventName] = useState("");
  const [uploadEventDate, setUploadEventDate] = useState("");
  const [uploadEventDescription, setUploadEventDescription] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState("");
  const [editingEventId, setEditingEventId] = useState("");
  const [deletingRecordId, setDeletingRecordId] = useState("");
  const [deletingEventId, setDeletingEventId] = useState("");
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [error, setError] = useState("");

  const invalidRows = useMemo(() => preview?.rows.filter((row) => row.errors.length > 0) ?? [], [preview]);
  const selectedRecordIdsSet = useMemo(() => new Set(selectedRecordIds), [selectedRecordIds]);
  const selectedRecordCount = selectedRecordIds.length;
  const allRecordsSelected = records.length > 0 && selectedRecordCount === records.length;
  const recordHeaderChecked = allRecordsSelected ? true : selectedRecordCount > 0 ? "indeterminate" : false;
  const uploadEventReady = Boolean(uploadEventId || uploadEventName.trim());

  function updateManualForm<K extends keyof ManualAttendanceFormState>(key: K, value: ManualAttendanceFormState[K]) {
    setManualForm((current) => ({ ...current, [key]: value }));
  }

  function updateEventForm<K extends keyof AttendanceEventFormState>(key: K, value: AttendanceEventFormState[K]) {
    setEventForm((current) => ({ ...current, [key]: value }));
  }

  function handleToggleRecordSelected(id: string, checked: boolean | "indeterminate") {
    setSelectedRecordIds((current) => {
      if (checked === true) {
        return current.includes(id) ? current : [...current, id];
      }

      return current.filter((recordId) => recordId !== id);
    });
  }

  function handleToggleAllRecords(checked: boolean | "indeterminate") {
    setSelectedRecordIds(checked === true ? records.map((record) => record.id) : []);
  }

  function handleUploadFileChange(selectedFile: File | null) {
    setFile(selectedFile);
    setPreview(null);
    setSaved(null);
    setError("");

    if (selectedFile) {
      setUploadEventId("");
      setUploadEventName(getDefaultUploadEventName(selectedFile));
      setUploadEventDate("");
      setUploadEventDescription("");
      return;
    }

    setUploadEventId("");
    setUploadEventName("");
    setUploadEventDate("");
    setUploadEventDescription("");
  }

  function handleUploadEventIdChange(value: string) {
    setUploadEventId(value);

    if (value) {
      setUploadEventName("");
      setUploadEventDate("");
      setUploadEventDescription("");
    }
  }

  async function loadRecords() {
    setIsLoadingRecords(true);
    setError("");

    try {
      const [rows, eventRows] = await Promise.all([
        listAttendanceRecords({ limit: 100, offset: 0 }),
        listAttendanceEvents({ limit: 100, offset: 0 })
      ]);
      const rowIds = new Set(rows.map((record) => record.id));

      setRecords(rows);
      setEvents(eventRows);
      setSelectedRecordIds((current) => current.filter((id) => rowIds.has(id)));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load attendance records.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoadingRecords(false);
    }
  }

  async function handlePreview() {
    if (!file) {
      setError("Please choose or drop a file first.");
      toast.error("Please choose or drop a file first.");
      return;
    }

    setIsPreviewing(true);
    setError("");
    setSaved(null);

    try {
      const upload = await getAttendanceUploadFile(file);
      const result = await previewAttendanceFile(upload.file);
      setPreview(result ?? null);
      toast.success(
        upload.normalizedRowsCount
          ? `Attendance preview generated from ${upload.normalizedRowsCount} extracted student row/s.`
          : "Attendance file preview generated."
      );
    } catch (previewError) {
      const message = previewError instanceof Error ? previewError.message : "Unable to preview attendance file.";
      setPreview(null);
      setError(message);
      toast.error(message);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleSave() {
    if (!file) {
      setError("Please choose or drop a file first.");
      toast.error("Please choose or drop a file first.");
      return;
    }

    const eventName = uploadEventName.trim();

    if (!uploadEventId && !eventName) {
      const message = "Please select an existing event or enter a new event name before saving the import.";
      setError(message);
      toast.error(message);
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const upload = await getAttendanceUploadFile(file);
      const result = await saveAttendanceFile(upload.file, {
        eventId: uploadEventId || undefined,
        eventName: uploadEventId ? undefined : eventName,
        eventDate: uploadEventId ? undefined : uploadEventDate || undefined,
        eventDescription: uploadEventId ? undefined : uploadEventDescription.trim() || undefined
      });
      setSaved(result ?? null);
      setPreview(result ?? null);
      await loadRecords();
      toast.success(`Attendance imported successfully. Created ${result?.createdFines.length ?? 0} fine record/s.`);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save attendance file.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleManualSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const studentId = manualForm.studentId.trim();
    const name = manualForm.name.trim();
    const noOfAbsences = Number(manualForm.noOfAbsences);

    if (!studentId) {
      setError("Student ID is required.");
      toast.error("Student ID is required.");
      return;
    }

    if (!name) {
      setError("Name is required.");
      toast.error("Name is required.");
      return;
    }

    if (!Number.isInteger(noOfAbsences) || noOfAbsences < 0) {
      setError("No. of Absences must be zero or a positive whole number.");
      toast.error("No. of Absences must be zero or a positive whole number.");
      return;
    }

    const payload: ManualAttendanceInput = {
      eventId: manualForm.eventId || undefined,
      studentId,
      name,
      yearLevel: manualForm.yearLevel.trim(),
      college: manualForm.college.trim(),
      program: manualForm.program.trim(),
      institution: manualForm.institution.trim(),
      noOfAbsences,
      remarks: manualForm.remarks.trim()
    };

    setIsSavingManual(true);
    setError("");

    try {
      const result = editingRecordId
        ? await updateAttendanceRecord(editingRecordId, payload)
        : await saveManualAttendanceRecord(payload);

      if (result?.record) {
        setRecords((current) => {
          if (editingRecordId) {
            return current.map((record) => (record.id === result.record.id ? result.record : record));
          }

          return [result.record, ...current.filter((record) => record.id !== result.record.id)];
        });
      } else {
        await loadRecords();
      }

      await loadRecords();
      handleCancelEdit();
      setManualDialogOpen(false);
      toast.success(editingRecordId ? "Attendance record updated successfully." : "Attendance record saved successfully.");
    } catch (manualError) {
      const message = manualError instanceof Error ? manualError.message : "Unable to save attendance record.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSavingManual(false);
    }
  }

  async function handleEventSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = eventForm.name.trim();
    if (!name) {
      setError("Event name is required.");
      toast.error("Event name is required.");
      return;
    }

    const payload: AttendanceEventInput = {
      name,
      eventDate: eventForm.eventDate || undefined,
      description: eventForm.description.trim()
    };

    setIsSavingEvent(true);
    setError("");

    try {
      if (editingEventId) {
        await updateAttendanceEvent(editingEventId, payload);
        toast.success("Event updated successfully.");
      } else {
        await saveAttendanceEvent(payload);
        toast.success("Event saved successfully.");
      }

      await loadRecords();
      handleCancelEventEdit();
      setEventDialogOpen(false);
    } catch (eventError) {
      const message = eventError instanceof Error ? eventError.message : "Unable to save event.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSavingEvent(false);
    }
  }

  function handleEditRecord(record: AttendanceRecord) {
    setEditingRecordId(record.id);
    setManualForm({
      eventId: record.event_id ?? "",
      studentId: record.student_id,
      name: record.name,
      yearLevel: record.year_level ?? "",
      college: record.college ?? "",
      program: record.program ?? "",
      institution: record.institution ?? "",
      noOfAbsences: String(record.no_of_absences ?? 0),
      remarks: record.remarks ?? ""
    });
    setManualDialogOpen(true);
    setError("");
  }

  function handleCancelEdit() {
    setEditingRecordId("");
    setManualForm(emptyManualAttendanceForm);
    setError("");
  }

  function handleEditEvent(record: AttendanceEvent) {
    setEditingEventId(record.id);
    setEventForm({
      name: record.name,
      eventDate: record.event_date ? String(record.event_date).slice(0, 10) : "",
      description: record.description ?? ""
    });
    setEventDialogOpen(true);
    setError("");
  }

  function handleCancelEventEdit() {
    setEditingEventId("");
    setEventForm(emptyAttendanceEventForm);
    setError("");
  }

  async function handleDeleteRecord(id: string) {
    setDeletingRecordId(id);
    setError("");

    try {
      await deleteAttendanceRecord(id);
      await loadRecords();

      if (editingRecordId === id) {
        handleCancelEdit();
      }

      toast.success("Attendance record deleted successfully.");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete attendance record.";
      setError(message);
      toast.error(message);
    } finally {
      setDeletingRecordId("");
    }
  }

  async function handleDeleteEvent(id: string) {
    setDeletingEventId(id);
    setError("");

    try {
      await deleteAttendanceEvent(id);
      await loadRecords();

      if (editingEventId === id) {
        handleCancelEventEdit();
      }

      if (uploadEventId === id) {
        setUploadEventId("");
      }

      toast.success("Event deleted successfully.");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete event.";
      setError(message);
      toast.error(message);
    } finally {
      setDeletingEventId("");
    }
  }

  async function handleDeleteRecords(ids: string[]) {
    const idsToDelete = Array.from(new Set(ids)).filter(Boolean);

    if (!idsToDelete.length) {
      toast.error("Please select attendance record/s to delete.");
      return;
    }

    setIsDeletingBulk(true);
    setError("");

    try {
      await Promise.all(idsToDelete.map((id) => deleteAttendanceRecord(id)));
      await loadRecords();

      if (editingRecordId && idsToDelete.includes(editingRecordId)) {
        handleCancelEdit();
      }

      toast.success(`${idsToDelete.length} attendance record/s deleted successfully.`);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete attendance records.";
      setError(message);
      toast.error(message);
      await loadRecords();
    } finally {
      setIsDeletingBulk(false);
    }
  }

  useEffect(() => {
    void loadRecords();
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Attendance</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Upload and manage attendance</h1>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <AttendanceEventDialog
              open={eventDialogOpen}
              onOpenChange={(open) => {
                setEventDialogOpen(open);
                if (!open) handleCancelEventEdit();
              }}
              form={eventForm}
              editingEventId={editingEventId}
              isSaving={isSavingEvent}
              onSubmit={handleEventSubmit}
              onClear={handleCancelEventEdit}
              onChange={updateEventForm}
            />
            <ManualAttendanceDialog
              open={manualDialogOpen}
              onOpenChange={(open) => {
                setManualDialogOpen(open);
                if (!open) handleCancelEdit();
              }}
              events={events}
              form={manualForm}
              editingRecordId={editingRecordId}
              isSaving={isSavingManual}
              onSubmit={handleManualSubmit}
              onClear={handleCancelEdit}
              onChange={updateManualForm}
            />
            <Button
              type="button"
              variant="outline"
              onClick={loadRecords}
              disabled={isLoadingRecords}
              className="min-h-11 rounded-xl px-5 py-2"
            >
              {isLoadingRecords ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="space-y-4">
            <FileDropZone
              file={file}
              isDragging={isDragging}
              onFileChange={handleUploadFileChange}
              onDragStateChange={setIsDragging}
            />

            {file ? (
              <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
                <div className="flex flex-col gap-1">
                  <h2 className="text-xl font-black">Upload event</h2>
                  <p className="text-sm font-semibold text-muted-foreground">
                    Required before saving so the uploaded attendees are attached to an event.
                  </p>
                </div>
                <div className="mt-5">
                  <EventFields
                    events={events}
                    eventId={uploadEventId}
                    eventName={uploadEventName}
                    eventDate={uploadEventDate}
                    eventDescription={uploadEventDescription}
                    onEventIdChange={handleUploadEventIdChange}
                    onEventNameChange={setUploadEventName}
                    onEventDateChange={setUploadEventDate}
                    onEventDescriptionChange={setUploadEventDescription}
                  />
                </div>
              </section>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                onClick={handlePreview}
                disabled={!file || isPreviewing || isSaving}
                className="min-h-12 rounded-2xl px-5 py-3"
              >
                {isPreviewing ? "Previewing..." : "Preview File"}
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!file || !uploadEventReady || isPreviewing || isSaving}
                className="min-h-12 rounded-2xl px-5 py-3"
              >
                {isSaving ? "Saving..." : "Save Import"}
              </Button>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}

            {saved ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                Attendance imported successfully. Created {saved.createdFines.length} fine record/s.
              </div>
            ) : null}

            <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-black">Events</h2>
                <p className="text-sm font-bold text-muted-foreground">{events.length} event/s</p>
              </div>

              {events.length ? (
                <div className="space-y-3">
                  {events.map((event) => (
                    <article key={event.id} className="rounded-2xl border bg-background p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-black">{event.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatDate(event.event_date)} • {event.attendees_count} attendee/s
                          </p>
                          {event.description ? <p className="mt-2 text-sm text-muted-foreground">{event.description}</p> : null}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleEditEvent(event)}
                            className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                          >
                            Edit
                          </Button>
                          <DeleteEventConfirmation
                            event={event}
                            isDeleting={deletingEventId === event.id}
                            onConfirm={handleDeleteEvent}
                            className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  No events yet.
                </div>
              )}
            </section>
          </section>

          <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="text-xl font-black">Preview result</h2>
              {preview ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted px-3 py-2">
                    <p className="text-xs font-bold text-muted-foreground">Total</p>
                    <p className="font-black">{preview.rowsTotal}</p>
                  </div>
                  <div className="rounded-xl bg-muted px-3 py-2">
                    <p className="text-xs font-bold text-muted-foreground">Valid</p>
                    <p className="font-black">{preview.rowsValid}</p>
                  </div>
                  <div className="rounded-xl bg-muted px-3 py-2">
                    <p className="text-xs font-bold text-muted-foreground">Invalid</p>
                    <p className="font-black">{preview.rowsInvalid}</p>
                  </div>
                </div>
              ) : null}
            </div>

            {preview ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-left text-sm">
                  <thead className="border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">Row</th>
                      <th className="px-3 py-3">Event</th>
                      <th className="px-3 py-3">Student ID</th>
                      <th className="px-3 py-3">Name</th>
                      <th className="px-3 py-3">Absences</th>
                      <th className="px-3 py-3">Remarks</th>
                      <th className="px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 30).map((row) => (
                      <tr key={`${row.rowNumber}-${row.studentId}`} className="border-b last:border-b-0">
                        <td className="px-3 py-3 font-semibold">{row.rowNumber}</td>
                        <td className="px-3 py-3">{row.eventName || uploadEventName || "—"}</td>
                        <td className="px-3 py-3">{row.studentId || "—"}</td>
                        <td className="px-3 py-3">{row.name || "—"}</td>
                        <td className="px-3 py-3">{row.noOfAbsences ?? 0}</td>
                        <td className="px-3 py-3 text-muted-foreground">{row.remarks || "—"}</td>
                        <td className="px-3 py-3">
                          {row.errors.length ? (
                            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
                              {row.errors.join(" ")}
                            </span>
                          ) : (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                              Valid
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 30 ? (
                  <p className="mt-3 text-xs font-semibold text-muted-foreground">Showing first 30 rows only.</p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed bg-background p-8 text-center text-sm font-semibold text-muted-foreground">
                No preview yet.
              </div>
            )}

            {invalidRows.length ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-black">Rows that need review</p>
                <p className="mt-1">{invalidRows.length} invalid row/s will not be saved.</p>
              </div>
            ) : null}
          </section>
        </div>

        <section className="mt-6 rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black">Recent attendance records</h2>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {selectedRecordCount ? (
                <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                  {selectedRecordCount} selected
                </p>
              ) : null}
              <DeleteAttendanceRecordsConfirmation
                label="Delete Selected"
                title="Delete selected attendance records?"
                description={`This will permanently delete ${selectedRecordCount} selected attendance record/s.`}
                isDeleting={isDeletingBulk}
                disabled={!selectedRecordCount}
                onConfirm={() => handleDeleteRecords(selectedRecordIds)}
                className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black"
              />
              <DeleteAttendanceRecordsConfirmation
                label="Delete All"
                title="Delete all attendance records?"
                description={`This will permanently delete all ${records.length} loaded attendance record/s.`}
                isDeleting={isDeletingBulk}
                disabled={!records.length}
                onConfirm={() => handleDeleteRecords(records.map((record) => record.id))}
                className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black"
              />
            </div>
          </div>

          {records.length ? (
            <>
              <div className="space-y-3 lg:hidden">
                {records.map((record) => (
                  <article key={record.id} className="rounded-2xl border bg-background p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedRecordIdsSet.has(record.id)}
                        onCheckedChange={(checked) => handleToggleRecordSelected(record.id, checked)}
                        aria-label={`Select attendance record for ${record.name}`}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-black">{record.name}</p>
                            <p className="text-sm text-muted-foreground">{record.student_id}</p>
                          </div>
                          <p className="text-sm font-bold">{record.no_of_absences} absence/s</p>
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">
                          {record.program || "No program"} • {formatDate(record.created_at)}
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {getManualRecordSource(record)}
                        </p>
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleEditRecord(record)}
                            className="min-h-10 flex-1 rounded-xl px-4 py-2 text-xs font-black"
                          >
                            Edit
                          </Button>
                          <DeleteAttendanceConfirmation
                            record={record}
                            isDeleting={deletingRecordId === record.id || isDeletingBulk}
                            onConfirm={handleDeleteRecord}
                            className="min-h-10 flex-1 rounded-xl px-4 py-2 text-xs font-black"
                          />
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-max text-left text-sm">
                  <thead className="border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">
                        <Checkbox
                          checked={recordHeaderChecked}
                          onCheckedChange={handleToggleAllRecords}
                          aria-label="Select all attendance records"
                        />
                      </th>
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3">Event</th>
                      <th className="px-3 py-3">Student ID</th>
                      <th className="px-3 py-3">Name</th>
                      <th className="px-3 py-3">Program</th>
                      <th className="px-3 py-3">Absences</th>
                      <th className="px-3 py-3">Remarks</th>
                      <th className="px-3 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.id} className="border-b last:border-b-0">
                        <td className="px-3 py-3">
                          <Checkbox
                            checked={selectedRecordIdsSet.has(record.id)}
                            onCheckedChange={(checked) => handleToggleRecordSelected(record.id, checked)}
                            aria-label={`Select attendance record for ${record.name}`}
                          />
                        </td>
                        <td className="px-3 py-3 font-semibold">{formatDate(record.created_at)}</td>
                        <td className="px-3 py-3">
                          <span className="rounded-full border bg-muted px-3 py-1 text-xs font-bold uppercase text-muted-foreground">
                            {getManualRecordSource(record)}
                          </span>
                        </td>
                        <td className="px-3 py-3">{record.student_id}</td>
                        <td className="px-3 py-3">{record.name}</td>
                        <td className="px-3 py-3">{record.program || "—"}</td>
                        <td className="px-3 py-3">{record.no_of_absences}</td>
                        <td className="px-3 py-3 text-muted-foreground">{record.remarks || "—"}</td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleEditRecord(record)}
                              className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                            >
                              Edit
                            </Button>
                            <DeleteAttendanceConfirmation
                              record={record}
                              isDeleting={deletingRecordId === record.id || isDeletingBulk}
                              onConfirm={handleDeleteRecord}
                              className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
              No attendance records loaded yet.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}