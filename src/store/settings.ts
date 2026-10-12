import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Rule = { m?: boolean; w?: boolean; b?: boolean };

export type Plan = {
  enabled: boolean;
  name: string;
  volumeBytes: number;
  startAt: number;
  periodDays: number;
  renew: boolean;
  /** Manual correction (bytes) applied to the cycle starting at `offsetCycle`. */
  offsetBytes: number;
  offsetCycle: number;
  dailyLimitBytes: number;
  alerts: number[];
  cutoff: boolean;
};

export type SpeedRecord = {
  id: string;
  at: number;
  ping: number;
  jitter: number;
  download: number;
  upload: number;
  loadedPing: number;
  dataUsed: number;
  network: string;
  isp?: string;
  ip?: string;
  city?: string;
  colo?: string;
  light: boolean;
  generation?: string;
  operator?: string;
};

export type ThemeMode = 'system' | 'light' | 'dark';

export const DEFAULT_WHITELIST = [
  'com.whatsapp',
  'com.whatsapp.w4b',
  'com.google.android.gms',
  'com.android.phone',
  'com.google.android.apps.messaging',
  'com.android.mms',
  'com.samsung.android.messaging',
];

type State = {
  theme: ThemeMode;
  onboarded: boolean;
  plan: Plan;
  monitor: { enabled: boolean; showToday: boolean; speedIcon: boolean };
  firewall: { enabled: boolean; rules: Record<string, Rule>; economy: boolean; whitelist: string[]; screenOff: boolean };
  history: SpeedRecord[];
  lightTest: boolean;
  showSystem: boolean;
  set: (p: Partial<Omit<State, 'set'>>) => void;
  updatePlan: (p: Partial<Plan>) => void;
  updateMonitor: (p: Partial<State['monitor']>) => void;
  updateFirewall: (p: Partial<State['firewall']>) => void;
  setRule: (pkg: string, key: keyof Rule, value: boolean) => void;
  toggleWhitelist: (pkg: string) => void;
  addRecord: (r: SpeedRecord) => void;
  removeRecord: (id: string) => void;
  clearHistory: () => void;
};

const DAY = 86_400_000;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const useSettings = create<State>()(
  persist(
    (set) => ({
      theme: 'system',
      onboarded: false,
      plan: {
        enabled: false,
        name: 'Mon forfait',
        volumeBytes: 1024 ** 3 * 5,
        startAt: startOfToday(),
        periodDays: 30,
        renew: true,
        offsetBytes: 0,
        offsetCycle: 0,
        dailyLimitBytes: 0,
        alerts: [50, 80, 95],
        cutoff: false,
      },
      monitor: { enabled: false, showToday: true, speedIcon: true },
      firewall: { enabled: false, rules: {}, economy: false, whitelist: DEFAULT_WHITELIST, screenOff: false },
      history: [],
      lightTest: false,
      showSystem: false,
      set: (p) => set(p),
      updatePlan: (p) => set((s) => ({ plan: { ...s.plan, ...p } })),
      updateMonitor: (p) => set((s) => ({ monitor: { ...s.monitor, ...p } })),
      updateFirewall: (p) => set((s) => ({ firewall: { ...s.firewall, ...p } })),
      setRule: (pkg, key, value) =>
        set((s) => {
          const rules = { ...s.firewall.rules };
          const next = { ...(rules[pkg] ?? {}), [key]: value };
          if (!next.m && !next.w && !next.b) delete rules[pkg];
          else rules[pkg] = next;
          return { firewall: { ...s.firewall, rules } };
        }),
      toggleWhitelist: (pkg) =>
        set((s) => {
          const has = s.firewall.whitelist.includes(pkg);
          return {
            firewall: { ...s.firewall, whitelist: has ? s.firewall.whitelist.filter((p) => p !== pkg) : [...s.firewall.whitelist, pkg] },
          };
        }),
      addRecord: (r) => set((s) => ({ history: [r, ...s.history].slice(0, 100) })),
      removeRecord: (id) => set((s) => ({ history: s.history.filter((h) => h.id !== id) })),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'mmega-settings',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ set: _s, updatePlan: _p, updateMonitor: _m, updateFirewall: _f, setRule: _r, toggleWhitelist: _t, addRecord: _a, removeRecord: _d, clearHistory: _c, ...rest }) => rest,
    }
  )
);

/** Current cycle of the plan (mirrors the native computation). */
export function planCycle(plan: Plan, now = Date.now()): { start: number; end: number; expired: boolean } | null {
  if (!plan.enabled || plan.volumeBytes <= 0 || plan.startAt <= 0) return null;
  const period = Math.max(1, plan.periodDays) * DAY;
  if (now < plan.startAt) return { start: plan.startAt, end: plan.startAt + period, expired: false };
  if (!plan.renew) return { start: plan.startAt, end: plan.startAt + period, expired: now >= plan.startAt + period };
  const n = Math.floor((now - plan.startAt) / period);
  const start = plan.startAt + n * period;
  return { start, end: start + period, expired: false };
}

/** JSON pushed to the native services. */
export function nativeConfig(s: Pick<State, 'plan' | 'monitor' | 'firewall'>) {
  return JSON.stringify({ plan: s.plan, monitor: s.monitor, firewall: s.firewall });
}
