import type { NetworkInfo, PlanStatus } from '../../modules/mmega-core';
import type { AppUsage } from '../store/data';
import { fmtBytes, fmtDuration, MB } from '../utils/format';

export type Insight = {
  id: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
  icon: 'alert' | 'leaf' | 'moon' | 'shield' | 'bolt' | 'spark' | 'film';
  title: string;
  text: string;
  action?: { label: string; kind: 'eco' | 'blockBg' | 'dataSaver' | 'plan' | 'apps'; pkg?: string };
};

export type PlanForecast = {
  left: number;
  pct: number;
  /** Bytes per ms over the recent window. */
  rate: number;
  /** ms until empty at the recent pace, or null when not meaningful. */
  eta: number | null;
  /** Bytes per day the user can still spend to reach the end of the cycle. */
  dailyBudget: number;
  daysLeft: number;
  willRunOut: boolean;
};

export function forecast(p: PlanStatus | null): PlanForecast | null {
  if (!p || p.volume <= 0) return null;
  const now = Date.now();
  const left = Math.max(0, p.volume - p.used);
  const pct = Math.min(1, p.used / p.volume);
  const rate = p.recentSpan > 60_000 ? p.recent / p.recentSpan : 0;
  // Pace of the whole cycle, more stable than the last 3 hours.
  const elapsed = Math.max(1, now - p.cycleStart);
  const cycleRate = p.measured / elapsed;
  const pace = Math.max(rate * 0.6 + cycleRate * 0.4, 0);
  const toEnd = Math.max(0, p.cycleEnd - now);
  const eta = pace > 0 ? left / pace : null;
  const daysLeft = toEnd / 86_400_000;
  return {
    left,
    pct,
    rate,
    eta: eta !== null && isFinite(eta) ? eta : null,
    dailyBudget: daysLeft > 0 ? left / Math.max(daysLeft, 1 / 24) : 0,
    daysLeft,
    willRunOut: eta !== null && eta < toEnd && left > 0,
  };
}

const VIDEO_APPS = ['com.google.android.youtube', 'com.zhiliaoapp.musically', 'com.ss.android.ugc.trill', 'com.facebook.katana', 'com.instagram.android', 'com.netflix.mediaclient', 'com.facebook.lite'];

export function buildInsights({
  plan,
  week,
  net,
  economy,
}: {
  plan: PlanStatus | null;
  week: AppUsage[] | undefined;
  net: NetworkInfo | null;
  economy: boolean;
}): Insight[] {
  const out: Insight[] = [];
  const f = forecast(plan);
  if (plan && f) {
    if (plan.used >= plan.volume) {
      out.push({ id: 'empty', tone: 'danger', icon: 'alert', title: 'Forfait épuisé', text: 'Vous avez utilisé tout votre forfait. Le mode Éco réserve les données à vos applications essentielles.', action: economy ? undefined : { label: 'Activer le mode Éco', kind: 'eco' } });
    } else if (f.willRunOut && f.eta !== null) {
      out.push({
        id: 'pace',
        tone: f.eta < 6 * 3_600_000 ? 'danger' : 'warning',
        icon: 'alert',
        title: `Épuisé dans ${fmtDuration(f.eta)} à ce rythme`,
        text: `Pour tenir jusqu’à la fin du forfait, limitez-vous à ${fmtBytes(f.dailyBudget)} par jour.`,
        action: economy ? undefined : { label: 'Activer le mode Éco', kind: 'eco' },
      });
    } else if (f.daysLeft > 0.5) {
      out.push({ id: 'ok', tone: 'success', icon: 'spark', title: 'Votre forfait tiendra', text: `Vous pouvez utiliser environ ${fmtBytes(f.dailyBudget)} par jour jusqu’à la fin.` });
    }
  }
  if (week?.length) {
    const bg = [...week]
      .filter((a) => a.pkg && a.mobileBg > 40 * MB && a.mobileBg > a.mobile * 0.4)
      .sort((a, b) => b.mobileBg - a.mobileBg)[0];
    if (bg) {
      out.push({
        id: `bg:${bg.pkg}`,
        tone: 'warning',
        icon: 'moon',
        title: `${bg.label} consomme en cachette`,
        text: `${fmtBytes(bg.mobileBg)} de données mobiles en arrière-plan cette semaine, sans que vous l’utilisiez.`,
        action: { label: 'Bloquer en arrière-plan', kind: 'blockBg', pkg: bg.pkg! },
      });
    }
    const totalMobile = week.reduce((s, a) => s + a.mobile, 0);
    const video = week.filter((a) => a.pkg && VIDEO_APPS.includes(a.pkg)).sort((a, b) => b.mobile - a.mobile)[0];
    if (video && totalMobile > 0 && video.mobile / totalMobile > 0.3) {
      out.push({
        id: 'video',
        tone: 'info',
        icon: 'film',
        title: `${video.label} : ${Math.round((video.mobile / totalMobile) * 100)} % de vos données`,
        text: 'Passez la qualité vidéo en 360p sur les données mobiles : c’est jusqu’à 4 fois moins de données.',
      });
    }
  }
  if (net && net.dataSaver === 'off') {
    out.push({
      id: 'datasaver',
      tone: 'info',
      icon: 'leaf',
      title: 'Économiseur de données Android désactivé',
      text: 'Activé, il empêche les applications d’utiliser les données mobiles en arrière-plan. Il se combine avec MMega.',
      action: { label: 'Ouvrir le réglage', kind: 'dataSaver' },
    });
  }
  return out.slice(0, 4);
}
