import { ChevronDown } from "lucide-react";
import { type HTMLAttributes, useEffect, useId, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";

export type DropdownOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type DropdownProps = Omit<HTMLAttributes<HTMLDivElement>, "defaultValue" | "onChange"> & {
  options: DropdownOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  buttonClassName?: string;
  menuClassName?: string;
};

export function Dropdown({
  options,
  value,
  defaultValue = "",
  onValueChange,
  name,
  required,
  disabled,
  placeholder = "เลือก",
  className,
  buttonClassName,
  menuClassName,
  ...props
}: DropdownProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = value ?? internalValue;
  const selectedOption = useMemo(() => options.find((option) => option.value === selectedValue), [options, selectedValue]);

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutsidePress(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("touchstart", closeOnOutsidePress);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("touchstart", closeOnOutsidePress);
    };
  }, [open]);

  function choose(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
    setOpen(false);
  }

  return (
    <div
      ref={containerRef}
      className={clsx("relative", className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      {...props}
    >
      {name ? <input type="hidden" name={name} value={selectedValue} required={required} /> : null}
      <button
        type="button"
        className={clsx(
          "field flex min-h-[2.9rem] items-center justify-between gap-3 text-left transition hover:border-teal-500 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400",
          buttonClassName
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={clsx("min-w-0 flex-1 truncate", selectedOption ? "text-ink" : "text-stone-400")}>{selectedOption?.label ?? placeholder}</span>
        <ChevronDown className={clsx("shrink-0 text-stone-400 transition", open && "rotate-180")} size={18} />
      </button>
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className={clsx(
            "absolute left-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-md border border-stone-200 bg-white p-1 shadow-xl",
            menuClassName ?? "right-0"
          )}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === selectedValue}
              disabled={option.disabled}
              className={clsx(
                "flex min-h-10 w-full items-center rounded px-3 py-2 text-left text-sm font-semibold transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:text-stone-400",
                option.value === selectedValue ? "bg-teal-50 text-leaf" : "text-ink"
              )}
              onPointerDown={(event) => {
                if (event.pointerType === "mouse" && event.button !== 0) return;
                event.preventDefault();
                choose(option.value);
              }}
              onClick={(event) => {
                if (event.detail === 0) choose(option.value);
              }}
            >
              <span className="min-w-0 truncate">{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
