export function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="hsl(var(--primary))" />
      <rect x="7" y="8" width="11" height="16" rx="2" fill="none" stroke="hsl(var(--primary-foreground))" strokeWidth="2" />
      <path d="M21 9 L25 9 M21 14 L25 14 M21 19 L24 19" stroke="hsl(var(--primary-foreground))" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12.5" cy="16" r="2.4" fill="hsl(var(--primary-foreground))" />
    </svg>
  );
}
