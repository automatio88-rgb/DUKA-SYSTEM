import { useEffect, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { verifyPin, type User } from '@duka/shared';
import { useApp } from '@/app/store';
import { useT } from '@/lib/i18n';
import { data, startSession } from '@/lib/data';
import { remoteLogin } from '@/lib/sync';
import { Avatar, Keypad } from '@/components/ui';
import { Hero3D } from '@/three/Hero3D';

/** PIN lock (§F1). Owner and staff share one phone; verification is offline against local hashes. */
export function Lock() {
  const t = useT(); const set = useApp(s => s.set);
  const users = data().users.filter(u => u.active && !u.deleted_at);
  const [who, setWho] = useState<User | null>(users.length === 1 ? users[0] : null);
  const [pin, setPin] = useState(''); const [err, setErr] = useState(false);
  const shake = useAnimationControls(); const shop = data().shops[0];

  useEffect(() => {
    if (pin.length !== 4 || !who) return;
    verifyPin(shop.id, pin, who.pin_hash).then(ok => {
      if (!ok) { setErr(true); navigator.vibrate?.([30, 40, 30]); void shake.start({ x: [0, -12, 12, -8, 8, 0], transition: { duration: 0.35 } }); setTimeout(() => setPin(''), 250); return; }
      startSession(who); void remoteLogin(who.id, pin);
      set({ session: { userId: who.id, name: who.name, role: who.role }, tab: who.role === 'staff' ? 'sell' : 'home' });
    });
  }, [pin, who, shop.id, set, shake]);

  return (
    <main className="min-h-[100dvh] flex flex-col px-5 pt-[max(env(safe-area-inset-top),16px)] pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <div className="-mx-5"><Hero3D height={who ? 170 : 240} /></div>
      <p className="eyebrow">{shop.name}</p>
      <h1 className="text-[26px] font-bold mt-1">{who ? who.name.split(' ')[0] : t('auth.pickUser')}</h1>
      {!who ? (
        <div className="mt-6 grid grid-cols-2 gap-3">
          {users.map(u => (
            <button key={u.id} onClick={() => setWho(u)} className="surface p-4 tap text-left" data-testid={`user-${u.role}`}>
              <Avatar name={u.name} size={52} round /><span className="block mt-3 font-semibold">{u.name}</span><span className="block text-sm text-muted">{u.role === 'owner' ? t('auth.owner') : t('auth.staff')}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <p className={`mt-1 ${err ? 'text-clay' : 'text-muted'}`}>{err ? t('auth.wrongPin') : t('auth.enterPin')}</p>
          <motion.div animate={shake} className="flex gap-4 justify-center my-8" aria-label="PIN">
            {[0, 1, 2, 3].map(i => <motion.span key={i} animate={{ scale: pin.length > i ? 1.15 : 1 }} className={`h-4 w-4 rounded-full ${pin.length > i ? 'bg-brand' : 'bg-s3'}`} />)}
          </motion.div>
          <div className="mt-auto">
            <Keypad extra="↺" onKey={k => { setErr(false); if (k === '⌫') setPin(pin.slice(0, -1)); else if (k === '↺') { setWho(null); setPin(''); } else if (pin.length < 4) setPin(pin + k); }} />
          </div>
        </>
      )}
    </main>
  );
}
