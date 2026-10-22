/** Lightweight inline SVG icons (no icon-package dependency). */

type IconProps = {
  className?: string;
  title?: string;
};

const base = "h-4 w-4 shrink-0";

export function IconUsers({ className = base, title }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden={!title}>
      {title ? <title>{title}</title> : null}
      <path
        d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3ZM8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3ZM8.5 13c-2.5 0-6 1.2-6 3.5V19h9v-2.5C11.5 14.2 10.3 13 8.5 13ZM15.5 13c-.4 0-.8 0-1.2.1A4.3 4.3 0 0 1 17 16.5V19h5v-2.5C22 14.2 18 13 15.5 13Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconGraduation({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3Zm0 12.2L4.5 11 12 7l7.5 4-7.5 4.2Z"
        fill="currentColor"
      />
      <path d="M5 13.5V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-3.5l-7 3.8-7-3.8Z" fill="currentColor" opacity=".85" />
    </svg>
  );
}

export function IconStaff({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconShield({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2 4 5v6c0 5.1 3.4 9.8 8 11 4.6-1.2 8-5.9 8-11V5l-8-3Zm0 18c-3.2-1.1-6-4.7-6-9V6.5l6-2.3 6 2.3V11c0 4.3-2.8 7.9-6 9Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconPlus({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" fill="currentColor" />
    </svg>
  );
}

export function IconUpload({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M11 16V7.8l-2.6 2.6-1.4-1.4L12 4l5 5-1.4 1.4L13 7.8V16h-2Zm-6 4v-2h14v2H5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconDownload({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M11 4h2v8.2l2.6-2.6 1.4 1.4L12 16l-5-5 1.4-1.4L11 12.2V4Zm-6 14h14v2H5v-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconSearch({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9.7 12.3-3.8-3.8 1.4-1.4 3.8 3.8-1.4 1.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconFlask({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 3h6v2h-1v4.6l5 8.4A2 2 0 0 1 17.3 21H6.7A2 2 0 0 1 5 18l5-8.4V5H9V3Zm2 2v5.2L6.7 19h10.6L13 10.2V5h-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconBook({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 4h9a3 3 0 0 1 3 3v13H8a2 2 0 0 0-2 2H4V7a3 3 0 0 1 2-3Zm0 2a1 1 0 0 0-1 1v11.2A3.8 3.8 0 0 1 8 17h10V7a1 1 0 0 0-1-1H6Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconClipboard({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 3h6l1 2h3a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3l1-2Zm0 2-.5 1H5v13h14V6h-3.5L15 5H9Zm1 5h4v2h-4v-2Zm0 4h6v2h-6v-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconAlert({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3 1 21h22L12 3Zm0 4.8 7.2 11.2H4.8L12 7.8ZM11 11h2v4h-2v-4Zm0 5h2v2h-2v-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconCheck({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9.5 16.5 5 12l1.4-1.4 3.1 3.1 8.1-8.2L19 7l-9.5 9.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconLock({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4V7Zm7 12H7v-8h10v8Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconSort({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 4h2v12.2l2.3-2.3 1.4 1.4L8 20l-4.7-4.7 1.4-1.4L7 16.2V4Zm8 16h2V7.8l2.3 2.3 1.4-1.4L17 4l-4.7 4.7 1.4 1.4L15 7.8V20Z" fill="currentColor" />
    </svg>
  );
}

export function IconCalendar({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3h2v2h6V3h2v2h3a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3V3Zm13 8H4v8h16v-8Zm0-2V7H4v2h16Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconEdit({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 17.3V20h2.7l9.8-9.8-2.7-2.7L4 17.3ZM19.7 7.3a.9.9 0 0 0 0-1.3l-1.7-1.7a.9.9 0 0 0-1.3 0l-1.3 1.3 2.7 2.7 1.6-1Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconDots({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconChart({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 19h16v2H4v-2Zm2-2V9h2v8H6Zm5 0V5h2v12h-2Zm5 0v-5h2v5h-2Z"
        fill="currentColor"
      />
    </svg>
  );
}
