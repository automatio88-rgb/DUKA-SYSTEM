import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Store } from 'lucide-react';
import { emptyDataSet, hashPin, isValidPin, type Lang } from '@duka/shared';
import { useApp } from '@/app/store';
import { useT } from '@/lib/i18n';
import { seedDemo, writeAll, setMeta } from '@/lib/data';
import { API, api } from '@/lib/sync';
import { Hero3D } from '@/three/Hero3D';
import { EASE, Segmented } from '@/components/ui';

/** First-run wizard (§F13): 3 short steps or one tap into a fully-lit demo duka. */
export function Onboarding() {
  const t = useT(); const { lang, setLang, set, say } = useApp(s => ({ lang: s.lang, setLang: s.setLang, set: s.set, say: s.say }));
  const [step, setStep] = useState(0); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ shop: '', owner: '', phone: '', mpesa: 'till', pin: '', staffName: '', staffPin: '' });
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function demo() {
    setBusy(true);
    const d = await seedDemo(lang);
    if (API) { try { const r = await api<{ shopCode: string }>('/auth/setup', { method: 'POST', body: JSON.stringify({ shop: { id: d.shopId, name: d.db.shops[0].name, owner_name: d.db.shops[0].owner_name, phone: d.db.shops[0].phone, language: lang, mpesa_type: 'till' }, owner: { id: d.ownerId, pin: '1234' }, staff: { id: d.staffId, name: 'Brian Otieno', pin: '0000' }, locations: d.db.locations.map(l => ({ id: l.id, name: l.name, type: l.type })) }) }); await setMeta('shopCode', r.shopCode); } catch { /* offline: sync later */ } }
    set({ hasShop: true }); say(lang === 'sw' ? 'Duka la mfano liko tayari. PIN ya mwenye duka: 1234' : 'Demo duka ready. Owner PIN: 1234');
  }
  async function create() {
    if (!isValidPin(f.pin)) return say(t('auth.wrongPin'), 'warn');
    setBusy(true);
    const db = emptyDataSet(); const now = new Date().toISOString(); const id = () => crypto.randomUUID(); const base = () => ({ id: id(), created_at: now, updated_at: now, deleted_at: null });
    const shop = { ...base(), name: f.shop.trim(), owner_name: f.owner.trim(), phone: f.phone, currency: 'KES' as const, language: lang, mpesa_type: f.mpesa as any, settings_json: { reminderDay: 6, reminderMinBalance: 200, busyMode: false, theme: 'dark' as const } };
    db.shops.push(shop);
    const owner = { ...base(), shop_id: shop.id, name: shop.owner_name, phone: f.phone, role: 'owner' as const, pin_hash: await hashPin(shop.id, f.pin), active: true };
    db.users.push(owner);
    if (f.staffName && isValidPin(f.staffPin)) db.users.push({ ...base(), shop_id: shop.id, name: f.staffName, role: 'staff', pin_hash: await hashPin(shop.id, f.staffPin), active: true });
    db.locations.push({ ...base(), shop_id: shop.id, name: 'Duka', type: 'shop' }, { ...base(), shop_id: shop.id, name: 'Store', type: 'store' });
    db.categories.push(...['Unga & Cereals', 'Sugar & Salt', 'Oil & Fats', 'Dairy & Bread', 'Beverages', 'Soap', 'Personal Care', 'Household'].map((name, sort) => ({ ...base(), shop_id: shop.id, name, sort })));
    await writeAll(db);
    if (API) { try { const r = await api<{ shopCode: string }>('/auth/setup', { method: 'POST', body: JSON.stringify({ shop: { id: shop.id, name: shop.name, owner_name: shop.owner_name, phone: f.phone, language: lang, mpesa_type: f.mpesa }, owner: { id: owner.id, pin: f.pin }, locations: db.locations.map(l => ({ id: l.id, name: l.name, type: l.type })) }) }); await setMeta('shopCode', r.shopCode); } catch { /* retry later */ } }
    set({ hasShop: true });
  }

  const steps = [
    <div key="0" className="space-y-3">
      <label className="block"><span className="eyebrow">{t('onb.shopName')}</span><input className="field mt-2" value={f.shop} onChange={up('shop')} placeholder="Juma General Stores" autoComplete="organization" /></label>
      <label className="block"><span className="eyebrow">{t('onb.ownerName')}</span><input className="field mt-2" value={f.owner} onChange={up('owner')} placeholder="Juma Mwangi" autoComplete="name" /></label>
      <label className="block"><span className="eyebrow">{t('onb.phone')}</span><input className="field mt-2" value={f.phone} onChange={up('phone')} inputMode="tel" placeholder="07xx xxx xxx" /></label>
    </div>,
    <div key="1" className="space-y-3">
      <p className="eyebrow">{t('onb.mpesa')}</p>
      {(['till', 'pochi', 'paybill', 'personal'] as const).map(m => (
        <button key={m} onClick={() => setF({ ...f, mpesa: m })} className={`w-full text-left row rounded-ctl border ${f.mpesa === m ? 'border-brand bg-brand-soft' : 'border-line bg-s2'}`}><span className="flex-1 font-medium">{t(`onb.mpesa.${m}` as any)}</span><span className={`h-5 w-5 rounded-full border-2 ${f.mpesa === m ? 'border-brand bg-brand' : 'border-faint'}`} /></button>
      ))}
    </div>,
    <div key="2" className="space-y-3">
      <label className="block"><span className="eyebrow">{t('onb.pin')}</span><input className="field mt-2 num tracking-[0.6em] text-center text-2xl" value={f.pin} onChange={up('pin')} inputMode="numeric" maxLength={4} type="password" /></label>
      <p className="eyebrow pt-2">{t('onb.staff')}</p>
      <div className="grid grid-cols-[1fr_120px] gap-2"><input className="field" value={f.staffName} onChange={up('staffName')} placeholder={t('onb.staffName')} /><input className="field num text-center" value={f.staffPin} onChange={up('staffPin')} inputMode="numeric" maxLength={4} placeholder="PIN" type="password" /></div>
    </div>,
  ];
  const canNext = step === 0 ? f.shop.length > 1 && f.owner.length > 1 : step === 2 ? f.pin.length === 4 : true;

  return (
    <main className="min-h-[100dvh] flex flex-col px-5 pt-[max(env(safe-area-inset-top),20px)] pb-[calc(env(safe-area-inset-bottom)+20px)]">
      <div className="flex items-center justify-between"><span className="font-display font-bold text-lg flex items-center gap-2"><Store size={20} className="text-brand" />Duka System</span>
        <div className="w-[132px]"><Segmented value={lang} onChange={(l: Lang) => setLang(l)} options={[{ v: 'sw', label: 'SW' }, { v: 'en', label: 'EN' }]} /></div></div>
      <div className="-mx-5 mt-2"><Hero3D height={250} /></div>
      <h1 className="text-[28px] font-bold leading-[1.15] mt-1">{t('onb.welcome')}</h1>
      <p className="text-muted mt-2">{t('onb.sub')}</p>
      <div className="mt-6 flex-1">
        <AnimatePresence mode="wait"><motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22, ease: EASE }}>{steps[step]}</motion.div></AnimatePresence>
      </div>
      <div className="mt-6 space-y-3">
        <div className="flex gap-2">
          {step > 0 && <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>{t('onb.back')}</button>}
          <button className="btn btn-brand flex-1" disabled={!canNext || busy} onClick={() => (step < 2 ? setStep(step + 1) : create())}>{step < 2 ? t('onb.next') : t('onb.start')}</button>
        </div>
        <button className="w-full text-left surface p-4 tap flex items-center gap-3" onClick={demo} disabled={busy} data-testid="demo-mode">
          <span className="h-11 w-11 rounded-ctl bg-maize-soft text-maize grid place-items-center"><Sparkles size={22} /></span>
          <span className="flex-1"><span className="block font-semibold">{t('onb.demo')}</span><span className="block text-sm text-muted">{t('onb.demoSub')}</span></span>
        </button>
      </div>
    </main>
  );
}
