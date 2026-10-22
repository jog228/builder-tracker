import Image from "next/image";
import { cn } from "@/lib/utils";

const HUES = [25, 55, 145, 200, 260, 295, 330];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** GroupMe avatar, or colored initials when there isn't one. */
export function MemberAvatar({
  name,
  url,
  size = 40,
  className,
}: {
  name: string;
  url: string | null;
  size?: number;
  className?: string;
}) {
  const hue =
    HUES[[...name].reduce((h, c) => h + c.charCodeAt(0), 0) % HUES.length];
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `oklch(0.42 0.11 ${hue})`,
        color: `oklch(0.95 0.03 ${hue})`,
      }}
    >
      {initials(name)}
      {url && (
        <Image
          src={url}
          alt=""
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      )}
    </span>
  );
}
