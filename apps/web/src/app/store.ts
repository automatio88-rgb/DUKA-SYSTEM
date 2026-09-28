import { create } from 'zustand';
import type { Lang, Role } from '@duka/shared';

export type Tab = 'home' | 'sell' | 'kitabu' | 'stock' | 'more';
export type ScreenName = 'payments' | 'cash' | 'purchases' | 'reports' | 'brain' | 'stocktake' | 'settings' | 'customer' | 'product' | 'alerts';
export interface Screen { name: ScreenName; params?: any }
export type SyncState = 'synced' | 'syncing' | 'offline' | 'pending' | 'local';
export interface Session { userId: string; name: string; role: Role }

interface AppState {
  booted: boolean; hasShop: boolean; session: Session | null;
  lang: Lang; theme: 'dark' | 'light'; tab: Tab; stack: Screen[];
  version: number; sync: SyncState; pending: number; toast: { id: number; text: string; tone?: 'ok' | 'warn' } | null;
  set: (p: Partial<AppState>) => void; bump: () => void; go: (t: Tab) => void; push: (s: Screen) => void; pop: () => void;
  setSync: (s: SyncState) => void; setPending: (n: number) => void; say: (text: string, tone?: 'ok' | 'warn') => void;
  setLang: (l: Lang) => void; setTheme: (t: 'dark' | 'light') => void;
}
const saved = (k: string, d: string) => (typeof localStorage !== 'undefined' && localStorage.getItem(k)) || d;

export const useApp = create<AppState>((set, get) => ({
  booted: false, hasShop: false, session: null,
  lang: saved('duka.lang', 'sw') as Lang, theme: saved('duka.theme', 'dark') as 'dark' | 'light',
  tab: 'home', stack: [], version: 0, sync: 'local', pending: 0, toast: null,
  set: p => set(p), bump: () => set({ version: get().version + 1 }),
  go: tab => set({ tab, stack: [] }),
  push: s => { history.pushState({ depth: get().stack.length + 1 }, ''); set({ stack: [...get().stack, s] }); },
  pop: () => set({ stack: get().stack.slice(0, -1) }),
  setSync: sync => set({ sync }), setPending: pending => set({ pending }),
  say: (text, tone = 'ok') => { const id = Date.now(); set({ toast: { id, text, tone } }); setTimeout(() => get().toast?.id === id && set({ toast: null }), 2600); },
  setLang: lang => { localStorage.setItem('duka.lang', lang); set({ lang }); },
  setTheme: theme => { localStorage.setItem('duka.theme', theme); document.documentElement.dataset.theme = theme; document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#121417' : '#faf6ef'); set({ theme }); },
}));

/** Android hardware back pops the screen stack instead of leaving the app. */
if (typeof window !== 'undefined') window.addEventListener('popstate', () => { const s = useApp.getState(); if (s.stack.length) s.pop(); });
