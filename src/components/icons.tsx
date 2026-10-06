/**
 * Inline SVG icons — no icon library, every icon-only button gets an
 * `aria-label` from the caller.
 */
interface IconProps {
  className?: string
}

function glyphProps(className: string | undefined) {
  return {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  }
}

export function GearIcon({ className }: IconProps) {
  return (
    <svg {...glyphProps(className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

export function ExitIcon({ className }: IconProps) {
  return (
    <svg {...glyphProps(className)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}

export function SendIcon({ className }: IconProps) {
  return (
    <svg {...glyphProps(className)}>
      <path d="M21.5 2.5 11 13" />
      <path d="M21.5 2.5 15 21.5 11 13 2.5 9Z" />
    </svg>
  )
}

export function EyeIcon({ className }: IconProps) {
  return (
    <svg {...glyphProps(className)}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function EyeOffIcon({ className }: IconProps) {
  return (
    <svg {...glyphProps(className)}>
      <path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17.6 17.6 0 0 1-3 3.6" />
      <path d="M6.6 6.7A17.4 17.4 0 0 0 2 12s3.6 6 10 6a9.8 9.8 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  )
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg {...glyphProps(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.2h.01" />
    </svg>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...glyphProps(className)}>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  )
}

export function RefreshIcon({ className }: IconProps) {
  return (
    <svg {...glyphProps(className)}>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
      <path d="M20.5 4v5h-5" />
    </svg>
  )
}