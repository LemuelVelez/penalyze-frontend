import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export type SortOrder = "newest" | "oldest";

type SortableRow = {
  id?: unknown;
  key?: unknown;
  event_order?: unknown;
  eventOrder?: unknown;
};

type DateValue = string | number | Date | null | undefined;

export function parseSortOrder(value: unknown): SortOrder {
  return String(value ?? "").toLowerCase() === "oldest" ? "oldest" : "newest";
}

function getTimestamp(value: DateValue) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

function getEventOrder(row: SortableRow) {
  const value = Number(row.event_order ?? row.eventOrder);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getStableId(row: SortableRow) {
  return String(row.id ?? row.key ?? "");
}

export function sortByDate<T extends SortableRow>(
  rows: readonly T[],
  getDate: (row: T) => DateValue,
  order: SortOrder,
) {
  const direction = order === "newest" ? -1 : 1;

  return rows
    .map((row, index) => ({ row, index, time: getTimestamp(getDate(row)) }))
    .sort((left, right) => {
      if (left.time === null && right.time !== null) return 1;
      if (left.time !== null && right.time === null) return -1;

      if (left.time !== null && right.time !== null && left.time !== right.time) {
        return (left.time - right.time) * direction;
      }

      const leftEventOrder = getEventOrder(left.row);
      const rightEventOrder = getEventOrder(right.row);
      if (leftEventOrder !== rightEventOrder) {
        if (leftEventOrder === null) return 1;
        if (rightEventOrder === null) return -1;
        return leftEventOrder - rightEventOrder;
      }

      const idComparison = getStableId(left.row).localeCompare(getStableId(right.row));
      if (idComparison !== 0) return idComparison * direction;

      return left.index - right.index;
    })
    .map(({ row }) => row);
}

export function useSortOrderSearchParam(paramName = "sort") {
  const [searchParams, setSearchParams] = useSearchParams();
  const sortOrder = parseSortOrder(searchParams.get(paramName));

  const setSortOrder = useCallback(
    (nextOrder: SortOrder) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set(paramName, nextOrder);
          return next;
        },
        { replace: true },
      );
    },
    [paramName, setSearchParams],
  );

  return [sortOrder, setSortOrder] as const;
}
