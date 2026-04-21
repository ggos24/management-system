import React, { useState } from 'react';
import { Trash2, RotateCcw, Search } from 'lucide-react';
import { Button, Input } from './ui';
import { Modal } from './Modal';
import { Avatar } from './Avatar';
import { useDataStore } from '../stores/dataStore';
import { useUiStore } from '../stores/uiStore';
import { Task } from '../types';
import { getStatusColor } from '../constants';
import { formatDateEU } from '../lib/utils';

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'yesterday';
  if (diffD < 30) return `${diffD} days ago`;
  return formatDateEU(d);
}

function daysUntilPurge(deletedAt: string): number {
  const deletedDate = new Date(deletedAt);
  const purgeDate = new Date(deletedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const now = new Date();
  return Math.max(0, Math.ceil((purgeDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

export const Bin: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isEmptyBinModalOpen, setIsEmptyBinModalOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { deletedTasks, members, teams, restoreTask, permanentlyDeleteTask, emptyBin } = useDataStore();
  const { setIsTaskModalOpen, setTaskModalData } = useUiStore();

  const filteredTasks = searchQuery
    ? deletedTasks.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : deletedTasks;

  const getMemberName = (id: string | null | undefined) => {
    if (!id) return 'Unknown';
    return members.find((m) => m.id === id)?.name || 'Unknown';
  };

  const getMemberAvatar = (id: string | null | undefined) => {
    if (!id) return '';
    return members.find((m) => m.id === id)?.avatar || '';
  };

  const getTeamName = (teamId: string) => {
    return teams.find((t) => t.id === teamId)?.name || teamId;
  };

  const handleTaskClick = (task: Task) => {
    setTaskModalData(task);
    setIsTaskModalOpen(true);
  };

  const handleEmptyBin = () => {
    emptyBin();
    setIsEmptyBinModalOpen(false);
  };

  const handlePermanentDelete = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    setPendingDeleteId(taskId);
  };

  const confirmPermanentDelete = () => {
    if (pendingDeleteId) {
      permanentlyDeleteTask(pendingDeleteId);
      setPendingDeleteId(null);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 md:px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Trash2 size={20} />
            Bin
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Items are permanently deleted after 30 days</p>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <div className="relative flex-1 md:flex-initial">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input
              placeholder="Search deleted tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-full md:w-56 text-xs"
            />
          </div>
          {deletedTasks.length > 0 && (
            <button
              onClick={() => setIsEmptyBinModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
            >
              <Trash2 size={12} />
              <span className="hidden sm:inline">Empty Bin</span>
              <span className="sm:hidden">Empty</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
              <Trash2 size={28} className="text-zinc-400" />
            </div>
            <h3 className="text-sm font-medium text-zinc-900 dark:text-white mb-1">Bin is empty</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs">
              Deleted tasks will appear here for 30 days before being permanently removed
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="w-full hidden md:table">
              <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900/80 backdrop-blur-sm z-10">
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-6 py-2.5">
                    Title
                  </th>
                  <th className="text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-3 py-2.5">
                    Team
                  </th>
                  <th className="text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-3 py-2.5">
                    Status
                  </th>
                  <th className="text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-3 py-2.5">
                    Priority
                  </th>
                  <th className="text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-3 py-2.5">
                    Deleted By
                  </th>
                  <th className="text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-3 py-2.5">
                    Deleted
                  </th>
                  <th className="text-right text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-6 py-2.5">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => (
                  <tr
                    key={task.id}
                    onClick={() => handleTaskClick(task)}
                    className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-3">
                      <span className="text-sm font-medium text-zinc-900 dark:text-white truncate block max-w-xs">
                        {task.title}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">{getTeamName(task.teamId)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium border ${getStatusColor(task.status)}`}
                      >
                        {task.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs capitalize text-zinc-600 dark:text-zinc-400">{task.priority}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <Avatar src={getMemberAvatar(task.deletedBy)} alt={getMemberName(task.deletedBy)} size="sm" />
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">
                          {getMemberName(task.deletedBy)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {task.deletedAt ? formatRelativeTime(task.deletedAt) : ''}
                        </span>
                        {task.deletedAt && (
                          <span className="block text-[10px] text-zinc-400 dark:text-zinc-500">
                            {daysUntilPurge(task.deletedAt)}d until purge
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            restoreTask(task.id);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition-colors"
                          title="Restore"
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button
                          onClick={(e) => handlePermanentDelete(e, task.id)}
                          className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title="Delete Forever"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => handleTaskClick(task)}
                  className="px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{task.title}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                        {getTeamName(task.teamId)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => restoreTask(task.id)}
                        className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-full"
                        aria-label="Restore"
                      >
                        <RotateCcw size={16} />
                      </button>
                      <button
                        onClick={(e) => handlePermanentDelete(e, task.id)}
                        className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full"
                        aria-label="Delete Forever"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-[11px] md:text-[10px] font-medium border ${getStatusColor(task.status)}`}
                    >
                      {task.status}
                    </span>
                    <span className="text-[11px] capitalize text-zinc-600 dark:text-zinc-400">{task.priority}</span>
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      {task.deletedAt ? formatRelativeTime(task.deletedAt) : ''}
                      {task.deletedAt && (
                        <span className="text-zinc-400"> · {daysUntilPurge(task.deletedAt)}d until purge</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <Avatar src={getMemberAvatar(task.deletedBy)} alt={getMemberName(task.deletedBy)} size="sm" />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {getMemberName(task.deletedBy)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Empty Bin Confirmation Modal */}
      <Modal
        isOpen={isEmptyBinModalOpen}
        onClose={() => setIsEmptyBinModalOpen(false)}
        title="Empty Bin"
        size="sm"
        actions={
          <>
            <Button variant="ghost" onClick={() => setIsEmptyBinModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleEmptyBin}>
              Empty Bin
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Permanently delete all {deletedTasks.length} item{deletedTasks.length !== 1 ? 's' : ''} in the bin? This
          action cannot be undone.
        </p>
      </Modal>

      {/* Permanent Delete Confirmation Modal */}
      <Modal
        isOpen={!!pendingDeleteId}
        onClose={() => setPendingDeleteId(null)}
        title="Delete Forever"
        size="sm"
        actions={
          <>
            <Button variant="ghost" onClick={() => setPendingDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmPermanentDelete}>
              Delete Forever
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Permanently delete this task? This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
};

export default Bin;
