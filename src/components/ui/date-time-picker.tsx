import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type DateTimePickerMode = "date" | "datetime";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

type DateTimePickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  mode?: DateTimePickerMode;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const YEARS = Array.from({ length: 101 }, (_, index) => 2000 + index);
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getDefaultParts(): DateParts {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
  };
}

function parseValue(value: string): DateParts {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/,
  );
  if (!match) return getDefaultParts();

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
  };
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function normalizeParts(parts: DateParts): DateParts {
  const maximumDay = daysInMonth(parts.year, parts.month);
  return {
    ...parts,
    day: Math.min(Math.max(parts.day, 1), maximumDay),
    hour: Math.min(Math.max(parts.hour, 0), 23),
    minute: Math.min(Math.max(parts.minute, 0), 59),
  };
}

function serializeParts(parts: DateParts, mode: DateTimePickerMode) {
  const normalized = normalizeParts(parts);
  const date = `${normalized.year}-${pad(normalized.month)}-${pad(normalized.day)}`;
  if (mode === "date") return date;
  return `${date}T${pad(normalized.hour)}:${pad(normalized.minute)}`;
}

function formatDisplayValue(value: string, mode: DateTimePickerMode) {
  if (!value) return "";
  const parts = parseValue(value);
  const date = new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    ...(mode === "datetime"
      ? { hour: "2-digit", minute: "2-digit" }
      : {}),
  }).format(date);
}

function NumberSelect({
  value,
  values,
  onValueChange,
  format = String,
  className,
}: {
  value: number;
  values: number[];
  onValueChange: (value: number) => void;
  format?: (value: number) => string;
  className?: string;
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={(nextValue) => onValueChange(Number(nextValue))}
    >
      <SelectTrigger className={cn("min-h-11 w-full rounded-2xl", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {values.map((option) => (
          <SelectItem key={option} value={String(option)}>
            {format(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DateTimePicker({
  value,
  onValueChange,
  mode = "datetime",
  disabled = false,
  placeholder,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DateParts>(() => parseValue(value));

  const updateDraft = React.useCallback(
    (patch: Partial<DateParts>) => {
      setDraft((current) => normalizeParts({ ...current, ...patch }));
    },
    [],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraft(parseValue(value));
    setOpen(nextOpen);
  };

  const availableDays = React.useMemo(
    () =>
      Array.from(
        { length: daysInMonth(draft.year, draft.month) },
        (_, index) => index + 1,
      ),
    [draft.month, draft.year],
  );

  const displayValue = formatDisplayValue(value, mode);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "min-h-12 w-full justify-start rounded-2xl px-4 text-left font-semibold",
            !displayValue && "text-muted-foreground",
            className,
          )}
        >
          {displayValue ||
            placeholder ||
            (mode === "date" ? "Select date" : "Select date and time")}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "date" ? "Select date" : "Select date and time"}
          </DialogTitle>
          <DialogDescription>
            Choose the date{mode === "datetime" ? " and time" : ""} using the fields below.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <span className="text-xs font-bold">Month</span>
            <Select
              value={String(draft.month)}
              onValueChange={(nextValue) => updateDraft({ month: Number(nextValue) })}
            >
              <SelectTrigger className="min-h-11 w-full rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {MONTHS.map((month, index) => (
                  <SelectItem key={month} value={String(index + 1)}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold">Day</span>
            <NumberSelect
              value={draft.day}
              values={availableDays}
              onValueChange={(day) => updateDraft({ day })}
            />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold">Year</span>
            <NumberSelect
              value={draft.year}
              values={
                YEARS.includes(draft.year)
                  ? YEARS
                  : [...YEARS, draft.year].sort((a, b) => a - b)
              }
              onValueChange={(year) => updateDraft({ year })}
            />
          </div>
        </div>

        {mode === "datetime" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <span className="text-xs font-bold">Hour</span>
              <NumberSelect
                value={draft.hour}
                values={HOURS}
                onValueChange={(hour) => updateDraft({ hour })}
                format={pad}
              />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-bold">Minute</span>
              <NumberSelect
                value={draft.minute}
                values={MINUTES}
                onValueChange={(minute) => updateDraft({ minute })}
                format={pad}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onValueChange("");
              setOpen(false);
            }}
          >
            Clear
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onValueChange(serializeParts(draft, mode));
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
