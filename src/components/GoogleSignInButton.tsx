"use client";

// Shared "continue with Google" button for the login and signup pages.
// Auth logic stays in the pages — this is presentation only.
export function GoogleSignInButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2.5 rounded-md border border-graphite-200 bg-white px-4 py-2.5 text-sm font-semibold text-graphite-700 transition hover:bg-graphite-50 disabled:opacity-60"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
        <path
          fill="#4285F4"
          d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.09A12 12 0 0 0 12 24Z"
        />
        <path
          fill="#FBBC05"
          d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.27a12 12 0 0 0 0 10.76l4.01-3.09Z"
        />
        <path
          fill="#EA4335"
          d="M12 4.77c1.76 0 3.34.6 4.59 1.8l3.44-3.44A11.98 11.98 0 0 0 1.27 6.62l4.01 3.09C6.22 6.88 8.87 4.77 12 4.77Z"
        />
      </svg>
      {label}
    </button>
  );
}
