import React from 'react';
import { X, Wand2, ArrowRight } from 'lucide-react';
import { useAiChat } from '../hooks/useAiChat';

export const AiChatWidget: React.FC = () => {
  const {
    isAiChatOpen,
    aiChatMessages,
    aiChatInput,
    aiChatLoading,
    aiChatEndRef,
    setIsAiChatOpen,
    setAiChatInput,
    handleAiChatSubmit,
  } = useAiChat();

  return (
    <div
      className={`fixed bottom-6 right-6 z-40 flex flex-col items-end transition-all duration-300 ${isAiChatOpen ? 'w-[400px]' : 'w-0 overflow-hidden'}`}
    >
      {isAiChatOpen && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl mb-4 w-full h-[500px] flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-200">
          <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="font-bold text-sm">AI Assist</span>
            </div>
            <button onClick={() => setIsAiChatOpen(false)}>
              <X size={16} className="text-zinc-400 hover:text-black dark:hover:text-white" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white dark:bg-zinc-950">
            {aiChatMessages.length === 0 && (
              <div className="text-center text-zinc-400 text-sm mt-20">
                <Wand2 size={40} className="mx-auto mb-3 opacity-20" />
                <p>Ask me anything about your tasks, schedule, or content ideas.</p>
              </div>
            )}
            {aiChatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-none'}`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {aiChatLoading && (
              <div className="flex justify-start">
                <div className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded-2xl rounded-bl-none text-xs text-zinc-500 italic flex items-center gap-1">
                  <span>Thinking</span>
                  <span className="animate-bounce">.</span>
                  <span className="animate-bounce delay-75">.</span>
                  <span className="animate-bounce delay-150">.</span>
                </div>
              </div>
            )}
            <div ref={aiChatEndRef}></div>
          </div>
          <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div className="relative">
              <input
                value={aiChatInput}
                onChange={(e) => setAiChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAiChatSubmit()}
                placeholder="Type a message..."
                className="w-full pl-4 pr-10 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
              />
              <button
                onClick={handleAiChatSubmit}
                className="absolute right-1.5 top-1.5 p-1.5 bg-black dark:bg-white text-white dark:text-black rounded-full hover:opacity-80 transition-opacity"
              >
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
