import { useState } from 'react';
import { Download, FileSpreadsheet, Languages, Moon, Sun, BellRing, KeyRound, Receipt, Trash2, Sparkles } from 'lucide-react';
import { TABLES, hashPin, isValidPin } from '@duka/shared';
import { useApp } from '@/app/store';
import { useT } from '@/lib/i18n';
import { useData } from '@/lib/useData';
import { act, data, wipeDevice, seedDemo } from '@/lib/data';
import { Page, TopBar, Segmented, Sheet, Keypad } from '@/components/ui';

const download = (name: string, body: string, type: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
const csv = (rows: any[]) => { if (!rows.length) return ''; const cols = Object.keys(rows[0]); const esc = (v: any) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n'); };

/** Settings, i18n & backup (§F12). Owner only. */
export default function Settings() {
  const t = useT(); const { lang, setLang, theme, setTheme, say, set } = useApp(s => ({ lang: s.lang, setLang: s.setLang, theme: s.theme, setTheme: s.setTheme, say: s.say, set: s.set }));
  const v = useData(e => ({ shop: e.shop, users: e.db.users }));
  const [pinFor, setPinFor] = useState<string | null>(null); const [pin, setPin] = useState('');
  const s = v.shop.settings_json;
  const saveS = (patch: Partial<typeof s>) => act(e => e.put('shops', { id: e.shop.id, settings_json: { ...e.shop.settings_json, ...patch } } as any, 'settings.update'));
  const exportJson = () => download(`duka-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data: data() }, null, 2), 'application/json');
  const exportCsv = () => { for (const tb of ['products', 'customers', 'sales', 'sale_items', 'credit_ledger', 'stock_moves', 'purchases', 'expenses'] as const) { const body = csv((data() as any)[tb]); if (body) download(`duka-${tb}.csv`, body, 'text/csv'); } };
  return (
    <Page>
      <TopBar back title={t('set.title')} />
      <Section icon={Languages} title={t('set.language')}><Segmented value={lang} onChange={l => { setLang(l); act(e => e.put('shops', { id: e.shop.id, language: l } as any)); }} options={[{ v: 'sw', label: 'Kiswahili' }, { v: 'en', label: 'English' }]} /></Section>
      <Section icon={theme === 'dark' ? Moon : Sun} title={t('set.theme')}><Segmented value={theme} onChange={setTheme} options={[{ v: 'dark', label: t('set.dark') }, { v: 'light', label: t('set.light') }]} /></Section>
      <Section icon={BellRing} title={t('set.reminders')}>
        <p className="text-sm text-muted mb-2">{t('set.reminderDay')}</p>
        <div className="scroll-x">{[1, 2, 3, 4, 5, 6, 0].map(d => <button key={d} className="chip" aria-pressed={s.reminderDay === d} onClick={() => saveS({ reminderDay: d })}>{t(`dshort.${d}` as any)}</button>)}</div>
        <p className="text-sm text-muted mt-4 mb-2">{t('set.reminderMin')}</p>
        <div className="scroll-x">{[0, 200, 500, 1000].map(n => <button key={n} className="chip num" aria-pressed={s.reminderMinBalance === n} onClick={() => saveS({ reminderMinBalance: n })}>KSh {n}</button>)}</div>
      </Section>
      <Section icon={KeyRound} title={t('set.users')}>{v.users.map(u => <div key={u.id} className="flex items-center py-2"><span className="flex-1"><span className="block font-medium">{u.name}</span><span className="text-sm text-muted">{u.role === 'owner' ? t('auth.owner') : t('auth.staff')}</span></span><button className="chip" onClick={() => { setPin(''); setPinFor(u.id); }}>{t('set.changePin')}</button></div>)}</Section>
      <Section icon={Download} title={t('set.export')}><div className="grid grid-cols-2 gap-2"><button className="btn btn-ghost" onClick={exportJson}><Download size={18} />JSON</button><button className="btn btn-ghost" onClick={exportCsv}><FileSpreadsheet size={18} />CSV</button></div><p className="text-[12px] text-muted mt-2">{TABLES.length} {lang === 'sw' ? 'majedwali' : 'tables'}</p></Section>
      <Section icon={Receipt} title={t('set.etims')}><input className="field" placeholder="KRA PIN (P0XXXXXXXXX)" defaultValue={s.etimsPin ?? ''} onBlur={e => saveS({ etimsPin: e.target.value })} /><p className="text-[12px] text-muted mt-2">{lang === 'sw' ? 'Risiti zinatengenezwa kwa muundo wa eTIMS. Muunganisho wa KRA unakuja.' : 'Receipts are generated eTIMS-style. Direct KRA integration is coming.'}</p></Section>
      <div className="grid grid-cols-2 gap-2 mt-6"><button className="btn btn-ghost" onClick={async () => { await seedDemo(lang); location.reload(); }}><Sparkles size={18} />{t('set.demo')}</button><button className="btn btn-ghost text-clay" onClick={() => { if (confirm(lang === 'sw' ? 'Futa data yote kwenye simu hii?' : 'Erase all data on this phone?')) void wipeDevice(); }}><Trash2 size={18} />{t('set.reset')}</button></div>
      <Sheet open={!!pinFor} onClose={() => setPinFor(null)} title={t('set.changePin')}>
        <div className="flex gap-4 justify-center my-6">{[0, 1, 2, 3].map(i => <span key={i} className={`h-4 w-4 rounded-full ${pin.length > i ? 'bg-brand' : 'bg-s3'}`} />)}</div>
        <Keypad onKey={async k => { const next = k === '⌫' ? pin.slice(0, -1) : pin.length < 4 ? pin + k : pin; setPin(next); if (next.length === 4 && isValidPin(next)) { const h = await hashPin(v.shop.id, next); act(e => e.put('users', { id: pinFor!, pin_hash: h } as any, 'user.pin')); say(t('c.done')); setPinFor(null); set({}); } }} />
      </Sheet>
    </Page>
  );
}
function Section({ icon: I, title, children }: { icon: typeof Languages; title: string; children: React.ReactNode }) {
  return <section className="surface p-4 mb-3"><h2 className="font-semibold flex items-center gap-2 mb-3 text-[16px]"><I size={18} className="text-brand" />{title}</h2>{children}</section>;
}
