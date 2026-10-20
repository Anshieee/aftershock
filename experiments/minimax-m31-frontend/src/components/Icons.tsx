import type { ReactNode } from 'react';

/**
 * Icon set — 16px stroke icons drawn inline so the prototype has no icon-font
 * or icon-library dependency. All share a 1.5px stroke on a 24px grid.
 */

type IconProps = {
  className?: string;
  size?: number;
  strokeWidth?: number;
};

function Base({
  children,
  className,
  size = 16,
  strokeWidth = 1.5,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 10.5 12 3.75l8.5 6.75V19a1.25 1.25 0 0 1-1.25 1.25h-4.5v-6h-5.5v6h-4.5A1.25 1.25 0 0 1 3.5 19z" />
  </Base>
);

export const IconPlus = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconLibrary = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 5.5h6v13H4zM14 5.5h6v13h-6z" />
  </Base>
);

export const IconList = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </Base>
);

export const IconActivity = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
  </Base>
);

export const IconReader = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 4.75h6a2.5 2.5 0 0 1 2 2.5v12a2 2 0 0 0-2-1.5H4zM20 4.75h-6a2.5 2.5 0 0 0-2 2.5v12a2 2 0 0 1 2-1.5h6z" />
  </Base>
);

export const IconLayers = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5 3.75 8 12 12.5 20.25 8zM3.75 12.5 12 17l8.25-4.5M3.75 16.5 12 21l8.25-4.5" />
  </Base>
);

export const IconReview = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 11.5l2.2 2.2L15.5 9.4" />
    <path d="M5.5 4.5h13v15h-13z" />
  </Base>
);

export const IconGraph = (p: IconProps) => (
  <Base {...p}>
    <circle cx="6" cy="7" r="2.1" />
    <circle cx="18" cy="6" r="2.1" />
    <circle cx="12" cy="17" r="2.1" />
    <path d="M7.8 8.2 10.7 15.3M16.4 7.6 13.5 15.4M8 6.8l7.9-.5" />
  </Base>
);

export const IconReport = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 3.5h8l4 4v13H6z" />
    <path d="M14 3.5v4h4M9 12h6M9 16h6" />
  </Base>
);

export const IconSun = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
  </Base>
);

export const IconMoon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.2 8.2 0 1 0 20 14.2z" />
  </Base>
);

export const IconChevronRight = (p: IconProps) => (
  <Base {...p}>
    <path d="M9.5 5.5 16 12l-6.5 6.5" />
  </Base>
);

export const IconChevronDown = (p: IconProps) => (
  <Base {...p}>
    <path d="M5.5 9.5 12 16l6.5-6.5" />
  </Base>
);

export const IconSearch = (p: IconProps) => (
  <Base {...p}>
    <circle cx="10.75" cy="10.75" r="6.25" />
    <path d="m15.5 15.5 4 4" />
  </Base>
);

export const IconZoomIn = (p: IconProps) => (
  <Base {...p}>
    <circle cx="10.75" cy="10.75" r="6.25" />
    <path d="m15.5 15.5 4 4M10.75 8.25v5M8.25 10.75h5" />
  </Base>
);

export const IconZoomOut = (p: IconProps) => (
  <Base {...p}>
    <circle cx="10.75" cy="10.75" r="6.25" />
    <path d="m15.5 15.5 4 4M8.25 10.75h5" />
  </Base>
);

export const IconClose = (p: IconProps) => (
  <Base {...p}>
    <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
  </Base>
);

export const IconPanel = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 5.5h16v13H4zM14.5 5.5v13" />
  </Base>
);

export const IconGuide = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M10.2 9.3 15 12l-4.8 2.7z" />
  </Base>
);

export const IconDownload = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4v10M8 10.5 12 14.5l4-4M5 19.5h14" />
  </Base>
);

export const IconPrint = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 9V4.5h10V9M7 17.5H5.5A1.5 1.5 0 0 1 4 16V11a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 11v5a1.5 1.5 0 0 1-1.5 1.5H17" />
    <path d="M7 14.5h10v5H7z" />
  </Base>
);

export const IconExternal = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 4.5h5.5V10M19 5 11 13" />
    <path d="M18 14v4.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5" />
  </Base>
);

export const IconUpload = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 15V4.5M8.5 8 12 4.5 15.5 8M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" />
  </Base>
);

export const IconDocument = (p: IconProps) => (
  <Base {...p}>
    <path d="M6.5 3.5h7l4 4v13h-11z" />
    <path d="M13.5 3.5v4h4" />
  </Base>
);

export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Base>
);

export const IconPause = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 5v14M15 5v14" />
  </Base>
);

export const IconRefresh = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4.5V10h-5.5" />
  </Base>
);

export const IconSkip = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 5.5 15 12l-9 6.5zM18 5.5v13" />
  </Base>
);

export const IconTarget = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="2.6" />
  </Base>
);

export const IconArrowRight = (p: IconProps) => (
  <Base {...p}>
    <path d="M4.5 12h14M13 6.5 18.5 12 13 17.5" />
  </Base>
);

export const IconArrowLeft = (p: IconProps) => (
  <Base {...p}>
    <path d="M19.5 12h-14M11 6.5 5.5 12 11 17.5" />
  </Base>
);

export const IconFilter = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6h16l-6.2 7.2v5.3l-3.6 1.8v-7.1z" />
  </Base>
);

export const IconBookmark = (p: IconProps) => (
  <Base {...p}>
    <path d="M6.5 4.5h11v15l-5.5-4-5.5 4z" />
  </Base>
);

export const IconPlay = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 4.8 19 12 7 19.2z" />
  </Base>
);

