import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";

import {
  getAcceptedAttendanceFileTypes,
  listAttendanceRecords,
  previewAttendanceFile,
  saveAttendanceFile
} from "../../api/attendance";
import type {
  AttendancePreviewResult,
  SavedAttendanceImportResult,
  AttendanceRecord
} from "../../api/attendance";

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
    <label
      htmlFor="attendance-upload"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed bg-card p-6 text-center shadow-sm transition sm:p-8 ${
        props.isDragging ? "border-primary bg-accent" : "border-border hover:border-primary/70 hover:bg-accent/40"
      }`}
    >
      <input
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
    </label>
  );
}

export default function AttendancePage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AttendancePreviewResult | null>(null);
  const [saved, setSaved] = useState<SavedAttendanceImportResult | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [error, setError] = useState("");

  const invalidRows = useMemo(() => preview?.rows.filter((row) => row.errors.length > 0) ?? [], [preview]);

  async function loadRecords() {
    setIsLoadingRecords(true);
    setError("");

    try {
      const rows = await listAttendanceRecords({ limit: 100, offset: 0 });
      setRecords(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load attendance records.");
    } finally {
      setIsLoadingRecords(false);
    }
  }

  async function handlePreview() {
    if (!file) {
      setError("Please choose or drop a file first.");
      return;
    }

    setIsPreviewing(true);
    setError("");
    setSaved(null);

    try {
      const result = await previewAttendanceFile(file);
      setPreview(result ?? null);
    } catch (previewError) {
      setPreview(null);
      setError(previewError instanceof Error ? previewError.message : "Unable to preview attendance file.");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleSave() {
    if (!file) {
      setError("Please choose or drop a file first.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const result = await saveAttendanceFile(file);
      setSaved(result ?? null);
      setPreview(result ?? null);
      await loadRecords();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save attendance file.");
    } finally {
      setIsSaving(false);
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
              Import attendance records through a responsive drag-and-drop file uploader. Preview rows first, then save
              valid records and automatically generate fines for students with absences.
            </p>
          </div>
          <button
            type="button"
            onClick={loadRecords}
            disabled={isLoadingRecords}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border bg-card px-5 py-2 text-sm font-black shadow-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingRecords ? "Loading..." : "Refresh Records"}
          </button>
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
              <button
                type="button"
                onClick={handlePreview}
                disabled={isPreviewing || isSaving}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border bg-card px-5 py-3 text-sm font-black shadow-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPreviewing ? "Previewing..." : "Preview File"}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPreviewing || isSaving}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Saving..." : "Save Import"}
              </button>
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
              <p className="mt-1 text-sm text-muted-foreground">Latest imported attendance entries.</p>
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
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-max text-left text-sm">
                  <thead className="border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3">Student ID</th>
                      <th className="px-3 py-3">Name</th>
                      <th className="px-3 py-3">Program</th>
                      <th className="px-3 py-3">Absences</th>
                      <th className="px-3 py-3">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.id} className="border-b last:border-b-0">
                        <td className="px-3 py-3 font-semibold">{formatDate(record.created_at)}</td>
                        <td className="px-3 py-3">{record.student_id}</td>
                        <td className="px-3 py-3">{record.name}</td>
                        <td className="px-3 py-3">{record.program || "—"}</td>
                        <td className="px-3 py-3">{record.no_of_absences}</td>
                        <td className="px-3 py-3 text-muted-foreground">{record.remarks || "—"}</td>
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