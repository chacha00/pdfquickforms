export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className={compact ? "h-7 w-7" : "h-8 w-8"} aria-hidden>
        <rect width="32" height="32" rx="8" fill="#2563EB" />
        <path d="M10 6h8l5 5v14a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" fill="#fff" />
        <path d="M18 6v5h5" fill="#BFDBFE" />
        <rect x="11.5" y="14" width="9" height="2.6" rx=".6" fill="none" stroke="#2563EB" strokeWidth="1.2" />
        <rect x="11.5" y="19" width="3" height="3" rx=".5" fill="#2563EB" />
        <path d="M16 20.6h4.5" stroke="#2563EB" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span className={`font-extrabold tracking-tight text-ink ${compact ? "hidden text-base sm:inline" : "text-lg"}`}>
        PDFQuick <span className="text-primary">Forms</span>
      </span>
    </span>
  );
}
