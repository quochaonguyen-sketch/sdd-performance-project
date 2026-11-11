import { Eye, EyeOff } from "lucide-react";

export function RiderPreviewToggle({ pressed, onToggle, disabled }: {
  pressed: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const Icon = pressed ? EyeOff : Eye;
  return (
    <button
      type="button"
      className="grid size-8 shrink-0 place-items-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)] max-sm:size-11"
      aria-label="Xem trước số liệu"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
    >
      <Icon size={14} aria-hidden="true"/>
    </button>
  );
}
