import {cn} from "@/lib/utils";

export interface ShinyTextProps {
    readonly text: string;
    readonly speed?: number;
    readonly className?: string;
    readonly disabled?: boolean;
}

/**
 * ShinyText — animated background-clip shimmer for numbers and short accent
 * strings. Uses a wide linear-gradient masked to the text. Honours
 * prefers-reduced-motion (media query in src/index.css).
 */
export function ShinyText({
                              text,
                              speed = 4,
                              className,
                              disabled = false,
                          }: ShinyTextProps) {
    return (
        <span
            className={cn("shiny-text", disabled && "shiny-text-off", className)}
            style={{animationDuration: `${speed}s`}}
            data-text={text}
        >
      {text}
            <style>{`
        .shiny-text {
          position: relative;
          display: inline-block;
          color: inherit;
          /* The shimmer is painted on top via ::after so the base text stays
             fully visible at every animation phase (matters for static
             screenshots + SSR hydration). */
        }
        .shiny-text::after {
          content: attr(data-text);
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image: linear-gradient(
            110deg,
            transparent 40%,
            color-mix(in srgb, currentColor 60%, white) 50%,
            transparent 60%
          );
          background-size: 300% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: shiny-sweep linear infinite;
          animation-duration: inherit;
        }
        .shiny-text-off::after {
          animation: none;
          background: none;
        }
        @keyframes shiny-sweep {
          0%   { background-position: 120% 0; }
          100% { background-position: -120% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .shiny-text::after {
            animation: none;
            background: none;
          }
        }
      `}</style>
    </span>
    );
}

export default ShinyText;
