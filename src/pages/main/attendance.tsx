import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  deleteAttendanceRecord,
  getAcceptedAttendanceFileTypes,
  listAttendanceRecords,
  previewAttendanceFile,
  saveAttendanceFile,
  saveManualAttendanceRecord,
  updateAttendanceRecord
} from "../../api/attendance";
import type {
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
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";

type ManualAttendanceFormState = {
  studentId: string;
  name: string;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
  noOfAbsences: string;
  remarks: string;
};

const emptyManualAttendanceForm: ManualAttendanceFormState = {
  studentId: "",
  name: "",
  yearLevel: "",
  college: "",
  program: "",
  institution: "",
  noOfAbsences: "0",
  remarks: ""
};

const ATTENDANCE_EXCEL_FILE_TYPES = [
  ".xlsx",
  ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel"
];

const ATTENDANCE_TEXT_FILE_TYPES = [".csv", ".txt", "text/csv", "text/plain"];

const ATTENDANCE_SEARCH_FIELDS = [
  {
    label: "Student ID",
    aliases: ["Student ID", "Student Id", "StudentID", "ID Number", "Student Number"]
  },
  {
    label: "Full name",
    aliases: ["Full name", "Full Name", "Name", "Student Name"]
  },
  {
    label: "Year level",
    aliases: ["Year level", "Year Level", "Year", "Level"]
  },
  {
    label: "College",
    aliases: ["College", "Department"]
  },
  {
    label: "Program",
    aliases: ["Program", "Course"]
  },
  {
    label: "Institution",
    aliases: ["Institution", "School", "Campus"]
  }
];

const ATTENDANCE_IMPORT_HEADERS = [
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

function escapeCsvValue(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function toNormalizedAttendanceCsv(rows: NormalizedAttendanceImportRow[]) {
  const csvRows = [
    ATTENDANCE_IMPORT_HEADERS,
    ...rows.map((row) => [
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
      getLabeledValue(searchableText, ATTENDANCE_SEARCH_FIELDS[0].aliases);
    const name = getHeaderValue(row, headers, "name") || getLabeledValue(searchableText, ATTENDANCE_SEARCH_FIELDS[1].aliases);

    if (!studentId || !name) return;

    const normalizedStudentId = cleanImportValue(studentId).toUpperCase();
    const currentRecord = recordsByStudentId.get(normalizedStudentId);

    const normalizedRow: NormalizedAttendanceImportRow = {
      studentId: normalizedStudentId,
      name: cleanImportValue(name),
      yearLevel:
        getHeaderValue(row, headers, "yearLevel") ||
        getLabeledValue(searchableText, ATTENDANCE_SEARCH_FIELDS[2].aliases) ||
        currentRecord?.yearLevel ||
        "",
      college:
        getHeaderValue(row, headers, "college") ||
        getLabeledValue(searchableText, ATTENDANCE_SEARCH_FIELDS[3].aliases) ||
        currentRecord?.college ||
        "",
      program:
        getHeaderValue(row, headers, "program") ||
        getLabeledValue(searchableText, ATTENDANCE_SEARCH_FIELDS[4].aliases) ||
        currentRecord?.program ||
        "",
      institution:
        getHeaderValue(row, headers, "institution") ||
        getLabeledValue(searchableText, ATTENDANCE_SEARCH_FIELDS[5].aliases) ||
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
        Drag and drop upload
      </div>
      <h2 className="mt-4 text-2xl font-black">Upload attendance file</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        Drop an Excel workbook (.xlsx/.xls), CSV, TXT, DOC, or DOCX file here, or click this area to browse from
        your device.
      </p>
      <p className="mt-2 max-w-xl text-xs leading-5 text-muted-foreground">
        The importer searches for Student ID, Full name/Name, Year level, College, Program, and Institution,
        including QR scanner exports where these values are inside one messy text column.
      </p>

      {props.file ? (
        <div className="mt-5 w-full max-w-xl rounded-2xl border bg-background p-4 text-left">
          <p className="truncate text-sm font-black">{props.file.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{(props.file.size / 1024).toFixed(1)} KB</p>
        </div>
      ) : null}
    </Label>
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
        <Button type="button" variant="destructiveOutline" disabled={props.isDeleting} className={props.className}>
          {props.isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete attendance record?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the attendance record for {props.record.name}. Any generated fine linked to
            this attendance record will also be removed.
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
          variant="destructiveOutline"
          disabled={props.disabled || props.isDeleting}
          className={props.className}
        >
          {props.isDeleting ? "Deleting..." : props.label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
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

export default function AttendancePage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AttendancePreviewResult | null>(null);
  const [saved, setSaved] = useState<SavedAttendanceImportResult | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [manualForm, setManualForm] = useState<ManualAttendanceFormState>(emptyManualAttendanceForm);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState("");
  const [deletingRecordId, setDeletingRecordId] = useState("");
  const [error, setError] = useState("");

  const invalidRows = useMemo(() => preview?.rows.filter((row) => row.errors.length > 0) ?? [], [preview]);
  const selectedRecordIdsSet = useMemo(() => new Set(selectedRecordIds), [selectedRecordIds]);
  const selectedRecordCount = selectedRecordIds.length;
  const allRecordsSelected = records.length > 0 && selectedRecordCount === records.length;
  const recordHeaderChecked = allRecordsSelected ? true : selectedRecordCount > 0 ? "indeterminate" : false;

  function updateManualForm<K extends keyof ManualAttendanceFormState>(key: K, value: ManualAttendanceFormState[K]) {
    setManualForm((current) => ({ ...current, [key]: value }));
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

  async function loadRecords() {
    setIsLoadingRecords(true);
    setError("");

    try {
      const rows = await listAttendanceRecords({ limit: 100, offset: 0 });
      const rowIds = new Set(rows.map((record) => record.id));

      setRecords(rows);
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

    setIsSaving(true);
    setError("");

    try {
      const upload = await getAttendanceUploadFile(file);
      const result = await saveAttendanceFile(upload.file);
      setSaved(result ?? null);
      setPreview(result ?? null);
      await loadRecords();
      toast.success(
        upload.normalizedRowsCount
          ? `Attendance imported successfully from ${upload.normalizedRowsCount} extracted student row/s. Created ${
              result?.createdFines.length ?? 0
            } fine record/s.`
          : `Attendance imported successfully. Created ${result?.createdFines.length ?? 0} fine record/s.`
      );
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

      setEditingRecordId("");
      setManualForm(emptyManualAttendanceForm);

      if (editingRecordId) {
        toast.success(result?.fine ? "Attendance record updated and fine synced." : "Attendance record updated successfully.");
      } else {
        toast.success(result?.fine ? "Manual attendance saved and fine generated." : "Manual attendance saved successfully.");
      }
    } catch (manualError) {
      const message = manualError instanceof Error ? manualError.message : "Unable to save attendance record.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSavingManual(false);
    }
  }

  function handleEditRecord(record: AttendanceRecord) {
    setEditingRecordId(record.id);
    setManualForm({
      studentId: record.student_id,
      name: record.name,
      yearLevel: record.year_level ?? "",
      college: record.college ?? "",
      program: record.program ?? "",
      institution: record.institution ?? "",
      noOfAbsences: String(record.no_of_absences ?? 0),
      remarks: record.remarks ?? ""
    });
    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  function handleCancelEdit() {
    setEditingRecordId("");
    setManualForm(emptyManualAttendanceForm);
    setError("");
  }

  async function handleDeleteRecord(id: string) {
    setDeletingRecordId(id);
    setError("");

    try {
      await deleteAttendanceRecord(id);
      setRecords((current) => current.filter((record) => record.id !== id));
      setSelectedRecordIds((current) => current.filter((recordId) => recordId !== id));

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
      setRecords((current) => current.filter((record) => !idsToDelete.includes(record.id)));
      setSelectedRecordIds((current) => current.filter((id) => !idsToDelete.includes(id)));

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
            <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Attendance import</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Upload and manage attendance</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Import attendance records through a file uploader or manually encode attendance recorded on paper.
              Saved records automatically generate fines for students with absences.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={loadRecords}
            disabled={isLoadingRecords}
            className="min-h-11 rounded-xl px-5 py-2"
          >
            {isLoadingRecords ? "Loading..." : "Refresh Records"}
          </Button>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="space-y-4">
            <FileDropZone
              file={file}
              isDragging={isDragging}
              onFileChange={(selectedFile) => {
                setFile(selectedFile);
                setPreview(null);
                setSaved(null);
                setError("");
              }}
              onDragStateChange={setIsDragging}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                onClick={handlePreview}
                disabled={isPreviewing || isSaving}
                className="min-h-12 rounded-2xl px-5 py-3"
              >
                {isPreviewing ? "Previewing..." : "Preview File"}
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isPreviewing || isSaving}
                className="min-h-12 rounded-2xl px-5 py-3"
              >
                {isSaving ? "Saving..." : "Save Import"}
              </Button>
            </div>

            <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
              <h2 className="text-lg font-black">Upload field search</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                The upload will look for the most important identifiers first, especially Student ID and Full name,
                then use the other available student details when they are found.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {ATTENDANCE_SEARCH_FIELDS.map((field) => (
                  <div key={field.label} className="rounded-2xl border bg-background p-3">
                    <p className="text-sm font-black">{field.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{field.aliases.join(", ")}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
              <h2 className="text-xl font-black">
                {editingRecordId ? "Edit attendance record" : "Manual paper attendance"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {editingRecordId
                  ? "Update the selected attendance record and synchronize its generated fine."
                  : "Encode attendance records from paper forms when no file upload is available."}
              </p>

              <form onSubmit={handleManualSubmit} className="mt-5 grid gap-4 lg:grid-cols-2">
                <div>
                  <Label htmlFor="manual-student-id">Student ID</Label>
                  <Input
                    id="manual-student-id"
                    value={manualForm.studentId}
                    onChange={(event) => updateManualForm("studentId", event.target.value)}
                    className="mt-2"
                    placeholder="Student ID"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="manual-name">Name</Label>
                  <Input
                    id="manual-name"
                    value={manualForm.name}
                    onChange={(event) => updateManualForm("name", event.target.value)}
                    className="mt-2"
                    placeholder="Full name"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="manual-year-level">Year level</Label>
                  <Input
                    id="manual-year-level"
                    value={manualForm.yearLevel}
                    onChange={(event) => updateManualForm("yearLevel", event.target.value)}
                    className="mt-2"
                    placeholder="Year level"
                  />
                </div>

                <div>
                  <Label htmlFor="manual-college">College</Label>
                  <Input
                    id="manual-college"
                    value={manualForm.college}
                    onChange={(event) => updateManualForm("college", event.target.value)}
                    className="mt-2"
                    placeholder="College"
                  />
                </div>

                <div>
                  <Label htmlFor="manual-program">Program</Label>
                  <Input
                    id="manual-program"
                    value={manualForm.program}
                    onChange={(event) => updateManualForm("program", event.target.value)}
                    className="mt-2"
                    placeholder="Program"
                  />
                </div>

                <div>
                  <Label htmlFor="manual-institution">Institution</Label>
                  <Input
                    id="manual-institution"
                    value={manualForm.institution}
                    onChange={(event) => updateManualForm("institution", event.target.value)}
                    className="mt-2"
                    placeholder="Institution"
                  />
                </div>

                <div>
                  <Label htmlFor="manual-absences">No. of Absences</Label>
                  <Input
                    id="manual-absences"
                    type="number"
                    min="0"
                    value={manualForm.noOfAbsences}
                    onChange={(event) => updateManualForm("noOfAbsences", event.target.value)}
                    className="mt-2"
                    placeholder="0"
                    required
                  />
                </div>

                <div className="lg:col-span-2">
                  <Label htmlFor="manual-remarks">Remarks</Label>
                  <Textarea
                    id="manual-remarks"
                    value={manualForm.remarks}
                    onChange={(event) => updateManualForm("remarks", event.target.value)}
                    className="mt-2"
                    placeholder="Optional notes from the paper attendance record"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
                  <Button type="submit" disabled={isSavingManual} className="min-h-12 rounded-2xl">
                    {isSavingManual ? "Saving..." : editingRecordId ? "Update Attendance" : "Save Manual Attendance"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSavingManual}
                    onClick={handleCancelEdit}
                    className="min-h-12 rounded-2xl"
                  >
                    {editingRecordId ? "Cancel Edit" : "Clear"}
                  </Button>
                </div>
              </form>
            </section>

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
          </section>

          <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-black">Preview result</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review valid and invalid rows before saving the import.
                </p>
              </div>
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
                  <p className="mt-3 text-xs font-semibold text-muted-foreground">
                    Showing first 30 rows only. Saving will process all valid rows.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed bg-background p-8 text-center text-sm font-semibold text-muted-foreground">
                Drop a file and click Preview File to see the parsed attendance rows.
              </div>
            )}

            {invalidRows.length ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-black">Rows that need review</p>
                <p className="mt-1">
                  {invalidRows.length} invalid row/s will not be saved unless corrected in the source file.
                </p>
              </div>
            ) : null}
          </section>
        </div>

        <section className="mt-6 rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black">Recent attendance records</h2>
              <p className="mt-1 text-sm text-muted-foreground">Latest uploaded and manually encoded attendance entries.</p>
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
                description={`This will permanently delete ${selectedRecordCount} selected attendance record/s and any generated fines linked to them.`}
                isDeleting={isDeletingBulk}
                disabled={!selectedRecordCount}
                onConfirm={() => handleDeleteRecords(selectedRecordIds)}
                className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black"
              />
              <DeleteAttendanceRecordsConfirmation
                label="Delete All"
                title="Delete all attendance records?"
                description={`This will permanently delete all ${records.length} loaded attendance record/s and any generated fines linked to them.`}
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
                          {record.import_id ? "File import" : "Manual paper record"}
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
                      <th className="px-3 py-3">Source</th>
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
                            {record.import_id ? "Import" : "Manual"}
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