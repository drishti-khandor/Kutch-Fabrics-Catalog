"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, Check } from "lucide-react";

export default function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (files: File[]) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [shots, setShots] = useState<{ file: File; preview: string }[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setReady(true);
      })
      .catch(() => setError("Could not access camera. Check browser permissions."));

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const takeShot = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
        const preview = URL.createObjectURL(file);
        setShots((prev) => [...prev, { file, preview }]);
      },
      "image/jpeg",
      0.92
    );
  }, []);

  const removeShot = (idx: number) => {
    setShots((prev) => prev.filter((_, i) => i !== idx));
  };

  const finish = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(shots.map((s) => s.file));
  };

  const cancel = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <p className="text-sm font-medium">
          {shots.length > 0
            ? `${shots.length} photo${shots.length > 1 ? "s" : ""} captured`
            : "Take a photo"}
        </p>
        <button
          type="button"
          onClick={cancel}
          className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {error ? (
          <p className="text-red-300 text-sm px-6 text-center">{error}</p>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-h-full max-w-full object-contain"
          />
        )}
      </div>

      {shots.length > 0 && (
        <div className="flex gap-2 px-4 pb-2 overflow-x-auto">
          {shots.map((s, i) => (
            <div key={i} className="relative w-16 h-16 shrink-0">
              <img
                src={s.preview}
                alt={`Shot ${i + 1}`}
                className="w-full h-full object-cover rounded-lg border border-white/20"
              />
              <button
                type="button"
                onClick={() => removeShot(i)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"
              >
                <X size={8} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-6 p-6">
        <button
          type="button"
          onClick={takeShot}
          disabled={!ready}
          className="w-16 h-16 rounded-full bg-white disabled:opacity-40 flex items-center justify-center ring-4 ring-white/30 transition-opacity"
        >
          <Camera size={24} className="text-slate-800" />
        </button>
        {shots.length > 0 && (
          <button
            type="button"
            onClick={finish}
            className="flex items-center gap-2 bg-brand-600 text-white px-5 py-3 rounded-full font-semibold text-sm hover:bg-brand-700 transition-colors"
          >
            <Check size={16} /> Done ({shots.length})
          </button>
        )}
      </div>
    </div>
  );
}
