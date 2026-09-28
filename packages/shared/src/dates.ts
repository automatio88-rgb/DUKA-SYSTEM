export const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date | string) => { const x = typeof d === 'string' ? new Date(d) : d; return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
export const monthKey = (d: Date | string) => dayKey(d).slice(0, 7);
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const daysBetween = (a: Date | string, b: Date | string) => Math.floor((startOfDay(new Date(b)).getTime() - startOfDay(new Date(a)).getTime()) / 86_400_000);
