import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Download,
  Copy,
  Sparkles,
  RefreshCw,
  Trash2,
  ArrowUp,
  ArrowDown,
  Send,
  Loader2,
  Eye,
  Code,
} from 'lucide-react';
import { Button, Input, FormField } from './ui';
import { supabase } from '../lib/supabase';
import { buildWeeklyDigestHtml, type DigestCard } from '../lib/emailTemplate';

type EditableCard = DigestCard & { id: string };

interface FetchedCard extends Partial<DigestCard> {
  ok: boolean;
  url: string;
  error?: string;
}

const DRAFT_KEY = 'u24-email-digest-draft';
const textareaClass =
  'w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 text-base md:text-sm text-zinc-900 dark:text-white resize-y';

interface Draft {
  urlsText: string;
  campaignTag: string;
  subject: string;
  intro: string;
  cards: EditableCard[];
}

function loadDraft(): Draft {
  const empty: Draft = { urlsText: '', campaignTag: '', subject: '', intro: '', cards: [] };
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    return { ...empty, ...parsed, cards: Array.isArray(parsed.cards) ? parsed.cards : [] };
  } catch {
    return empty;
  }
}

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

export const EmailTemplateGenerator: React.FC = () => {
  const navigate = useNavigate();
  const initial = loadDraft();

  const [urlsText, setUrlsText] = useState(initial.urlsText);
  const [campaignTag, setCampaignTag] = useState(initial.campaignTag);
  const [subject, setSubject] = useState(initial.subject);
  const [intro, setIntro] = useState(initial.intro);
  const [cards, setCards] = useState<EditableCard[]>(initial.cards);

  const [optimizeImages, setOptimizeImages] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [pushing, setPushing] = useState(false);

  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [generatedHtml, setGeneratedHtml] = useState('');
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');

  // Persist a draft so the admin can reopen next week and tweak (mirrors the "duplicate template" habit).
  useEffect(() => {
    const draft: Draft = { urlsText, campaignTag, subject, intro, cards };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // ignore quota errors
    }
  }, [urlsText, campaignTag, subject, intro, cards]);

  const updateCard = (id: string, patch: Partial<EditableCard>) =>
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const removeCard = (id: string) => setCards((prev) => prev.filter((c) => c.id !== id));

  const moveCard = (id: string, dir: -1 | 1) =>
    setCards((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });

  const handleFetch = useCallback(async () => {
    const urls = urlsText
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      toast.error('Paste at least one article URL');
      return;
    }
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-article-meta', { body: { urls } });
      if (error) throw error;
      const fetched: FetchedCard[] = data?.cards || [];
      const ok = fetched.filter((c) => c.ok);
      const failed = fetched.filter((c) => !c.ok);
      const newCards: EditableCard[] = ok.map((c) => ({
        id: newId(),
        url: c.url,
        title: c.title || '',
        lead: c.lead || '',
        cover: c.cover || '',
        authorName: c.authorName || '',
        authorRole: c.authorRole || '',
        authorPhoto: c.authorPhoto || '',
        authorUrl: c.authorUrl || '',
        section: c.section || 'News',
      }));
      setCards((prev) => [...prev, ...newCards]);
      setUrlsText('');
      if (newCards.length) toast.success(`Added ${newCards.length} article${newCards.length > 1 ? 's' : ''}`);
      if (failed.length) toast.error(`${failed.length} URL(s) could not be read`);
    } catch {
      toast.error('Failed to fetch articles');
    } finally {
      setFetching(false);
    }
  }, [urlsText]);

  const handleAiDraft = useCallback(async () => {
    if (cards.length === 0) {
      toast.error('Fetch some articles first');
      return;
    }
    setDrafting(true);
    try {
      const articles = cards.map((c) => ({ title: c.title, lead: c.lead, section: c.section }));
      const { data, error } = await supabase.functions.invoke('generate-digest-copy', { body: { articles } });
      if (error) throw error;
      if (data?.intro) setIntro(data.intro);
      if (Array.isArray(data?.subjects) && data.subjects.length) {
        setSubjectOptions(data.subjects);
        if (!subject) setSubject(data.subjects[0]);
      }
      toast.success('Draft generated');
    } catch {
      toast.error('Failed to generate draft');
    } finally {
      setDrafting(false);
    }
  }, [cards, subject]);

  const handleGenerate = useCallback(async () => {
    if (cards.length === 0) {
      toast.error('Add at least one article');
      return;
    }
    if (!campaignTag.trim()) {
      toast.error('Set a campaign tag (e.g. weekly_20)');
      return;
    }
    setGenerating(true);
    try {
      let finalCards: EditableCard[] = cards;
      if (optimizeImages) {
        const images = cards.flatMap((c, i) => {
          const arr: { url: string; kind: string; key: string }[] = [];
          if (c.cover) arr.push({ url: c.cover, kind: 'cover', key: `c${i}` });
          if (c.authorPhoto) arr.push({ url: c.authorPhoto, kind: 'author', key: `a${i}` });
          return arr;
        });
        const { data, error } = await supabase.functions.invoke('optimize-images', {
          body: { images, campaignTag: campaignTag.trim() },
        });
        if (error) throw error;
        const results: Record<string, string> = data?.results || {};
        finalCards = cards.map((c, i) => ({
          ...c,
          cover: results[`c${i}`] || c.cover,
          authorPhoto: results[`a${i}`] || c.authorPhoto,
        }));
        setCards(finalCards);
        const errs: Record<string, string> = data?.errors || {};
        const errCount = Object.keys(errs).length;
        if (errCount) {
          const firstMsg = errs[Object.keys(errs)[0]];
          toast.warning(`${errCount} image(s) kept their original URL${firstMsg ? `: ${firstMsg}` : ''}`);
        }
      }
      const html = buildWeeklyDigestHtml({ intro, campaignTag: campaignTag.trim(), cards: finalCards });
      setGeneratedHtml(html);
      setActiveTab('preview');
      toast.success('Email generated');
    } catch {
      toast.error('Failed to generate email');
    } finally {
      setGenerating(false);
    }
  }, [cards, campaignTag, intro, optimizeImages]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedHtml);
      toast.success('HTML copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([generatedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weekly-digest-${campaignTag.trim() || 'draft'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePushToSendPulse = useCallback(async () => {
    if (!generatedHtml) return;
    setPushing(true);
    try {
      const name = `Weekly Digest ${campaignTag.trim() || ''}`.trim();
      const { data, error } = await supabase.functions.invoke('sendpulse-create-template', {
        body: { html: generatedHtml, name },
      });
      if (error || data?.error) throw error || new Error(data.error);
      toast.success(`Template created in SendPulse${data?.templateId ? ` (#${data.templateId})` : ''}`);
    } catch {
      toast.error('Failed to create SendPulse template');
    } finally {
      setPushing(false);
    }
  }, [generatedHtml, campaignTag]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-4 md:px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/tools')}
          className="p-1.5 -ml-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="Back to Tools"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold">Email Template Generator</h1>
        <span className="text-xs text-zinc-400 hidden sm:inline">Weekly Digest</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-6">
          {/* Step 1: meta + URLs */}
          <section className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Campaign tag" required>
                <Input value={campaignTag} onChange={(e) => setCampaignTag(e.target.value)} placeholder="weekly_20" />
              </FormField>
              <FormField label="Subject line">
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="This week at UNITED24 Media…"
                />
              </FormField>
            </div>
            {subjectOptions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {subjectOptions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setSubject(s)}
                    className="text-xs px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-500"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <FormField label="Article URLs (one per line)">
              <textarea
                value={urlsText}
                onChange={(e) => setUrlsText(e.target.value)}
                rows={4}
                className={textareaClass}
                placeholder={'https://united24media.com/...\nhttps://united24media.com/...'}
              />
            </FormField>
            <Button onClick={handleFetch} disabled={fetching} size="sm">
              {fetching ? (
                <Loader2 size={14} className="animate-spin mr-1.5" />
              ) : (
                <RefreshCw size={14} className="mr-1.5" />
              )}
              Fetch &amp; build cards
            </Button>
          </section>

          {/* Step 2: intro */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Intro</span>
              <Button variant="ghost" size="sm" onClick={handleAiDraft} disabled={drafting}>
                {drafting ? (
                  <Loader2 size={14} className="animate-spin mr-1.5" />
                ) : (
                  <Sparkles size={14} className="mr-1.5" />
                )}
                AI draft
              </Button>
            </div>
            <textarea
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              rows={4}
              className={textareaClass}
              placeholder="Russia is now launching up to 50,000 Molniya drones a month…"
            />
          </section>

          {/* Step 3: cards */}
          {cards.length > 0 && (
            <section className="space-y-3">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                Article cards ({cards.length})
              </span>
              {cards.map((card, idx) => (
                <div
                  key={card.id}
                  className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 space-y-3 bg-white dark:bg-zinc-900"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-400 w-5">{idx + 1}</span>
                    {card.cover ? (
                      <img
                        src={card.cover}
                        alt=""
                        className="w-16 h-9 object-cover rounded border border-zinc-200 dark:border-zinc-700"
                      />
                    ) : (
                      <div className="w-16 h-9 rounded bg-zinc-100 dark:bg-zinc-800" />
                    )}
                    <span className="text-xs text-zinc-500 truncate flex-1">{card.section}</span>
                    <button
                      onClick={() => moveCard(card.id, -1)}
                      disabled={idx === 0}
                      className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30"
                      title="Move up"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      onClick={() => moveCard(card.id, 1)}
                      disabled={idx === cards.length - 1}
                      className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30"
                      title="Move down"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      onClick={() => removeCard(card.id)}
                      className="p-1 text-zinc-400 hover:text-red-500"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <FormField label="Title">
                    <Input value={card.title} onChange={(e) => updateCard(card.id, { title: e.target.value })} />
                  </FormField>
                  <FormField label="Lead">
                    <textarea
                      value={card.lead}
                      onChange={(e) => updateCard(card.id, { lead: e.target.value })}
                      rows={2}
                      className={textareaClass}
                    />
                  </FormField>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField label="Author name">
                      <Input
                        value={card.authorName}
                        onChange={(e) => updateCard(card.id, { authorName: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Author role">
                      <Input
                        value={card.authorRole}
                        onChange={(e) => updateCard(card.id, { authorRole: e.target.value })}
                      />
                    </FormField>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField label="Section">
                      <Input value={card.section} onChange={(e) => updateCard(card.id, { section: e.target.value })} />
                    </FormField>
                    <FormField label="Article URL">
                      <Input value={card.url} onChange={(e) => updateCard(card.id, { url: e.target.value })} />
                    </FormField>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField label="Cover image URL">
                      <Input value={card.cover} onChange={(e) => updateCard(card.id, { cover: e.target.value })} />
                    </FormField>
                    <FormField label="Author photo URL">
                      <Input
                        value={card.authorPhoto}
                        onChange={(e) => updateCard(card.id, { authorPhoto: e.target.value })}
                      />
                    </FormField>
                  </div>
                  <FormField label="Author profile URL">
                    <Input
                      value={card.authorUrl}
                      onChange={(e) => updateCard(card.id, { authorUrl: e.target.value })}
                    />
                  </FormField>
                </div>
              ))}
            </section>
          )}

          {/* Step 4: generate */}
          <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-5">
            <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={optimizeImages}
                onChange={(e) => setOptimizeImages(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600"
              />
              Optimize images &amp; host them on Supabase
            </label>
            <p className="text-xs text-zinc-400 -mt-1">
              SendPulse has no public image-upload API, so optimized covers/headshots are self-hosted on Supabase
              Storage. Uncheck to embed united24media.com CDN URLs directly.
            </p>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <Loader2 size={16} className="animate-spin mr-2" />
              ) : (
                <Sparkles size={16} className="mr-2" />
              )}
              Generate email
            </Button>
          </section>

          {/* Output */}
          {generatedHtml && (
            <section className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                  <button
                    onClick={() => setActiveTab('preview')}
                    className={`px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 ${activeTab === 'preview' ? 'bg-zinc-900 text-white dark:bg-white dark:text-black' : 'text-zinc-500'}`}
                  >
                    <Eye size={14} /> Preview
                  </button>
                  <button
                    onClick={() => setActiveTab('code')}
                    className={`px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 ${activeTab === 'code' ? 'bg-zinc-900 text-white dark:bg-white dark:text-black' : 'text-zinc-500'}`}
                  >
                    <Code size={14} /> HTML
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handleCopy}>
                    <Copy size={14} className="mr-1.5" /> Copy
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDownload}>
                    <Download size={14} className="mr-1.5" /> Download
                  </Button>
                  <Button size="sm" onClick={handlePushToSendPulse} disabled={pushing}>
                    {pushing ? (
                      <Loader2 size={14} className="animate-spin mr-1.5" />
                    ) : (
                      <Send size={14} className="mr-1.5" />
                    )}
                    Create in SendPulse
                  </Button>
                </div>
              </div>

              {activeTab === 'preview' ? (
                <iframe
                  title="Email preview"
                  srcDoc={generatedHtml}
                  sandbox=""
                  className="w-full h-[640px] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white"
                />
              ) : (
                <pre className="text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 overflow-auto max-h-[640px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-all">
                  {generatedHtml}
                </pre>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailTemplateGenerator;
