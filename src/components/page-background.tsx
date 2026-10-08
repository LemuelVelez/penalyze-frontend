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

const overlayClassNames: Record<Overlay, string> = {
  light: "bg-linear-to-b from-background/12 via-background/24 to-background/38 dark:from-background/12 dark:via-background/23 dark:to-background/39",
  medium: "bg-linear-to-b from-background/19 via-background/30 to-background/46 dark:from-background/18 dark:via-background/31 dark:to-background/48",
  strong: "bg-linear-to-b from-background/25 via-background/39 to-background/55 dark:from-background/25 dark:via-background/39 dark:to-background/57",
};

// Mobile needs slightly more tint around the text while keeping the photograph visible.
const mobileOverlayClassNames: Record<Overlay, string> = {
  light: "bg-linear-to-b from-background/19 via-background/30 to-background/44 dark:from-background/18 dark:via-background/30 dark:to-background/46",
  medium: "bg-linear-to-b from-background/26 via-background/40 to-background/54 dark:from-background/26 dark:via-background/40 dark:to-background/55",
  strong: "bg-linear-to-b from-background/33 via-background/46 to-background/61 dark:from-background/33 dark:via-background/47 dark:to-background/63",
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
