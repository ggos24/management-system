import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Mail, Wrench, ChevronRight, IdCard, CreditCard } from 'lucide-react';
import { Badge, Card } from './ui';
import { useDataStore } from '../stores/dataStore';
import { useNow } from '../hooks/useNow';
import { deriveAccreditationState, deriveSubscriptionState } from '../lib/renewals';

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
  {
    id: 'accreditations',
    title: 'Accreditations',
    description:
      'Who holds which press, military or parliament accreditation, and when each one runs out — with a daily heads-up before it does.',
    icon: <IdCard size={20} />,
    path: '/tools/accreditations',
  },
  {
    id: 'subscriptions',
    title: 'Subscriptions',
    description:
      'Every paid service in one place: cost, billing cycle, next payment and who owns it. Mark a payment and the date rolls forward.',
    icon: <CreditCard size={20} />,
    path: '/tools/subscriptions',
  },
];

interface Attention {
  count: number;
  label: string;
  color: 'amber' | 'red';
}

export const ToolsView: React.FC = () => {
  const navigate = useNavigate();
  const { accreditations, subscriptions } = useDataStore(
    useShallow((s) => ({ accreditations: s.accreditations, subscriptions: s.subscriptions })),
  );
  const now = useNow();

  // What needs attention, on the card, so nobody has to open a tool to find out.
  const attention = useMemo<Record<string, Attention | undefined>>(() => {
    const accreditationStates = accreditations.map((item) => deriveAccreditationState(item, now));
    const subscriptionStates = subscriptions.map((item) => deriveSubscriptionState(item, now));
    const count = (states: string[], state: string) => states.filter((entry) => entry === state).length;
    const expired = count(accreditationStates, 'expired');
    const expiring = count(accreditationStates, 'expiring');
    const overdue = count(subscriptionStates, 'overdue');
    const dueSoon = count(subscriptionStates, 'due_soon');
    return {
      accreditations:
        expired > 0
          ? { count: expired, label: 'expired', color: 'red' }
          : expiring > 0
            ? { count: expiring, label: 'expiring', color: 'amber' }
            : undefined,
      subscriptions:
        overdue > 0
          ? { count: overdue, label: 'overdue', color: 'red' }
          : dueSoon > 0
            ? { count: dueSoon, label: 'due soon', color: 'amber' }
            : undefined,
    };
  }, [accreditations, subscriptions, now]);

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
          {TOOLS.map((tool) => {
            const flag = attention[tool.id];
            return (
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
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1 flex items-center gap-2">
                  {tool.title}
                  {flag && (
                    <Badge color={flag.color}>
                      {flag.count} {flag.label}
                    </Badge>
                  )}
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{tool.description}</p>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ToolsView;
