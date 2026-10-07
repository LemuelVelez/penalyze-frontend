import { useState } from "react";

type PageBackgroundProps = {
  image: string;
  darkImage?: string;
  overlay?: "light" | "medium" | "strong";
  className?: string;
};

const overlayClassNames: Record<
  NonNullable<PageBackgroundProps["overlay"]>,
  string
> = {
  light: "bg-linear-to-b from-background/25 via-background/45 to-background/75",
  medium: "bg-linear-to-b from-background/45 via-background/70 to-background/90",
  strong: "bg-linear-to-b from-background/70 via-background/85 to-background",
};

export default function PageBackground({
  image,
  darkImage,
  overlay = "strong",
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
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-linear-to-b from-primary/10 via-background to-background" />

      {!lightFailed ? (
        <img
          src={image}
          alt=""
          aria-hidden="true"
          decoding="async"
          loading="eager"
          fetchPriority="high"
          onLoad={() => setLightLoaded(true)}
          onError={() => setLightFailed(true)}
          className={`${imageClassName} ${darkImage ? "dark:hidden" : ""} ${
            lightLoaded ? "opacity-100" : ""
          }`}
        />
      ) : null}

      {darkImage && !darkFailed ? (
        <img
          src={darkImage}
          alt=""
          aria-hidden="true"
          decoding="async"
          loading="eager"
          fetchPriority="high"
          onLoad={() => setDarkLoaded(true)}
          onError={() => setDarkFailed(true)}
          className={`${imageClassName} hidden dark:block ${
            darkLoaded ? "dark:opacity-100" : ""
          }`}
        />
      ) : null}

      <div className={`absolute inset-0 ${overlayClassNames[overlay]}`} />
    </div>
  );
}
