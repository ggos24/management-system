import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Wrench, ChevronRight } from 'lucide-react';
import { Card } from './ui';

interface ToolDef {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
}

const TOOLS: ToolDef[] = [
  {
    id: 'email-template',
    title: 'Email Template Generator',
    description:
      'Paste 5–7 united24media.com article links and generate the weekly-digest HTML — covers, leads and authors filled in automatically.',
    icon: <Mail size={20} />,
    path: '/tools/email-template',
  },
];

export const ToolsView: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-4 md:px-6 py-3">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Wrench size={18} className="text-zinc-500" />
          Tools
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
          {TOOLS.map((tool) => (
            <Card
              key={tool.id}
              padding="lg"
              hoverable
              role="button"
              tabIndex={0}
              onClick={() => navigate(tool.path)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(tool.path);
                }
              }}
              className="cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                  {tool.icon}
                </div>
                <ChevronRight
                  size={18}
                  className="text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors"
                />
              </div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">{tool.title}</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{tool.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ToolsView;
