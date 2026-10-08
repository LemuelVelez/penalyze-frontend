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

// Shade the photograph just enough to harmonize with each theme. The text
// itself is protected by opaque-enough cards and heading panels, so images
// remain recognizable instead of disappearing under a near-solid overlay.
const overlayClassNames: Record<Overlay, string> = {
  light: "bg-linear-to-b from-background/12 via-background/20 to-background/30 dark:from-background/23 dark:via-background/33 dark:to-background/45",
  medium: "bg-linear-to-b from-background/17 via-background/26 to-background/38 dark:from-background/29 dark:via-background/40 dark:to-background/52",
  strong: "bg-linear-to-b from-background/22 via-background/31 to-background/44 dark:from-background/34 dark:via-background/45 dark:to-background/58",
};

// On smaller screens a modest extra tint supports compact content without
// losing the photo; dense text still sits on its own readable surface.
const mobileOverlayClassNames: Record<Overlay, string> = {
  light: "bg-linear-to-b from-background/21 via-background/31 to-background/43 dark:from-background/33 dark:via-background/44 dark:to-background/56",
  medium: "bg-linear-to-b from-background/29 via-background/40 to-background/52 dark:from-background/39 dark:via-background/49 dark:to-background/61",
  strong: "bg-linear-to-b from-background/35 via-background/46 to-background/59 dark:from-background/44 dark:via-background/55 dark:to-background/66",
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
            className={`${imageClassName} saturate-105 contrast-105 ${lightLoaded ? "opacity-100" : ""}`}
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
            className={`${imageClassName} saturate-105 contrast-105 brightness-90 ${darkLoaded ? "opacity-100" : ""}`}
          />
        </picture>
      )}
      <div className={`absolute inset-0 hidden sm:block ${overlayClassNames[overlay]}`} />
      <div className={`absolute inset-0 sm:hidden ${mobileOverlayClassNames[mobileOverlay]}`} />
    </div>
  );
}
