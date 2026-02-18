import { useEffect, useRef, useCallback } from 'react';
import { useUiStore } from '../stores/uiStore';
import { useDataStore } from '../stores/dataStore';
import { chatWithArchive } from '../services/geminiService';

export function useAiChat() {
  const aiChatEndRef = useRef<HTMLDivElement>(null);
  const {
    isAiChatOpen,
    aiChatMessages,
    aiChatInput,
    aiChatLoading,
    setIsAiChatOpen,
    addAiChatMessage,
    setAiChatInput,
    setAiChatLoading,
  } = useUiStore();

  const tasks = useDataStore((s) => s.tasks);

  useEffect(() => {
    if (aiChatEndRef.current) {
      aiChatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiChatMessages]);

  const handleAiChatSubmit = useCallback(async () => {
    if (!aiChatInput.trim()) return;
    const msg = aiChatInput;
    addAiChatMessage({ role: 'user', text: msg });
    setAiChatInput('');
    setAiChatLoading(true);

    const response = await chatWithArchive(msg, tasks);
    addAiChatMessage({ role: 'ai', text: response || 'I could not process that request.' });
    setAiChatLoading(false);
  }, [aiChatInput, tasks, addAiChatMessage, setAiChatInput, setAiChatLoading]);

  return {
    isAiChatOpen,
    aiChatMessages,
    aiChatInput,
    aiChatLoading,
    aiChatEndRef,
    setIsAiChatOpen,
    setAiChatInput,
    handleAiChatSubmit,
  };
}
