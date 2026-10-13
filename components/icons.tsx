import React from 'react';
import { cn } from '../lib/cn';

/*
 * App-wide icon set: Google Material Symbols (Outlined, weight 400, grade 0, optical size 20).
 * The font is loaded in index.html and styled by `.material-symbol` in app.css.
 *
 * Each export keeps the name of the lucide-react icon it replaced, so call sites keep
 * `<Plus size={14} className="..." />` unchanged — and team/doc icons stored in the DB by
 * those names (see IconComponent.tsx) keep resolving. To add an icon, pick a name from
 * https://fonts.google.com/icons and add a `createIcon('<symbol_name>', '<ExportName>')` line.
 */

export interface IconProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  size?: number | string;
  /** Accepted for lucide-react compatibility; stroke weight is fixed by the font. */
  strokeWidth?: number | string;
}

export type IconType = React.ForwardRefExoticComponent<IconProps & React.RefAttributes<HTMLSpanElement>>;

const createIcon = (symbol: string, displayName: string): IconType => {
  const Icon = React.forwardRef<HTMLSpanElement, IconProps>(
    ({ size = 24, strokeWidth: _strokeWidth, className, style, ...rest }, ref) => {
      const labelled = rest['aria-label'] !== undefined;
      return (
        <span
          ref={ref}
          aria-hidden={labelled ? undefined : true}
          role={labelled ? 'img' : undefined}
          translate="no"
          className={cn('material-symbol', className)}
          // Numeric sizes are CSS px at the default 16px root; emitting rem lets icons follow
          // the desktop root scale in app.css (html font-size: 80%) like the rest of the UI.
          style={{ fontSize: typeof size === 'number' ? `${size / 16}rem` : size, ...style }}
          {...rest}
        >
          {symbol}
        </span>
      );
    },
  );
  Icon.displayName = displayName;
  return Icon;
};

export const AlarmClock = createIcon('alarm', 'AlarmClock');
export const AlarmClockOff = createIcon('alarm_off', 'AlarmClockOff');
export const AlertCircle = createIcon('error', 'AlertCircle');
export const AlertTriangle = createIcon('warning', 'AlertTriangle');
export const AlignCenter = createIcon('format_align_center', 'AlignCenter');
export const AlignLeft = createIcon('format_align_left', 'AlignLeft');
export const AlignRight = createIcon('format_align_right', 'AlignRight');
export const Archive = createIcon('archive', 'Archive');
export const ArrowDown = createIcon('arrow_downward', 'ArrowDown');
export const ArrowLeft = createIcon('arrow_back', 'ArrowLeft');
export const ArrowLeftRight = createIcon('swap_horiz', 'ArrowLeftRight');
export const ArrowRight = createIcon('arrow_forward', 'ArrowRight');
export const ArrowRightLeft = createIcon('swap_horiz', 'ArrowRightLeft');
export const ArrowUp = createIcon('arrow_upward', 'ArrowUp');
export const Bell = createIcon('notifications', 'Bell');
export const Bold = createIcon('format_bold', 'Bold');
export const BookOpen = createIcon('menu_book', 'BookOpen');
export const Briefcase = createIcon('work', 'Briefcase');
export const Cake = createIcon('cake', 'Cake');
export const Calendar = createIcon('calendar_today', 'Calendar');
export const CalendarClock = createIcon('calendar_clock', 'CalendarClock');
export const CalendarDays = createIcon('calendar_month', 'CalendarDays');
export const Camera = createIcon('photo_camera', 'Camera');
export const Check = createIcon('check', 'Check');
export const CheckCircle = createIcon('check_circle', 'CheckCircle');
export const CheckCircle2 = createIcon('check_circle', 'CheckCircle2');
export const CheckSquare = createIcon('check_box', 'CheckSquare');
export const ChevronDown = createIcon('expand_more', 'ChevronDown');
export const ChevronLeft = createIcon('chevron_left', 'ChevronLeft');
export const ChevronRight = createIcon('chevron_right', 'ChevronRight');
export const ChevronUp = createIcon('expand_less', 'ChevronUp');
export const CircleCheck = createIcon('check_circle', 'CircleCheck');
export const ClipboardCheck = createIcon('assignment_turned_in', 'ClipboardCheck');
export const ClipboardList = createIcon('assignment', 'ClipboardList');
export const Clock = createIcon('schedule', 'Clock');
export const Code = createIcon('code', 'Code');
export const Copy = createIcon('content_copy', 'Copy');
export const Cpu = createIcon('memory', 'Cpu');
export const CreditCard = createIcon('credit_card', 'CreditCard');
export const Database = createIcon('database', 'Database');
export const Download = createIcon('download', 'Download');
export const EmergencyHome = createIcon('emergency_home', 'EmergencyHome');
export const Edit2 = createIcon('edit', 'Edit2');
export const Eye = createIcon('visibility', 'Eye');
export const EyeOff = createIcon('visibility_off', 'EyeOff');
export const FileText = createIcon('description', 'FileText');
export const Filter = createIcon('filter_alt', 'Filter');
export const Folder = createIcon('folder', 'Folder');
export const FolderOpen = createIcon('folder_open', 'FolderOpen');
export const FolderPlus = createIcon('create_new_folder', 'FolderPlus');
export const Globe = createIcon('language', 'Globe');
export const GripVertical = createIcon('drag_indicator', 'GripVertical');
export const Hash = createIcon('tag', 'Hash');
export const Heading1 = createIcon('format_h1', 'Heading1');
export const Heading2 = createIcon('format_h2', 'Heading2');
export const Heading3 = createIcon('format_h3', 'Heading3');
export const Heart = createIcon('favorite', 'Heart');
export const HelpCircle = createIcon('help', 'HelpCircle');
export const History = createIcon('history', 'History');
export const IdCard = createIcon('id_card', 'IdCard');
export const Image = createIcon('image', 'Image');
export const Inbox = createIcon('inbox', 'Inbox');
// Material Symbols has no brand logos — placeholder until a replacement is chosen.
export const Instagram = createIcon('photo_library', 'Instagram');
export const Italic = createIcon('format_italic', 'Italic');
export const Layout = createIcon('space_dashboard', 'Layout');
export const LayoutDashboard = createIcon('dashboard', 'LayoutDashboard');
export const LayoutGrid = createIcon('grid_view', 'LayoutGrid');
// Report a problem (header). The Support section itself uses EmergencyHome.
export const LifeBuoy = createIcon('support_agent', 'LifeBuoy');
export const Lightbulb = createIcon('lightbulb', 'Lightbulb');
export const Link = createIcon('link', 'Link');
export const Link2 = createIcon('link', 'Link2');
export const List = createIcon('list', 'List');
export const ListChecks = createIcon('checklist', 'ListChecks');
export const ListOrdered = createIcon('format_list_numbered', 'ListOrdered');
export const Loader2 = createIcon('progress_activity', 'Loader2');
export const Lock = createIcon('lock', 'Lock');
export const LogOut = createIcon('logout', 'LogOut');
export const Mail = createIcon('mail', 'Mail');
export const MapPin = createIcon('location_on', 'MapPin');
export const Megaphone = createIcon('campaign', 'Megaphone');
export const Menu = createIcon('menu', 'Menu');
export const MessageCircle = createIcon('mode_comment', 'MessageCircle');
export const MessageSquare = createIcon('chat_bubble', 'MessageSquare');
export const Minus = createIcon('remove', 'Minus');
export const Monitor = createIcon('monitor', 'Monitor');
export const Moon = createIcon('dark_mode', 'Moon');
export const MoreHorizontal = createIcon('more_horiz', 'MoreHorizontal');
export const Music = createIcon('music_note', 'Music');
export const Package = createIcon('package_2', 'Package');
export const PackageX = createIcon('deployed_code_alert', 'PackageX');
export const Paintbrush = createIcon('brush', 'Paintbrush');
export const Palette = createIcon('palette', 'Palette');
export const Paperclip = createIcon('attach_file', 'Paperclip');
export const Pencil = createIcon('edit', 'Pencil');
export const PenTool = createIcon('draw', 'PenTool');
export const Plus = createIcon('add', 'Plus');
export const Printer = createIcon('print', 'Printer');
export const Quote = createIcon('format_quote', 'Quote');
export const RefreshCw = createIcon('refresh', 'RefreshCw');
export const Rocket = createIcon('rocket_launch', 'Rocket');
export const RotateCcw = createIcon('restart_alt', 'RotateCcw');
export const ScanLine = createIcon('qr_code_scanner', 'ScanLine');
export const Search = createIcon('search', 'Search');
export const Send = createIcon('send', 'Send');
export const Settings = createIcon('settings', 'Settings');
export const Share2 = createIcon('share', 'Share2');
export const Shield = createIcon('shield', 'Shield');
export const Smartphone = createIcon('smartphone', 'Smartphone');
export const Sparkles = createIcon('auto_awesome', 'Sparkles');
export const Square = createIcon('check_box_outline_blank', 'Square');
export const Star = createIcon('star', 'Star');
export const Strikethrough = createIcon('format_strikethrough', 'Strikethrough');
export const Sun = createIcon('light_mode', 'Sun');
export const Table = createIcon('table', 'Table');
export const Tags = createIcon('sell', 'Tags');
export const Target = createIcon('target', 'Target');
export const Trash2 = createIcon('delete', 'Trash2');
export const TrendingDown = createIcon('trending_down', 'TrendingDown');
export const TrendingUp = createIcon('trending_up', 'TrendingUp');
export const Type = createIcon('text_fields', 'Type');
export const Undo2 = createIcon('undo', 'Undo2');
export const Unlink = createIcon('link_off', 'Unlink');
export const Unlock = createIcon('lock_open', 'Unlock');
export const UploadCloud = createIcon('cloud_upload', 'UploadCloud');
export const User = createIcon('person', 'User');
export const UserMinus = createIcon('person_remove', 'UserMinus');
export const UserPlus = createIcon('person_add', 'UserPlus');
export const Users = createIcon('group', 'Users');
export const Video = createIcon('videocam', 'Video');
export const WifiOff = createIcon('wifi_off', 'WifiOff');
export const Wrench = createIcon('build', 'Wrench');
export const X = createIcon('close', 'X');
export const Zap = createIcon('bolt', 'Zap');
