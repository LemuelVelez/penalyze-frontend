import type { SortOrder } from "../lib/sort";
import { cn } from "../lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type SortSelectProps = {
  value: SortOrder;
  onValueChange: (value: SortOrder) => void;
  className?: string;
  ariaLabel?: string;
};

export function SortSelect({
  value,
  onValueChange,
  className,
  ariaLabel = "Sort by date",
}: SortSelectProps) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as SortOrder)}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn("min-h-11 w-full rounded-xl", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="newest">Sort by: Newest</SelectItem>
        <SelectItem value="oldest">Sort by: Oldest</SelectItem>
      </SelectContent>
    </Select>
  );
}
