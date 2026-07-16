import Image from "next/image";

interface LionMarkProps {
  className?: string;
}

export function LionMark({ className }: LionMarkProps) {
  return (
    <Image
      src="/lion-logo.png"
      alt="Team 5806 lion crest"
      width={52}
      height={52}
      className={className}
    />
  );
}
