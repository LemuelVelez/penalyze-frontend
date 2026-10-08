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
  light: "bg-linear-to-b from-background/25 via-background/45 to-background/75",
  medium: "bg-linear-to-b from-background/45 via-background/70 to-background/90",
  strong: "bg-linear-to-b from-background/70 via-background/85 to-background",
};

// Preserve the photo on small screens. The content itself provides local scrims.
const mobileOverlayClassNames: Record<Overlay, string> = {
  light: "bg-linear-to-b from-background/15 via-background/30 to-background/60",
  medium: "bg-linear-to-b from-background/25 via-background/45 to-background/70",
  strong: "bg-linear-to-b from-background/30 via-background/50 to-background/75",
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
        <picture className={darkImage ? "absolute inset-0 dark:hidden" : "absolute inset-0"}>
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
            className={`${imageClassName} ${lightLoaded ? "opacity-100" : ""}`}
          />
        </picture>
      )}
      {darkImage && !darkFailed && (
        <picture className="absolute inset-0 hidden dark:block">
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
            className={`${imageClassName} ${darkLoaded ? "opacity-100" : ""}`}
          />
        </picture>
      )}
      <div className={`absolute inset-0 hidden sm:block ${overlayClassNames[overlay]}`} />
      <div className={`absolute inset-0 sm:hidden ${mobileOverlayClassNames[mobileOverlay]}`} />
    </div>
  );
}
