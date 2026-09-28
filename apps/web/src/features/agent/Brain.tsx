import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, Mic } from 'lucide-react';
import { runAgent, MockLLMProvider } from '@duka/shared';
import { useApp } from '@/app/store';
import { useT } from '@/lib/i18n';
import { useData } from '@/lib/useData';
import { actAsync, act } from '@/lib/data';
import { API, api } from '@/lib/sync';
import { Page, TopBar, EASE } from '@/components/ui';

const SUGGEST = { sw: ['Andika deni ya Baba Kevin mia nne hamsini', 'Nimehamisha katoni mbili za maziwa kutoka store', 'Nani ananidai zaidi ya elfu moja?', 'Ripoti ya leo', 'Weka bei ya sukari 65', 'Mteja ameuliza formula ya watoto', 'Ripoti ya wiki'], en: ['Add credit for Mama Njeri 300', 'daily report', 'who owes me more than 1000', 'How many sugar do we have', 'weekly report', 'draft order'] };

/** Duka Brain (§F10): in-app chat. Offline it runs the deterministic Swahili parser locally; online with LLM keys it goes via the API. */
export default function Brain() {
  const t = useT(); const lang = useApp(s => s.lang); const [text, setText] = useState(''); const [thinking, setThinking] = useState(false);
  const msgs = useData(e => e.db.agent_messages.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-60));
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length, thinking]);
  const send = async (q: string) => {
    if (!q.trim()) return; setText(''); setThinking(true);
    act(e => e.put('agent_messages', { channel: 'inapp', direction: 'in', body: q } as any));
    try {
      if (API && navigator.onLine && import.meta.env.VITE_REMOTE_BRAIN === '1') { const r = await api<{ reply: string; tool: string }>('/agent/message', { method: 'POST', body: JSON.stringify({ text: q }) }); act(e => e.put('agent_messages', { channel: 'inapp', direction: 'out', body: r.reply, intent: r.tool } as any)); }
      else await actAsync(async e => { const r = await runAgent(e, q, new MockLLMProvider()); e.put('agent_messages', { channel: 'inapp', direction: 'out', body: r.reply, intent: r.call.tool, tool_calls_json: r.call } as any); });
    } finally { setThinking(false); }
  };
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Page className="flex-1 !pb-4">
        <TopBar back title={t('ai.title')} sub={lang === 'sw' ? 'Mshirika wako wa biashara' : 'Your business partner'} />
        <div className="space-y-3" aria-live="polite">
          <AnimatePresence initial={false}>
            {msgs.map(m => (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25, ease: EASE }} className={`flex ${m.direction === 'in' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-4 py-3 rounded-[18px] text-[15px] leading-relaxed whitespace-pre-line ${m.direction === 'in' ? 'bg-brand text-brand-ink rounded-br-md' : 'bg-s1 border border-line rounded-bl-md'}`} data-testid={m.direction === 'out' ? 'brain-reply' : undefined}>
                  {m.direction === 'out' && m.intent && m.intent !== 'unknown' && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-maize mb-1"><Sparkles size={12} />{t('ai.did')} · {m.intent}</span>}
                  <span className="block">{m.body}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {thinking && <div className="flex gap-1 px-4 py-3">{[0, 1, 2].map(i => <motion.span key={i} className="h-2 w-2 rounded-full bg-muted" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: i * 0.15 }} />)}</div>}
          <div ref={end} />
        </div>
      </Page>
      <div className="sticky bottom-0 bg-bg/95 backdrop-blur border-t border-line px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+10px)]">
        <div className="scroll-x pb-2">{SUGGEST[lang].map(s => <button key={s} className="chip text-[13px]" onClick={() => send(s)}>{s}</button>)}</div>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void send(text); }}>
          <input value={text} onChange={e => setText(e.target.value)} className="field flex-1" placeholder={t('ai.placeholder')} data-testid="brain-input" />
          <button type="button" aria-label="Voice" className="h-[54px] w-[54px] rounded-ctl bg-s2 border border-line grid place-items-center" onClick={() => { const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; if (!SR) return; const r = new SR(); r.lang = lang === 'sw' ? 'sw-KE' : 'en-KE'; r.onresult = (ev: any) => send(ev.results[0][0].transcript); r.start(); }}><Mic size={20} /></button>
          <button className="h-[54px] w-[54px] rounded-ctl bg-brand text-brand-ink grid place-items-center" aria-label="Send"><Send size={20} /></button>
        </form>
      </div>
    </div>
  );
}
