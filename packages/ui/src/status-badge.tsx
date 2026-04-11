type StatusBadgeProps = {
  label: string;
  tone?: "neutral" | "claimed" | "verified" | "warning" | "rejected";
};

const badgeClasses: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  neutral: "bg-white/70 text-slate-700",
  claimed: "bg-amber-100 text-amber-900",
  verified: "bg-emerald-100 text-emerald-900",
  warning: "bg-rose-100 text-rose-900",
  rejected: "bg-slate-900 text-white",
};

export function StatusBadge({
  label,
  tone = "neutral",
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-[0.08em] uppercase ${badgeClasses[tone]}`}
    >
      {label}
    </span>
  );
}
