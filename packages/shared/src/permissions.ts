import type { Role } from './types';
export type Action = 'sell' | 'void' | 'credit' | 'payment' | 'transfer' | 'adjust' | 'count' | 'demand' | 'price' | 'product' | 'purchase' | 'reports' | 'profit' | 'settings' | 'delete' | 'variance' | 'cash' | 'export' | 'agent';
const STAFF: Action[] = ['sell', 'credit', 'payment', 'transfer', 'count', 'demand', 'cash', 'agent'];
export const can = (role: Role, a: Action) => role === 'owner' || STAFF.includes(a);
export class PermissionError extends Error { constructor(public action: Action) { super(`forbidden:${action}`); } }
export function assertCan(role: Role, a: Action) { if (!can(role, a)) throw new PermissionError(a); }
