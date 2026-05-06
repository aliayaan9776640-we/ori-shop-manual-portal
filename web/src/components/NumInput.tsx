import { useEffect, useRef, useState } from "react";

interface NumInputProps {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  allowDecimal?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onBlurValue?: (n: number) => void;
}

/**
 * Controlled numeric input that allows the user to fully clear the value.
 *
 * - Empty string is preserved while the user is typing.
 * - Empty/invalid is treated as 0 internally for calculations.
 * - The displayed text is NEVER overwritten while the input is focused, so
 *   the user can always delete the leading "0" without it being re-inserted.
 * - When the prop `value` changes externally (and the input is not focused),
 *   the displayed text is synced to match.
 */
export default function NumInput({
  value,
  onChange,
  min,
  max,
  step,
  allowDecimal = true,
  className,
  placeholder,
  disabled,
  readOnly,
  onBlurValue,
}: NumInputProps) {
  const initialText: string = Number.isFinite(value) ? String(value) : "";
  const [text, setText] = useState<string>(initialText);
  const focused = useRef<boolean>(false);

  // Sync display ONLY when the external `value` prop changes and the input
  // is NOT focused. Crucially, `text` is NOT a dependency — typing must
  // never trigger this effect.
  useEffect(() => {
    if (focused.current) return;
    const parsed = text === "" ? 0 : Number(text);
    if (parsed !== value) {
      setText(Number.isFinite(value) ? String(value) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const clamp = (n: number): number => {
    let v = n;
    if (typeof min === "number" && v < min) v = min;
    if (typeof max === "number" && v > max) v = max;
    return v;
  };

  const commit = (raw: string): void => {
    if (raw === "" || raw === "-" || raw === "." || raw === "-.") {
      onChange(0);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    onChange(clamp(n));
  };

  return (
    <input
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      pattern={allowDecimal ? "[0-9]*\\.?[0-9]*" : "[0-9]*"}
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      step={step}
      onFocus={(e) => {
        focused.current = true;
        // Select all so the user can immediately overwrite (e.g. delete the 0).
        try {
          e.currentTarget.select();
        } catch {
          // ignore
        }
      }}
      onBlur={() => {
        focused.current = false;
        const parsed = text === "" ? 0 : Number(text);
        const safe = Number.isFinite(parsed) ? clamp(parsed) : 0;
        // Normalise display to match committed value.
        setText(String(safe));
        if (safe !== value) onChange(safe);
        if (onBlurValue) onBlurValue(safe);
      }}
      onChange={(e) => {
        const v = e.target.value;
        const re = allowDecimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/;
        if (v !== "" && !re.test(v)) return;
        setText(v);
        commit(v);
      }}
      className={className}
    />
  );
}
