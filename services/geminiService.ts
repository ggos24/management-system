import { GoogleGenAI } from '@google/genai';
import { Task } from '../types';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const generateContentIdeas = async (topic: string, team: string) => {
  if (!apiKey) {
    return 'Please configure your API Key to use AI features.';
  }

  try {
    const prompt = `You are a creative director for a modern media company. 
    Generate 3 creative, high-engagement content ideas for the '${team}' team based on the topic: "${topic}".
    Format the output as a simple list. Keep it concise.`;

    const response = await ai!.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text;
  } catch (error) {
    console.error('Gemini API Error:', error);
    return 'Failed to generate ideas. Please try again later.';
  }
};

export const chatWithArchive = async (message: string, tasks: Task[]) => {
  if (!apiKey) return 'AI Chat unavailable (No Key)';

  try {
    const tasksContext = tasks
      .map(
        (t) =>
          `- ID: ${t.id}, Title: ${t.title}, Team: ${t.teamId}, Status: ${t.status}, Description: ${t.description}, Placements: ${t.placements.join(', ')}, Date: ${t.dueDate}`,
      )
      .join('\n');

    const prompt = `You are an intelligent archivist and assistant for a media company called MediaFlow OS.
        You have access to the following content library/archive (Tasks):
        ${tasksContext}

        User Request: "${message}"

        Your Goal: Answer the user's request comprehensively based on the provided archive. 
        - If they ask for a checklist, provide it based on similar past content or standard practices.
        - If they ask for summaries, summarize relevant tasks.
        - If they ask to find duplicates, point them out.
        - Always reference the Task ID and Title when discussing specific content.
        - Be professional, concise, and helpful.
        `;

    const response = await ai!.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (e) {
    console.error(e);
    return 'I encountered an error processing your request.';
  }
};
