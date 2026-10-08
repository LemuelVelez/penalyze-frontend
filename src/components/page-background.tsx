import { useState } from "react";
import { portraitBackground } from "../lib/backgrounds";

type Overlay = "light" | "medium" | "strong";

type PageBackgroundProps = {
  image: string;
  darkImage?: string;
  mobileImage?: string;
  mobileDarkImage?: string;
  objectPosition?: string;
  overlay?: Overlay;
  mobileOverlay?: Overlay;
  className?: string;
};

// A theme-coloured scrim keeps text legible over bright and high-contrast photos.
// Dark mode needs slightly more coverage because the photos themselves are not dark.
const overlayClassNames: Record<Overlay, string> = {
  light: "bg-linear-to-b from-background/58 via-background/66 to-background/74 dark:from-background/70 dark:via-background/76 dark:to-background/82",
  medium: "bg-linear-to-b from-background/70 via-background/77 to-background/84 dark:from-background/77 dark:via-background/83 dark:to-background/88",
  strong: "bg-linear-to-b from-background/78 via-background/84 to-background/90 dark:from-background/82 dark:via-background/87 dark:to-background/92",
};

// Small screens put more text directly over the photograph; shade them more strongly.
const mobileOverlayClassNames: Record<Overlay, string> = {
  light: "bg-linear-to-b from-background/70 via-background/78 to-background/86 dark:from-background/78 dark:via-background/84 dark:to-background/90",
  medium: "bg-linear-to-b from-background/77 via-background/83 to-background/89 dark:from-background/82 dark:via-background/87 dark:to-background/92",
  strong: "bg-linear-to-b from-background/83 via-background/89 to-background/94 dark:from-background/87 dark:via-background/92 dark:to-background/96",
};

export default function PageBackground({
  image,
  darkImage,
  mobileImage,
  mobileDarkImage,
  objectPosition = "center center",
  overlay = "strong",
  mobileOverlay = "medium",
  className = "",
}: PageBackgroundProps) {
  const [lightLoaded, setLightLoaded] = useState(false);
  const [lightFailed, setLightFailed] = useState(false);
  const [darkLoaded, setDarkLoaded] = useState(false);
  const [darkFailed, setDarkFailed] = useState(false);

  const imageClassName =
    "absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 motion-reduce:transition-none";

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 top-0 -z-10 h-screen h-lvh overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-linear-to-b from-primary/10 via-background to-background" />
      {!lightFailed && (
        <picture className={darkImage && !darkFailed ? "absolute inset-0 dark:hidden" : "absolute inset-0"}>
          <source media="(max-width: 639px)" srcSet={mobileImage ?? portraitBackground(image)} />
          <img
            src={image}
            alt=""
            decoding="async"
            loading="eager"
            fetchPriority="high"
            onLoad={() => setLightLoaded(true)}
            onError={() => setLightFailed(true)}
            style={{ objectPosition }}
            className={`${imageClassName} saturate-110 contrast-105 ${lightLoaded ? "opacity-100" : ""}`}
          />
        </picture>
      )}
      {darkImage && !darkFailed && (
        <picture className={lightFailed ? "absolute inset-0" : "absolute inset-0 hidden dark:block"}>
          <source media="(max-width: 639px)" srcSet={mobileDarkImage ?? portraitBackground(darkImage)} />
          <img
            src={darkImage}
            alt=""
            decoding="async"
            loading="eager"
            fetchPriority="high"
            onLoad={() => setDarkLoaded(true)}
            onError={() => setDarkFailed(true)}
            style={{ objectPosition }}
            className={`${imageClassName} saturate-105 contrast-105 ${darkLoaded ? "opacity-100" : ""}`}
          />
        </picture>
      )}
      <div className={`absolute inset-0 hidden sm:block ${overlayClassNames[overlay]}`} />
      <div className={`absolute inset-0 sm:hidden ${mobileOverlayClassNames[mobileOverlay]}`} />
    </div>
  );
}
