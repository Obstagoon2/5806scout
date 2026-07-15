interface LionMarkProps {
  className?: string;
}

// A geometric crest mark for Team 5806 — a mane-and-face reduced to two
// clean shapes (a 16-point star for the mane, a circle for the face) so it
// reads clearly at badge size (24-32px) rather than as a fussy illustration.
export function LionMark({ className }: LionMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <polygon
        points="29,16 23.39,19.06 25.19,25.19 19.06,23.39 16,29 12.94,23.39 6.81,25.19 8.61,19.06 3,16 8.61,12.94 6.81,6.81 12.94,8.61 16,3 19.06,8.61 25.19,6.81 23.39,12.94"
        fill="currentColor"
      />
      <circle cx="16" cy="16" r="6.5" fill="var(--background)" />
      <circle cx="13.5" cy="15" r="1.1" fill="currentColor" />
      <circle cx="18.5" cy="15" r="1.1" fill="currentColor" />
      <path
        d="M14.5 18.5c.5.6 1.2 1 1.5 1s1-.4 1.5-1"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
