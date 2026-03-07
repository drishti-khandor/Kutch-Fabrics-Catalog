"use client";
import { useState, useRef } from "react";
import { Search, Mic, MicOff, Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

interface Props {
  onVisualSearch?: (file: File) => void;
  defaultValue?: string;
}

export default function SearchBar({ onVisualSearch, defaultValue = "" }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);
  const [listening, setListening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<SpeechRecognition | null>(null);

  const doSearch = (q: string) => {
    if (!q.trim()) return;
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const toggleVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return alert("Voice search not supported in this browser.");

    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }

    const recog = new SR();
    recog.lang = "en-IN";
    recog.continuous = false;
    recog.interimResults = false;
    recog.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      setQuery(transcript);
      setListening(false);
      doSearch(transcript);
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);
    recogRef.current = recog;
    recog.start();
    setListening(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onVisualSearch) onVisualSearch(file);
    e.target.value = "";
  };

  return (
    <div className="relative flex items-center w-full max-w-2xl">
      <div className="absolute left-3 text-slate-400">
        <Search size={18} />
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
        placeholder="Search by name, color, rack..."
        className="w-full pl-10 pr-24 py-2.5 rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm placeholder:text-slate-400"
      />

      <div className="absolute right-2 flex items-center gap-1">
        {/* Voice */}
        <button
          onClick={toggleVoice}
          className={clsx(
            "p-1.5 rounded-lg transition-colors",
            listening
              ? "bg-red-100 text-red-600 animate-pulse"
              : "text-slate-400 hover:text-brand-600 hover:bg-brand-50"
          )}
          title="Voice search"
        >
          {listening ? <MicOff size={16} /> : <Mic size={16} />}
        </button>

        {/* Visual search */}
        {onVisualSearch && (
          <button
            onClick={() => fileRef.current?.click()}
            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
            title="Search by image"
          >
            <Camera size={16} />
          </button>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
    </div>
  );
}
