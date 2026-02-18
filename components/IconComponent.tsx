import React from 'react';
import {
  FileText,
  Globe,
  Video,
  Instagram,
  Briefcase,
  Cpu,
  Megaphone,
  Monitor,
  PenTool,
  Code,
  Smartphone,
  Zap,
  Database,
  Layout,
  Hash,
} from 'lucide-react';

export const ICONS = [
  'FileText',
  'Globe',
  'Video',
  'Instagram',
  'Briefcase',
  'Cpu',
  'Megaphone',
  'Monitor',
  'Smartphone',
  'Zap',
  'Database',
  'Layout',
  'PenTool',
  'Hash',
  'Code',
];

const iconMap: Record<string, React.FC<{ size?: number; className?: string }>> = {
  FileText,
  Globe,
  Video,
  Instagram,
  Briefcase,
  Cpu,
  Megaphone,
  Monitor,
  PenTool,
  Code,
  Smartphone,
  Zap,
  Database,
  Layout,
  Hash,
};

export const IconComponent: React.FC<{ name: string; size?: number; className?: string }> = ({
  name,
  size = 16,
  className,
}) => {
  const Icon = iconMap[name] || Hash;
  return <Icon size={size} className={className} />;
};
