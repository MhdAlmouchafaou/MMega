import { create } from 'zustand';
import { Native, type DayUsage, type DeviceUsage, type FirewallStatus, type NativeApp, type NetworkInfo, type PlanStatus, type Traffic } from '../../modules/mmega-core';
import { startOfDay } from '../utils/format';
import { planCycle, useSettings } from './settings';

export type Period = 'today' | 'week' | 'month' | 'cycle';

export const PERIOD_LABELS: Record<Period, string> = {
  today: 'Aujourd’hui',
  week: '7 jours',
  month: '30 jours',
  cycle: 'Forfait',
};

export type AppUsage = {
  key: string;
  uid: number;
  pkg: string | null;
  label: string;
  system: boolean;
  mobile: number;
  wifi: number;
  mobileBg: number;
  wifiBg: number;
  mobileRx: number;
  mobileTx: number;
  wifiRx: number;
  wifiTx: number;
};

type PeriodData = { at: number; rows: AppUsage[]; start: number; end: number };

const SPECIAL_UIDS: Record<number, string> = {
  [-4]: 'Applications désinstallées',
  [-5]: 'Partage de connexion',
  0: 'Noyau Android',
  1000: 'Système Android',
  1013: 'Serveur multimédia',
  1021: 'GPS',
  1051: 'Résolution DNS',
};

export function periodRange(p: Period): { start: number; end: number } {
  const end = Date.now();
  if (p === 'today') return { start: startOfDay(), end };
  if (p === 'week') return { start: startOfDay(-6), end };
  if (p === 'cycle') {
    const c = planCycle(useSettings.getState().plan);
    if (c) return { start: c.start, end: Math.min(end, c.end) };
  }
  return { start: startOfDay(-29), end };
}

type DataState = {
  access: boolean;
  apps: NativeApp[];
  appsLoaded: boolean;
  byUid: Record<number, NativeApp[]>;
  byPkg: Record<string, NativeApp>;
  icons: Record<string, string | null>;
  periods: Partial<Record<Period, PeriodData>>;
  loadingPeriod: Partial<Record<Period, boolean>>;
  daily: DayUsage[];
  hourly: number[];
  today: DeviceUsage | null;
  plan: PlanStatus | null;
  firewall: FirewallStatus | null;
  net: NetworkInfo | null;
  refreshedAt: number;

  checkAccess: () => boolean;
  loadApps: (force?: boolean) => Promise<void>;
  loadIcons: (pkgs: string[]) => void;
  loadPeriod: (p: Period, force?: boolean) => Promise<void>;
  refreshOverview: () => Promise<void>;
  refreshFirewall: () => void;
  refreshNet: () => Promise<NetworkInfo | null>;
};

let iconQueue = new Set<string>();
let iconTimer: ReturnType<typeof setTimeout> | null = null;

export const useData = create<DataState>((set, get) => ({
  access: false,
  apps: [],
  appsLoaded: false,
  byUid: {},
  byPkg: {},
  icons: {},
  periods: {},
  loadingPeriod: {},
  daily: [],
  hourly: [],
  today: null,
  plan: null,
  firewall: null,
  net: null,
  refreshedAt: 0,

  checkAccess: () => {
    const access = !!Native?.hasUsageAccess();
    if (access !== get().access) set({ access });
    return access;
  },

  loadApps: async (force) => {
    if (!Native || (get().appsLoaded && !force)) return;
    try {
      const apps = await Native.listApps();
      apps.sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }));
      const byUid: Record<number, NativeApp[]> = {};
      const byPkg: Record<string, NativeApp> = {};
      for (const a of apps) {
        (byUid[a.uid] ??= []).push(a);
        byPkg[a.pkg] = a;
      }
      set({ apps, byUid, byPkg, appsLoaded: true });
    } catch {
      set({ appsLoaded: true });
    }
  },

  loadIcons: (pkgs) => {
    const known = get().icons;
    for (const p of pkgs) if (!(p in known)) iconQueue.add(p);
    if (!iconQueue.size || iconTimer || !Native) return;
    iconTimer = setTimeout(async () => {
      const batch = [...iconQueue];
      iconQueue = new Set();
      iconTimer = null;
      try {
        const res = await Native!.appIcons(batch);
        set((s) => ({ icons: { ...s.icons, ...res } }));
      } catch {
        set((s) => {
          const icons = { ...s.icons };
          for (const p of batch) icons[p] = null;
          return { icons };
        });
      }
    }, 30);
  },

  loadPeriod: async (p, force) => {
    if (!Native || !get().checkAccess()) return;
    const cached = get().periods[p];
    if (cached && !force && Date.now() - cached.at < 20_000) return;
    if (get().loadingPeriod[p]) return;
    set((s) => ({ loadingPeriod: { ...s.loadingPeriod, [p]: true } }));
    try {
      if (!get().appsLoaded) await get().loadApps();
      const { start, end } = periodRange(p);
      const raw = await Native.appUsage(start, end);
      const { byUid } = get();
      const rows: AppUsage[] = [];
      for (const u of raw) {
        const mobile = u.mobileRx + u.mobileTx;
        const wifi = u.wifiRx + u.wifiTx;
        if (mobile + wifi <= 0) continue;
        const owners = byUid[u.uid] ?? [];
        // Shared UIDs (system packages) are shown under their most recognisable member.
        const main = owners.find((o) => o.launchable) ?? owners[0];
        const label = main
          ? owners.length > 1 && !main.launchable
            ? `${main.label} (+${owners.length - 1})`
            : main.label
          : SPECIAL_UIDS[u.uid] ?? (u.uid < 10000 ? `Système (${u.uid})` : `Application ${u.uid}`);
        rows.push({
          key: main?.pkg ?? `uid:${u.uid}`,
          uid: u.uid,
          pkg: main?.pkg ?? null,
          label,
          system: main ? main.system : true,
          mobile,
          wifi,
          mobileBg: u.mobileBg,
          wifiBg: u.wifiBg,
          mobileRx: u.mobileRx,
          mobileTx: u.mobileTx,
          wifiRx: u.wifiRx,
          wifiTx: u.wifiTx,
        });
      }
      set((s) => ({ periods: { ...s.periods, [p]: { at: Date.now(), rows, start, end } } }));
    } catch {
      // keep previous data
    } finally {
      set((s) => ({ loadingPeriod: { ...s.loadingPeriod, [p]: false } }));
    }
  },

  refreshOverview: async () => {
    if (!Native) return;
    get().refreshFirewall();
    if (!get().checkAccess()) return;
    try {
      const [today, daily, hourly, plan] = await Promise.all([
        Native.deviceUsage(startOfDay(), Date.now()),
        Native.daily(30),
        Native.hourlyToday(),
        Native.planStatus(),
      ]);
      set({ today, daily, hourly, plan, refreshedAt: Date.now() });
    } catch {
      // ignore
    }
  },

  refreshNet: async () => {
    if (!Native) return null;
    try {
      const net = await Native.networkInfo();
      set({ net });
      return net;
    } catch {
      return null;
    }
  },

  refreshFirewall: () => {
    try {
      const firewall = Native?.firewallStatus() ?? null;
      set({ firewall });
    } catch {
      // ignore
    }
  },
}));

const HISTORY = 60;
const EMPTY = new Array(HISTORY).fill(0);

type LiveState = Traffic & { history: number[]; peak: number };

export const useLive = create<LiveState>(() => ({ down: 0, up: 0, mobileDown: 0, mobileUp: 0, at: 0, history: EMPTY, peak: 0 }));

let liveSub: { remove(): void } | null = null;
let liveRefs = 0;

/** Live speed from the native traffic counters; ref-counted so several screens can share it. */
export function startLive() {
  liveRefs++;
  if (liveSub || !Native) return;
  liveSub = Native.addListener('onTraffic', (e) => {
    useLive.setState((s) => {
      const history = [...s.history.slice(1), e.down + e.up];
      return { ...e, history, peak: Math.max(...history) };
    });
  });
  Native.startLive();
}

export function stopLive() {
  liveRefs = Math.max(0, liveRefs - 1);
  if (liveRefs > 0) return;
  liveSub?.remove();
  liveSub = null;
  Native?.stopLive();
}

/** Pushes the settings to the native services whenever they change. */
export function attachNativeSync() {
  let last = '';
  const push = () => {
    const s = useSettings.getState();
    const json = JSON.stringify({ plan: s.plan, monitor: s.monitor, firewall: s.firewall });
    if (json === last) return;
    last = json;
    try {
      Native?.setConfig(json);
    } catch {
      // ignore
    }
    setTimeout(() => {
      useData.getState().refreshFirewall();
    }, 400);
  };
  push();
  const unsub = useSettings.subscribe(push);
  const fw = Native?.addListener('onFirewall', (firewall) => {
    try {
      useData.setState({ firewall: { ...useData.getState().firewall, ...Native!.firewallStatus(), ...firewall } });
    } catch {
      useData.setState({ firewall });
    }
  });
  return () => {
    unsub();
    fw?.remove();
  };
}

/** The notification can toggle the economy mode: read it back when the app returns. */
export function pullNativeState() {
  try {
    const raw = Native?.getConfig();
    if (!raw) return;
    const cfg = JSON.parse(raw);
    const economy = !!cfg?.firewall?.economy;
    const s = useSettings.getState();
    if (economy !== s.firewall.economy) s.updateFirewall({ economy, enabled: economy ? true : s.firewall.enabled });
    const monitor = Native?.monitorRunning();
    if (s.monitor.enabled && monitor === false) {
      // The system stopped the service (e.g. battery saver): ask it to start again.
      Native?.setConfig(JSON.stringify({ plan: s.plan, monitor: s.monitor, firewall: useSettings.getState().firewall }));
    }
  } catch {
    // ignore
  }
}
