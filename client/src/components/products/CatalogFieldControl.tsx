import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export const catalogFieldStyles = {
  container: "space-y-1.5",
  row: "flex items-stretch",
  control: "flex-1",
  selectTrigger: (hasAction: boolean) => cn("h-9", hasAction ? "w-full rounded-r-none" : "w-full"),
  input: (hasAction: boolean) => cn("h-9", hasAction && "rounded-r-none"),
  actionButton: "h-9 w-9 shrink-0 rounded-l-none border-l-0",
  helperButton: "h-auto px-0 text-xs",
} as const;

type CatalogFieldControlProps = {
  label: string;
  htmlFor?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
  helper?: ReactNode;
  className?: string;
};

export function CatalogFieldControl({
  label,
  htmlFor,
  actionLabel,
  onAction,
  children,
  helper,
  className,
}: CatalogFieldControlProps) {
  return (
    <div className={cn(catalogFieldStyles.container, className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className={catalogFieldStyles.row}>
        <div className={catalogFieldStyles.control}>{children}</div>
        {onAction && actionLabel && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={catalogFieldStyles.actionButton}
            aria-label={actionLabel}
            title={actionLabel}
            onClick={onAction}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
      {helper}
    </div>
  );
}
