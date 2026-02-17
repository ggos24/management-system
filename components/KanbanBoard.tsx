import React, { useState } from 'react';
import { Task, TaskStatus, TeamType, Member } from '../types';
import { STATUS_COLORS, PRIORITY_COLORS } from '../constants';
import { Plus, MoreHorizontal, Calendar, User, Wand2 } from 'lucide-react';
import { generateContentIdeas } from '../services/geminiService';

interface KanbanBoardProps {
  tasks: Task[];
  teamFilter: TeamType | 'all';
  members: Member[];
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, teamFilter, members, onUpdateTaskStatus }) => {
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [loading, setLoading] = useState(false);

  const filteredTasks = teamFilter === 'all' ? tasks : tasks.filter(t => t.type === teamFilter);

  const columns: { id: TaskStatus; label: string }[] = [
    { id: 'idea', label: 'Ideas & Pitching' },
    { id: 'in-progress', label: 'In Progress' },
    { id: 'review', label: 'In Review' },
    { id: 'published', label: 'Published' },
  ];

  const handleGenerateIdeas = async () => {
      if(!aiTopic) return;
      setLoading(true);
      const ideas = await generateContentIdeas(aiTopic, teamFilter === 'all' ? 'general' : teamFilter);
      setAiResult(ideas || "No ideas generated.");
      setLoading(false);
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <h2 className="text-2xl font-bold capitalize">
            {teamFilter === 'all' ? 'All Productions' : `${teamFilter} Pipeline`}
        </h2>
        <div className="flex gap-2">
            <button 
                onClick={() => setAiModalOpen(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                <Wand2 size={16} />
                Ask AI for Ideas
            </button>
            <div className="flex -space-x-2">
                {members.slice(0, 4).map(m => (
                    <img key={m.id} src={m.avatar} alt={m.name} className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900" title={m.name} />
                ))}
            </div>
        </div>
      </div>

      <div className="flex gap-6 overflow-x-auto pb-4 h-full">
        {columns.map(col => (
          <div key={col.id} className="min-w-[320px] max-w-[320px] flex flex-col h-full bg-slate-100 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between px-2 mb-3">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm uppercase tracking-wide">{col.label}</span>
                    <span className="bg-slate-200 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full text-xs font-bold">
                        {filteredTasks.filter(t => t.status === col.id).length}
                    </span>
                </div>
                <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    <Plus size={18} />
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
              {filteredTasks
                .filter(t => t.status === col.id)
                .map(task => {
                    const assignee = members.find(m => task.assigneeIds.includes(m.id));
                    return (
                        <div key={task.id} className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all cursor-move group">
                            <div className="flex justify-between items-start mb-2">
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${STATUS_COLORS[task.status]}`}>
                                    {task.type}
                                </span>
                                <button className="text-slate-300 hover:text-slate-500">
                                    <MoreHorizontal size={16} />
                                </button>
                            </div>
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2 leading-tight">{task.title}</h3>
                            <div className="flex gap-2 mb-3 flex-wrap">
                                {task.placements.map(tag => (
                                    <span key={tag} className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-700">#{tag}</span>
                                ))}
                            </div>
                            <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100 dark:border-slate-700">
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <Calendar size={14} />
                                    <span>{new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                </div>
                                {assignee ? (
                                    <img src={assignee.avatar} alt={assignee.name} className="w-6 h-6 rounded-full" title={assignee.name} />
                                ) : (
                                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-400"><User size={12} /></div>
                                )}
                            </div>
                            
                            {/* Simple Move Controls for Demo */}
                            <div className="hidden group-hover:flex justify-between mt-3 pt-2 border-t border-dashed border-slate-200 dark:border-slate-700">
                                {columns.map((c) => (
                                    c.id !== task.status && (
                                        <button 
                                            key={c.id}
                                            onClick={() => onUpdateTaskStatus(task.id, c.id)}
                                            className="text-[10px] text-brand-600 hover:underline"
                                        >
                                            Move to {c.label.split(' ')[0]}
                                        </button>
                                    )
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
          </div>
        ))}
      </div>

      {/* AI Modal */}
      {aiModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                  <div className="p-6">
                      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                          <Wand2 className="text-purple-600" />
                          AI Brainstorming
                      </h3>
                      <p className="text-sm text-slate-500 mb-4">Enter a broad topic, and our AI will generate content ideas for the {teamFilter} team.</p>
                      
                      <input 
                        type="text" 
                        value={aiTopic}
                        onChange={(e) => setAiTopic(e.target.value)}
                        placeholder="e.g., Sustainable Tech, Summer Fashion, Local Elections"
                        className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-brand-500 outline-none mb-4"
                      />
                      
                      {aiResult && (
                          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg mb-4 text-sm whitespace-pre-line border border-slate-200 dark:border-slate-700 max-h-60 overflow-y-auto">
                              {aiResult}
                          </div>
                      )}

                      <div className="flex justify-end gap-3">
                          <button onClick={() => setAiModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
                          <button 
                            onClick={handleGenerateIdeas}
                            disabled={loading || !aiTopic}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                          >
                            {loading ? 'Thinking...' : 'Generate Ideas'}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default KanbanBoard;