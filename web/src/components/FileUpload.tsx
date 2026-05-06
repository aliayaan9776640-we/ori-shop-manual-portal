import { useRef, useState } from "react";
import { Upload, X, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BUCKET = "uploads";
const DEFAULT_MAX_MB = 8;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const PDF_TYPE = "application/pdf";

export type FileUploadProps = {
  value: string;
  onChange: (url: string) => void;
  /** Folder inside the "uploads" bucket, e.g. "products" or "shop/banners". */
  folder?: string;
  /** Allow PDF in addition to images. */
  acceptPdf?: boolean;
  /** Max file size in MB. */
  maxMb?: number;
  /** Show the URL text input alongside the upload button. */
  showUrlField?: boolean;
  className?: string;
  previewClassName?: string;
};

const isImageUrl = (url: string): boolean =>
  /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(url) ||
  url.startsWith("data:image/") ||
  // Supabase public URLs don't always have an extension visible
  url.includes("/storage/v1/object/public/");

const isPdfUrl = (url: string): boolean =>
  /\.pdf(\?|$)/i.test(url);

export default function FileUpload({
  value,
  onChange,
  folder = "misc",
  acceptPdf = false,
  maxMb = DEFAULT_MAX_MB,
  showUrlField = true,
  className,
  previewClassName,
}: FileUploadProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);

  const accept = acceptPdf
    ? "image/png,image/jpeg,image/jpg,image/webp,application/pdf"
    : "image/png,image/jpeg,image/jpg,image/webp";

  const handlePick = (): void => {
    inputRef.current?.click();
  };

  const handleFile = async (file: File): Promise<void> => {
    const allowed = acceptPdf
      ? [...IMAGE_TYPES, PDF_TYPE]
      : IMAGE_TYPES;
    if (!allowed.includes(file.type)) {
      toast.error(
        acceptPdf
          ? "Only PNG, JPG, WEBP or PDF files are allowed"
          : "Only PNG, JPG or WEBP images are allowed"
      );
      return;
    }
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > maxMb) {
      toast.error(`File too large. Max ${maxMb}MB.`);
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const safeFolder = folder.replace(/^\/+|\/+$/g, "") || "misc";
      const key = `${safeFolder}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(key, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        });
      if (upErr) {
        // eslint-disable-next-line no-console
        console.error("[FileUpload] upload error", upErr);
        const msg = (upErr.message || "").toLowerCase();
        if (
          msg.includes("bucket not found") ||
          msg.includes("not_found") ||
          msg.includes("no such bucket")
        ) {
          toast.error(
            `Storage bucket "${BUCKET}" is missing. Please create it in Supabase.`
          );
        } else {
          toast.error(upErr.message || "Upload failed");
        }
        return;
      }

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
      const url = data.publicUrl;
      if (!url) {
        toast.error("Could not resolve uploaded file URL");
        return;
      }
      onChange(url);
      toast.success("File uploaded");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[FileUpload] unexpected", err);
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const clear = (): void => {
    onChange("");
  };

  const showImagePreview = value && isImageUrl(value);
  const showPdfPreview = value && isPdfUrl(value);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePick}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {uploading ? "Uploading…" : "Upload file"}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            className="text-destructive hover:text-destructive"
          >
            <X className="mr-1 h-4 w-4" />
            Remove
          </Button>
        )}
        <span className="text-[10px] text-muted-foreground">
          {acceptPdf ? "PNG · JPG · WEBP · PDF" : "PNG · JPG · WEBP"} · max{" "}
          {maxMb}MB
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onInputChange}
        className="hidden"
      />

      {showUrlField && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… (or upload a file)"
          className="text-xs"
        />
      )}

      {showImagePreview && (
        <div
          className={cn(
            "overflow-hidden rounded-md border bg-muted",
            previewClassName ?? "h-32"
          )}
        >
          <img
            src={value}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
            }}
          />
        </div>
      )}

      {showPdfPreview && !showImagePreview && (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-xs hover:bg-muted/70"
        >
          <FileText className="h-4 w-4" />
          <span className="truncate">{value.split("/").pop()}</span>
        </a>
      )}
    </div>
  );
}
