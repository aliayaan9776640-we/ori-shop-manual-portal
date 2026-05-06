import { cn } from "@/lib/utils";

// Primary brand mark — Ori Barakah Store circular logo (orange fruit + olive
// wordmark on a white field, ringed with black). Used as the public-facing
// shop avatar, watermark and login mark.
export const LOGO_URL =
  "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/7xkvndux5zsdik70ngkk0.jpeg";

// Companion crest — Ori Brothers (black + gold lion). Used as the corporate
// watermark in admin dashboards and on auth screens to signal ownership.
export const LOGO_URL_BROTHERS =
  "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/mm8jgvkjw56jvnu4bii6d.jpeg";

interface LogoProps {
  size?: number;
  className?: string;
  ring?: boolean;
  variant?: "barakah" | "brothers";
}

export default function Logo({
  size = 40,
  className,
  ring = false,
  variant = "barakah",
}: LogoProps) {
  const src = variant === "brothers" ? LOGO_URL_BROTHERS : LOGO_URL;
  const alt = variant === "brothers" ? "Ori Brothers" : "Ori Barakah Store";
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      onError={(e) => {
        // Fail gracefully if the remote logo is unavailable — hide instead of
        // showing a broken-image icon that would distract the user.
        (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
      }}
      className={cn(
        "rounded-full object-cover bg-white",
        ring && "ring-2 ring-white/80 shadow-md",
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}

// BrandMark — standardized rectangular logo display. Wraps logos that may
// have non-transparent backgrounds in a clean white rounded card so both
// crests look intentional and consistent in headers/sidebars.
interface BrandMarkProps {
  variant?: "barakah" | "brothers";
  height?: number;
  maxWidth?: number;
  className?: string;
  card?: boolean;
  /**
   * Fraction of the top portion of the source image to hide (0–0.4).
   * The uploaded JPEGs include a thin band of background noise above the
   * actual logo artwork; cropping ~12% from the top removes it cleanly
   * without distorting the aspect ratio.
   */
  cropTop?: number;
}

export function BrandMark({
  variant = "barakah",
  height = 56,
  maxWidth = 180,
  className,
  card = true,
  cropTop = 0.12,
}: BrandMarkProps) {
  const src = variant === "brothers" ? LOGO_URL_BROTHERS : LOGO_URL;
  const alt = variant === "brothers" ? "Ori Brothers" : "Ori Barakah Store";
  const crop = Math.max(0, Math.min(0.4, cropTop));
  // We hide the top `crop` fraction of the source image by scaling the
  // background to (1 / (1 - crop)) of the container height and anchoring
  // it to the bottom. This keeps the visible artwork centred, undistorted
  // and free of the noisy top band.
  const bgZoom = `${(1 / (1 - crop)) * 100}%`;
  return (
    <div
      role="img"
      aria-label={alt}
      className={cn(
        "inline-flex items-center justify-center shrink-0 overflow-hidden",
        card && "rounded-xl bg-white shadow-sm ring-1 ring-black/5",
        className
      )}
      style={{
        height,
        maxWidth,
        width: maxWidth,
        backgroundImage: `url(${src})`,
        backgroundSize: `auto ${bgZoom}`,
        backgroundPosition: "center bottom",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
