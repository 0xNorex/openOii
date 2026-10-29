import { Dialog } from "~/components/ui/Dialog";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "../../components/ui/Button";
import { IconButton } from "../../components/ui/IconButton";
import { PlainButton } from "../../components/ui/PlainButton";

interface ImagePreviewModalProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export function ImagePreviewModal({ src, alt, onClose }: ImagePreviewModalProps) {
  return (
    <Dialog open onClose={onClose} variant="lightbox" label={`图片预览：${alt}`}>
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-[90vh] object-contain rounded-lg"
      />
      <IconButton variant="secondary"
        className="absolute -top-3 -right-3 rounded-full"
        onClick={onClose}
        aria-label="关闭"
      >
        <XMarkIcon className="w-5 h-5" aria-hidden="true" />
      </IconButton>
    </Dialog>
  );
}

interface VideoPreviewModalProps {
  src: string;
  title: string;
  onClose: () => void;
  showDownload?: boolean;
  onDownload?: () => void;
}

export function VideoPreviewModal({
  src,
  title,
  onClose,
  showDownload = true,
  onDownload,
}: VideoPreviewModalProps) {
  return (
    <Dialog open onClose={onClose} variant="lightbox" label={`视频预览：${title}`}>
      <video
        src={src}
        className="max-w-full max-h-[90vh] object-contain rounded-lg"
        controls
        autoPlay
      >
        <track kind="captions" label="中文字幕" src="" />
      </video>
      <IconButton variant="secondary"
        className="absolute -top-3 -right-3 rounded-full"
        onClick={onClose}
        aria-label="关闭"
      >
        <XMarkIcon className="w-5 h-5" aria-hidden="true" />
      </IconButton>
      {showDownload && (
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between bg-neutral/80 rounded-lg px-4 py-3 border border-line">
          <span className="text-primary-content text-sm font-medium truncate">
            {title}
          </span>
          <Button variant="secondary" size="sm"
            onClick={(e) => {
              e.stopPropagation();
              if (onDownload) {
                onDownload();
                return;
              }
              window.open(src, "_blank", "noopener,noreferrer");
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
              aria-hidden="true"
            >
              <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
              <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
            </svg>
            下载
          </Button>
        </div>
      )}
    </Dialog>
  );
}

interface PreviewableImageProps {
  src: string;
  alt: string;
  className?: string;
  onPreview: (src: string, alt: string) => void;
}

export function PreviewableImage({
  src,
  alt,
  className,
  onPreview,
}: PreviewableImageProps) {
  return (
    <PlainButton
      className={`${className} cursor-zoom-in hover:opacity-90 transition-opacity duration-fast p-0 bg-transparent border-0`}
      onClick={() => onPreview(src, alt)}
      aria-label={`预览图片：${alt}`}
    >
      <img src={src} alt={alt} className="w-full h-full object-inherit" />
    </PlainButton>
  );
}
