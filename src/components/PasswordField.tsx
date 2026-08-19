"use client";

import { useId, useState } from "react";

// A password field you can read back before submitting it.
//
// The reveal is a text button, not an eye icon, for the same reason the tab
// bar carries words instead of glyphs: this app gets used one-handed in bright
// light, where a small monochrome pictogram is a guess and "Show" is not.
//
// The label is bound by id rather than wrapping the input, because a <label>
// wrapping a <button> makes clicking the button ambiguous — the label wants to
// forward that click to the field.

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** "new-password" on signup, "current-password" on login. */
  autoComplete: "new-password" | "current-password";
  minLength?: number;
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  minLength,
}: PasswordFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-sm font-medium text-graphite-700"
      >
        {label}
      </label>
      <div className="relative">
        <input
          required
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          minLength={minLength}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          // Room on the right for the toggle, which sits inside the border.
          className="field-input pr-16"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-0 right-0 rounded-r-md px-3.5 text-xs font-semibold uppercase tracking-wide text-graphite-500 transition hover:text-maroon-600 dark:hover:text-maroon-400"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
