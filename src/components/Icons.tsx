import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const common = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true
};

export const ChatIcon = (props: IconProps) => (
  <svg {...common} {...props}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5.1A7 7 0 0 1 3 12V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></svg>
);
export const PulseIcon = (props: IconProps) => (
  <svg {...common} {...props}><path d="M3 12h4l2-6 4 12 2-6h6" /></svg>
);
export const SearchIcon = (props: IconProps) => (
  <svg {...common} {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
);
export const CompareIcon = (props: IconProps) => (
  <svg {...common} {...props}><path d="M8 3v18M16 3v18M4 7h8M12 17h8" /></svg>
);
export const ImageIcon = (props: IconProps) => (
  <svg {...common} {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 20" /></svg>
);
export const SettingsIcon = (props: IconProps) => (
  <svg {...common} {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z" /></svg>
);
export const RefreshIcon = (props: IconProps) => (
  <svg {...common} {...props}><path d="M20 6v5h-5" /><path d="M4 18v-5h5" /><path d="M6.1 9a7 7 0 0 1 11.6-2.6L20 11M4 13l2.3 4.6A7 7 0 0 0 18 15" /></svg>
);
export const StopIcon = (props: IconProps) => (
  <svg {...common} {...props}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
);
export const SendIcon = (props: IconProps) => (
  <svg {...common} {...props}><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></svg>
);
export const TrashIcon = (props: IconProps) => (
  <svg {...common} {...props}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /></svg>
);
export const RepeatIcon = (props: IconProps) => (
  <svg {...common} {...props}><path d="m17 1 4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
);
