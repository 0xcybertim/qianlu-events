import type { CSSProperties } from "react";

const defaultCheckmarkColors = [
  "#0f9f6e",
  "#22c55e",
  "#16a34a",
  "#34d399",
  "#047857",
  "#bbf7d0",
];

type CheckmarkBurstProps = {
  className?: string;
  colors?: string[];
  columns?: number;
  durationScale?: number;
  pieceScale?: number;
  pieceCount?: number;
  showMark?: boolean;
  spread?: number;
  variant?: "full" | "button";
};

function buildCheckmarkPieces({
  colors,
  columns,
  durationScale,
  pieceScale,
  pieceCount,
  spread,
}: {
  colors: string[];
  columns: number;
  durationScale: number;
  pieceScale: number;
  pieceCount: number;
  spread: number;
}) {
  return Array.from({ length: pieceCount }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const direction = column - (columns - 1) / 2;
    const x = (direction * 18 + (row % 2 === 0 ? 8 : -8)) * spread;
    const y = (-128 - row * 22 - (column % 5) * 9) * spread;
    const rotation = (index * 47) % 360;
    const delay = (index % 12) * 0.018;
    const duration = (1.1 + (index % 7) * 0.055) * durationScale;

    return {
      color: colors[index % colors.length],
      delay,
      duration,
      rotation,
      size: (9 + (index % 5) * 4) * pieceScale,
      x,
      y,
    };
  });
}

export function CheckmarkBurst({
  className = "",
  colors = defaultCheckmarkColors,
  columns = 20,
  durationScale = 1,
  pieceScale = 1,
  pieceCount = 100,
  showMark = true,
  spread = 1,
  variant = "full",
}: CheckmarkBurstProps) {
  const pieces = buildCheckmarkPieces({
    colors: colors.length > 0 ? colors : defaultCheckmarkColors,
    columns,
    durationScale,
    pieceScale,
    pieceCount,
    spread,
  });

  return (
    <div
      aria-hidden="true"
      className={[
        "checkmark-burst",
        variant === "button" ? "checkmark-burst-button" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showMark ? (
        <div className="checkmark-burst-mark">
          <svg
            className="size-16"
            fill="none"
            viewBox="0 0 64 64"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M18 33.5 27.2 43 47 21"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="7"
            />
          </svg>
        </div>
      ) : null}
      <div className="checkmark-burst-stage">
        {pieces.map((piece, index) => (
          <span
            className="checkmark-burst-piece"
            key={index}
            style={
              {
                "--confetti-color": piece.color,
                "--confetti-delay": `${piece.delay}s`,
                "--confetti-duration": `${piece.duration}s`,
                "--confetti-rotate": `${piece.rotation}deg`,
                "--confetti-size": `${piece.size}px`,
                "--confetti-x": `${piece.x}px`,
                "--confetti-y": `${piece.y}px`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
