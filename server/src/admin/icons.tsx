import { raw } from "hono/html";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clapperboard,
  ClockFading,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  Funnel,
  CalendarClock,
  Gauge,
  HardDrive,
  Info,
  LoaderCircle,
  LogOut,
  Menu,
  PanelLeft,
  Pencil,
  Play,
  Plus,
  RadioTower,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  Star,
  Trash,
  TriangleAlert,
  Tv,
  X,
} from "lucide-static";

/**
 * Lucide icons, inlined as SVG at render time: no icon font, no script. Named imports only, so
 * esbuild keeps just these. Add an icon here before using it: a page never imports lucide itself.
 */
const ICONS = {
  "arrow-down": ArrowDown,
  "arrow-up": ArrowUp,
  alert: CircleAlert,
  check: Check,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  copy: Copy,
  dashboard: Gauge,
  devices: Tv,
  edit: Pencil,
  error: TriangleAlert,
  external: ExternalLink,
  eye: Eye,
  "eye-off": EyeOff,
  favorites: Star,
  film: Film,
  history: ClockFading,
  info: Info,
  live: RadioTower,
  loader: LoaderCircle,
  logout: LogOut,
  logs: ScrollText,
  menu: Menu,
  panel: PanelLeft,
  play: Play,
  plus: Plus,
  refresh: RefreshCw,
  rules: Funnel,
  epg: CalendarClock,
  caches: HardDrive,
  search: Search,
  series: Clapperboard,
  settings: Settings,
  studios: Building2,
  success: CircleCheck,
  trash: Trash,
  x: X,
} as const;

export type IconName = keyof typeof ICONS;

/** `cls` replaces Lucide's own classes: a `size-*` there overrides the 16 px Basecoat gives an icon in a button or a menu. */
export const Icon = ({ name, cls = "" }: { name: IconName; cls?: string }) =>
  raw(
    ICONS[name]
      .replace(/class="[^"]*"/, `class="${cls}" aria-hidden="true"`)
      .replace(/\s*\n\s*/g, " ")
      .trim(),
  );
