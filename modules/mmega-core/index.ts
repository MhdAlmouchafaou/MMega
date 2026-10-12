import { requireOptionalNativeModule } from 'expo';

export type NativeApp = {
  pkg: string;
  label: string;
  uid: number;
  system: boolean;
  launchable: boolean;
  self: boolean;
};

export type UidUsage = {
  uid: number;
  mobileRx: number;
  mobileTx: number;
  wifiRx: number;
  wifiTx: number;
  mobileBg: number;
  wifiBg: number;
};

export type DeviceUsage = {
  mobile: number;
  wifi: number;
  mobileRx: number;
  mobileTx: number;
  wifiRx: number;
  wifiTx: number;
};

export type DayUsage = { start: number; mobile: number; wifi: number };

export type PlanStatus = {
  cycleStart: number;
  cycleEnd: number;
  expired: boolean;
  measured: number;
  used: number;
  volume: number;
  recent: number;
  recentSpan: number;
  today: number;
};

export type Traffic = { down: number; up: number; mobileDown: number; mobileUp: number; at: number };

export type FirewallStatus = {
  running: boolean;
  active: boolean;
  mode: 'off' | 'idle' | 'rules' | 'economy' | 'cutoff' | 'sleep';
  blocked: number;
  network: 'none' | 'mobile' | 'wifi' | 'other';
  screenOn?: boolean;
  foreground?: string | null;
  consent?: boolean;
  revoked?: boolean;
  cutoff?: boolean;
};

export type SpeedEvent = {
  phase: 'meta' | 'ping' | 'download' | 'upload' | 'done';
  progress: number;
  mbps?: number;
  ping?: number;
  bytes?: number;
  isp?: string;
  ip?: string;
  city?: string;
  country?: string;
  colo?: string;
};

export type SpeedResult = {
  cancelled?: boolean;
  ping: number;
  jitter: number;
  download: number;
  upload: number;
  loadedPing: number;
  dataUsed: number;
  ip?: string;
  isp?: string;
  city?: string;
  country?: string;
  colo?: string;
};

export type PingResult = {
  host: string;
  ip: string | null;
  dnsMs: number;
  sent: number;
  received: number;
  loss: number;
  min: number;
  avg: number;
  median: number;
  max: number;
  jitter: number;
  times: number[];
  error: string | null;
};

export type ResolveResult = { ok: boolean; ms: number; addresses: string[]; error?: string };

export type NetworkInfo = {
  type: 'none' | 'wifi' | 'mobile' | 'ethernet' | 'vpn' | 'other';
  connected: boolean;
  validated: boolean;
  metered: boolean;
  downKbps: number;
  upKbps: number;
  vpn: boolean;
  dataSaver: 'on' | 'off' | 'whitelisted';
  airplane: boolean;
  iface?: string;
  ipv4?: string[];
  ipv6?: string[];
  dns?: string[];
  privateDns?: boolean;
  privateDnsName?: string | null;
  mtu?: number;
  gateway?: string | null;
  operator: string;
  simOperator: string;
  roaming: boolean;
  countryIso: string;
  generation: string;
  tech: string;
  signalLevel?: number;
  signalDbm?: number;
  signalAsu?: number;
  simState: number;
  mobileDataOn: boolean;
  ssid?: string | null;
  rssi?: number;
  linkSpeed?: number;
  frequency?: number;
  wifiLevel?: number;
  txLink?: number;
  rxLink?: number;
  wifiStandard?: number;
};

export type SettingsKind =
  | 'usage'
  | 'dataSaver'
  | 'dataUsage'
  | 'mobile'
  | 'wifi'
  | 'vpn'
  | 'notifications'
  | 'battery'
  | 'app'
  | `appDetails:${string}`
  | `appData:${string}`;

type Sub = { remove(): void };

type MMegaCore = {
  setConfig(json: string): boolean;
  getConfig(): string;
  hasUsageAccess(): boolean;
  notificationsEnabled(): boolean;
  ignoringBatteryOptimizations(): boolean;
  openSettings(kind: SettingsKind): boolean;
  launchApp(pkg: string): boolean;
  listApps(): Promise<NativeApp[]>;
  appIcons(pkgs: string[]): Promise<Record<string, string | null>>;
  appUsage(start: number, end: number): Promise<UidUsage[]>;
  deviceUsage(start: number, end: number): Promise<DeviceUsage>;
  daily(days: number): Promise<DayUsage[]>;
  appDaily(uid: number, days: number): Promise<DayUsage[]>;
  hourlyToday(): Promise<number[]>;
  planStatus(): Promise<PlanStatus | null>;
  startLive(): void;
  stopLive(): void;
  monitorRunning(): boolean;
  vpnConsent(): Promise<boolean>;
  firewallStatus(): FirewallStatus;
  firewallApply(): boolean;
  speedTest(light: boolean): Promise<SpeedResult>;
  cancelSpeedTest(): void;
  tcpPing(host: string, port: number, count: number, timeout: number): Promise<PingResult>;
  resolve(host: string): Promise<ResolveResult>;
  networkInfo(): Promise<NetworkInfo>;
  addListener(event: 'onTraffic', cb: (e: Traffic) => void): Sub;
  addListener(event: 'onSpeedTest', cb: (e: SpeedEvent) => void): Sub;
  addListener(event: 'onFirewall', cb: (e: FirewallStatus) => void): Sub;
};

export const Native = requireOptionalNativeModule<MMegaCore>('MMegaCore');
