import { Camera, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export function V17Avatar({
  src,
  initials,
  size = "md",
  editable,
  uploading,
  onEdit,
  className,
}: {
  src?: string | null;
  initials?: string | null;
  size?: "sm" | "md" | "lg";
  editable?: boolean;
  uploading?: boolean;
  onEdit?: () => void;
  className?: string;
}) {
  const dimensions =
    size === "lg"
      ? "h-[72px] w-[72px] rounded-[20px] text-base"
      : size === "sm"
        ? "h-[35px] w-[35px] rounded-[11px] text-[10px]"
        : "h-[54px] w-[54px] rounded-2xl text-sm";
  const letters = initials?.trim().slice(0, 2).toUpperCase();
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)}>
      <span
        className={cn(
          "grid place-items-center overflow-hidden border border-[#222837] bg-[#151925] font-extrabold text-white",
          dimensions,
        )}
      >
        {src ? (
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : letters ? (
          letters
        ) : (
          <UserRound className={size === "lg" ? "h-8 w-8" : "h-5 w-5"} />
        )}
      </span>
      {editable ? (
        <button
          type="button"
          aria-label="Upload profile photo"
          className="absolute -right-1 -bottom-1 grid h-[27px] w-[27px] place-items-center rounded-[9px] border-2 border-[#080a0f] bg-primary text-white disabled:opacity-60"
          disabled={uploading}
          onClick={onEdit}
        >
          <Camera className="h-[13px] w-[13px]" />
        </button>
      ) : null}
    </span>
  );
}
