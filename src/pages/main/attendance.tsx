import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
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
        accept={getAcceptedAttendanceFileTypes()}
        onChange={handleInputChange}
        className="sr-only"
      />

      <div className="rounded-full border bg-background px-4 py-2 text-xs font-black uppercase tracking-wide text-muted-foreground">
        Drag and drop upload
      </div>
      <h2 className="mt-4 text-2xl font-black">Upload attendance file</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        Drop an Excel, CSV, TXT, DOC, or DOCX file here, or click this area to browse from your device.
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

export default function AttendancePage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AttendancePreviewResult | null>(null);
  const [saved, setSaved] = useState<SavedAttendanceImportResult | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [manualForm, setManualForm] = useState<ManualAttendanceFormState>(emptyManualAttendanceForm);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState("");
  const [deletingRecordId, setDeletingRecordId] = useState("");
  const [error, setError] = useState("");

  const invalidRows = useMemo(() => preview?.rows.filter((row) => row.errors.length > 0) ?? [], [preview]);

  function updateManualForm<K extends keyof ManualAttendanceFormState>(key: K, value: ManualAttendanceFormState[K]) {
    setManualForm((current) => ({ ...current, [key]: value }));
  }

  async function loadRecords() {
    setIsLoadingRecords(true);
    setError("");

    try {
      const rows = await listAttendanceRecords({ limit: 100, offset: 0 });
      setRecords(rows);
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
      const result = await previewAttendanceFile(file);
      setPreview(result ?? null);
      toast.success("Attendance file preview generated.");
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
      const result = await saveAttendanceFile(file);
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

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
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
                      <th className="px-3 py-3">Actions</th>
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
          </div>

          {records.length ? (
            <>
              <div className="space-y-3 lg:hidden">
                {records.map((record) => (
                  <article key={record.id} className="rounded-2xl border bg-background p-4">
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
                        isDeleting={deletingRecordId === record.id}
                        onConfirm={handleDeleteRecord}
                        className="min-h-10 flex-1 rounded-xl px-4 py-2 text-xs font-black"
                      />
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-max text-left text-sm">
                  <thead className="border-b text-xs uppercase text-muted-foreground">
                    <tr>
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
                              isDeleting={deletingRecordId === record.id}
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