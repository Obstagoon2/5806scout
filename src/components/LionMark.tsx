import Image from "next/image";

interface LionMarkProps {
  className?: string;
}

export function LionMark({ className }: LionMarkProps) {
  return (
    <Image
      src="/logo.png"
      alt="I Hate Nakul"
      width={52}
      height={52}
      className={className}
    />
  );
}
