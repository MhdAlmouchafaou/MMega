import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Native } from '../../../modules/mmega-core';
import { openUsageAccess, setAppRule, setEconomy, setFirewallEnabled, setMonitorEnabled } from '../../lib/actions';
import { buildInsights, forecast, type Insight } from '../../lib/insights';
import { useData, useLive } from '../../store/data';
import { useNav } from '../../store/nav';
import { planCycle, useSettings } from '../../store/settings';
import { useTheme } from '../../theme';
import { bytesParts, fmtBytes, fmtDuration, speedParts } from '../../utils/format';
import { NAV_HEIGHT } from '../BottomNav';
import { Ring, Sparkline, useCountUp } from '../charts';
import { AppIcon, HeroBackground, IconBadge, LiveDot, PermissionCard, PrimaryButton, Progress } from '../blocks';
import { Icon, type IconName } from '../Icon';
import { haptic } from '../ui';

function BigBytes({ bytes, color, size = 40, unitColor }: { bytes: number; color: string; size?: number; unitColor?: string }) {
  const v = useCountUp(bytes);
  const p = bytesParts(v);
  return (
    <Text style={{ color, fontSize: size, fontWeight: '700', letterSpacing: -0.8, includeFontPadding: false }}>
      {p.value}
      <Text style={{ fontSize: size * 0.48, fontWeight: '600', color: unitColor ?? color }}> {p.unit}</Text>
    </Text>
  );
}

function PlanHero() {
  const t = useTheme();
  const plan = useData((s) => s.plan);
  const today = useData((s) => s.today);
  const settings = useSettings((s) => s.plan);
  const f = forecast(plan);
  const cycle = planCycle(settings);

  if (!settings.enabled || !plan || !f) {
    const total = (today?.mobile ?? 0) + (today?.wifi ?? 0);
    const share = total > 0 ? (today?.mobile ?? 0) / total : 0;
    return (
      <Animated.View entering={FadeInDown.duration(380)} style={styles.hero}>
        <HeroBackground />
        <View style={styles.heroRow}>
          <Ring size={128} stroke={13} progress={share} colors={['#FFFFFF', '#CFC6FF']} track="rgba(255,255,255,0.18)">
            <Icon name="phone" size={30} color="#fff" strokeWidth={1.8} />
            <Text style={styles.ringCaption}>{Math.round(share * 100)} % mobile</Text>
          </Ring>
          <View style={{ flex: 1, marginLeft: 18 }}>
            <Text style={styles.heroLabel}>Utilisé aujourd’hui</Text>
            <BigBytes bytes={total} color="#fff" size={34} />
            <Text style={styles.heroSub}>Ajoutez votre forfait pour suivre ce qu’il reste, recevoir des alertes et savoir quand il sera épuisé.</Text>
          </View>
        </View>
        <PrimaryButton label="Configurer mon forfait" icon="plus" tone="light" onPress={() => router.push('/plan')} style={{ marginTop: 18 }} />
      </Animated.View>
    );
  }

  const danger = f.pct >= 0.95 || plan.expired;
  const warn = f.pct >= 0.8 || f.willRunOut;
  const ringColors: [string, string] = danger ? ['#FFD1D3', '#FF6B6F'] : warn ? ['#FFE6C2', '#FFB057'] : ['#FFFFFF', '#CFC6FF'];
  const left = plan.expired ? 0 : f.left;
  const endsIn = cycle ? cycle.end - Date.now() : 0;

  return (
    <Animated.View entering={FadeInDown.duration(380)} style={styles.hero}>
      <HeroBackground />
      <Pressable onPress={() => router.push('/plan')} style={styles.heroRow}>
        <Ring size={140} stroke={14} progress={1 - f.pct} colors={ringColors} track="rgba(255,255,255,0.18)">
          <Text style={styles.ringPct}>{Math.round((1 - f.pct) * 100)}%</Text>
          <Text style={styles.ringCaption}>restant</Text>
        </Ring>
        <View style={{ flex: 1, marginLeft: 18 }}>
          <Text style={styles.heroLabel} numberOfLines={1}>
            {settings.name || 'Mon forfait'}
          </Text>
          <BigBytes bytes={left} color="#fff" size={32} />
          <Text style={styles.heroSmall}>restants sur {fmtBytes(plan.volume)}</Text>
          <View style={styles.heroChips}>
            <View style={styles.heroChip}>
              <Icon name="clock" size={14} color="#fff" strokeWidth={2} />
              <Text style={styles.heroChipText}>{plan.expired ? 'Expiré' : `Expire dans ${fmtDuration(Math.max(0, endsIn))}`}</Text>
            </View>
          </View>
        </View>
      </Pressable>
      <View style={styles.heroFooter}>
        <View style={{ flex: 1 }}>
          <Text style={styles.footLabel}>Aujourd’hui</Text>
          <Text style={styles.footValue}>{fmtBytes(plan.today)}</Text>
        </View>
        <View style={styles.footSep} />
        <View style={{ flex: 1 }}>
          <Text style={styles.footLabel}>Budget / jour</Text>
          <Text style={styles.footValue}>{plan.expired ? '—' : fmtBytes(f.dailyBudget)}</Text>
        </View>
        <View style={styles.footSep} />
        <View style={{ flex: 1.2 }}>
          <Text style={styles.footLabel}>{f.willRunOut ? 'Épuisé dans' : 'Rythme actuel'}</Text>
          <Text style={[styles.footValue, f.willRunOut && { color: '#FFE0A6' }]}>
            {f.willRunOut && f.eta !== null ? `≈ ${fmtDuration(f.eta)}` : `${fmtBytes(f.rate * 3_600_000)}/h`}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

function LiveCard() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const down = useLive((s) => s.down);
  const up = useLive((s) => s.up);
  const history = useLive((s) => s.history);
  const net = useData((s) => s.net);
  const d = speedParts(down);
  const u = speedParts(up);
  const label = net?.type === 'wifi' ? 'Wi‑Fi' : net?.type === 'mobile' ? (net.generation ? `${net.generation} · ${net.operator || 'Mobile'}` : net.operator || 'Mobile') : net?.connected ? 'Connecté' : 'Hors ligne';
  return (
    <Animated.View entering={FadeInDown.delay(80).duration(380)} style={[styles.card, { backgroundColor: t.surface }]}>
      <View style={styles.cardHead}>
        <LiveDot color={t.success} />
        <Text style={[styles.cardTitle, { color: t.text }]}>En direct</Text>
        <View style={{ flex: 1 }} />
        <View style={[styles.netBadge, { backgroundColor: net?.type === 'wifi' ? t.wifiSoft : t.mobileSoft }]}>
          <Icon name={net?.type === 'wifi' ? 'wifi' : 'signal'} size={15} color={net?.type === 'wifi' ? t.wifi : t.mobile} strokeWidth={2.2} />
          <Text style={[styles.netBadgeText, { color: net?.type === 'wifi' ? t.wifi : t.mobile }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </View>
      <View style={styles.liveRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.liveLabel}>
            <Icon name="arrowDown" size={15} color={t.accent} strokeWidth={2.4} />
            <Text style={[styles.liveCaption, { color: t.textSecondary }]}>Réception</Text>
          </View>
          <Text style={[styles.liveValue, { color: t.text }]}>
            {d.value}
            <Text style={[styles.liveUnit, { color: t.textSecondary }]}> {d.unit}</Text>
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.liveLabel}>
            <Icon name="arrowUp" size={15} color={t.wifi} strokeWidth={2.4} />
            <Text style={[styles.liveCaption, { color: t.textSecondary }]}>Envoi</Text>
          </View>
          <Text style={[styles.liveValue, { color: t.text }]}>
            {u.value}
            <Text style={[styles.liveUnit, { color: t.textSecondary }]}> {u.unit}</Text>
          </Text>
        </View>
      </View>
      <View style={{ marginTop: 10, marginHorizontal: -4 }}>
        <Sparkline data={history} width={width - 24 - 32} height={62} color={t.accent} max={64 * 1024} />
      </View>
    </Animated.View>
  );
}

function TodayTiles() {
  const t = useTheme();
  const today = useData((s) => s.today);
  const mobile = today?.mobile ?? 0;
  const wifi = today?.wifi ?? 0;
  const max = Math.max(mobile, wifi, 1);
  const Tile = ({ icon, label, value, color, soft, rx, tx }: { icon: IconName; label: string; value: number; color: string; soft: string; rx: number; tx: number }) => (
    <View style={[styles.tile, { backgroundColor: t.surface }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconBadge name={icon} color={color} bg={soft} size={34} />
        <Text style={[styles.tileLabel, { color: t.textSecondary }]}>{label}</Text>
      </View>
      <View style={{ marginTop: 12 }}>
        <BigBytes bytes={value} color={t.text} size={26} unitColor={t.textSecondary} />
      </View>
      <View style={{ marginTop: 10 }}>
        <Progress value={value / max} color={color} track={t.track} height={5} />
      </View>
      <Text style={[styles.tileSub, { color: t.textTertiary }]}>
        ↓ {fmtBytes(rx)} · ↑ {fmtBytes(tx)}
      </Text>
    </View>
  );
  return (
    <Animated.View entering={FadeInDown.delay(140).duration(380)} style={styles.tiles}>
      <Tile icon="signal" label="Mobile" value={mobile} color={t.mobile} soft={t.mobileSoft} rx={today?.mobileRx ?? 0} tx={today?.mobileTx ?? 0} />
      <Tile icon="wifi" label="Wi‑Fi" value={wifi} color={t.wifi} soft={t.wifiSoft} rx={today?.wifiRx ?? 0} tx={today?.wifiTx ?? 0} />
    </Animated.View>
  );
}

function Control({
  icon,
  title,
  sub,
  on,
  onPress,
  color,
}: {
  icon: IconName;
  title: string;
  sub: string;
  on: boolean;
  onPress: () => void;
  color: string;
}) {
  const t = useTheme();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[{ width: '48.5%' }, style]}>
      <Pressable
        onPressIn={() => (scale.value = withSpring(0.95, { damping: 18, stiffness: 400 }))}
        onPressOut={() => (scale.value = withSpring(1, { damping: 14, stiffness: 300 }))}
        onPress={() => {
          haptic();
          onPress();
        }}
        style={[styles.control, { backgroundColor: on ? color : t.surface }]}
      >
        <View style={[styles.controlIcon, { backgroundColor: on ? 'rgba(255,255,255,0.22)' : t.accentTrack }]}>
          <Icon name={icon} size={21} color={on ? '#fff' : t.accent} strokeWidth={2} />
        </View>
        <Text style={[styles.controlTitle, { color: on ? '#fff' : t.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.controlSub, { color: on ? 'rgba(255,255,255,0.85)' : t.textSecondary }]} numberOfLines={1}>
          {sub}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function Controls() {
  const t = useTheme();
  const fw = useSettings((s) => s.firewall);
  const monitor = useSettings((s) => s.monitor.enabled);
  const status = useData((s) => s.firewall);
  const rules = Object.keys(fw.rules).length;
  return (
    <Animated.View entering={FadeInDown.delay(200).duration(380)} style={styles.controls}>
      <Control
        icon="leaf"
        title="Mode Éco"
        sub={fw.economy ? 'Essentiel uniquement' : 'Désactivé'}
        on={fw.economy}
        color="#17A665"
        onPress={() => setEconomy(!fw.economy)}
      />
      <Control
        icon="shield"
        title="Pare-feu"
        sub={fw.enabled ? (rules ? `${rules} règle${rules > 1 ? 's' : ''}${status?.active ? ' · actif' : ''}` : 'Aucune app bloquée') : 'Désactivé'}
        on={fw.enabled}
        color={t.accent}
        onPress={() => {
          if (!fw.enabled && rules === 0) {
            useNav.setState({ section: 'apps', appsTab: 2 });
            return;
          }
          setFirewallEnabled(!fw.enabled);
        }}
      />
      <Control
        icon="bolt"
        title="Compteur"
        sub={monitor ? 'Barre d’état' : 'Désactivé'}
        on={monitor}
        color="#3F7CF2"
        onPress={() => setMonitorEnabled(!monitor)}
      />
      <Control
        icon="speed"
        title="Test de débit"
        sub="Ping · Débit · Latence"
        on={false}
        color={t.accent}
        onPress={() => useNav.setState((s) => ({ section: 'test', testTab: 0, autoStart: s.autoStart + 1 }))}
      />
    </Animated.View>
  );
}

function TopApps() {
  const t = useTheme();
  const today = useData((s) => s.periods.today);
  const loadPeriod = useData((s) => s.loadPeriod);
  const refreshed = useData((s) => s.refreshedAt);
  useEffect(() => {
    loadPeriod('today', true);
  }, [refreshed, loadPeriod]);
  const rows = useMemo(() => [...(today?.rows ?? [])].sort((a, b) => b.mobile + b.wifi - (a.mobile + a.wifi)).slice(0, 5), [today]);
  if (!rows.length) return null;
  const max = rows[0].mobile + rows[0].wifi || 1;
  return (
    <Animated.View entering={FadeInDown.delay(260).duration(380)} style={[styles.card, { backgroundColor: t.surface }]}>
      <View style={styles.cardHead}>
        <Text style={[styles.cardTitle, { color: t.text, marginLeft: 0 }]}>Plus gourmandes aujourd’hui</Text>
        <View style={{ flex: 1 }} />
        <Text onPress={() => useNav.setState({ section: 'apps', appsTab: 0 })} style={[styles.link, { color: t.accent }]}>
          Tout voir
        </Text>
      </View>
      {rows.map((r) => {
        const total = r.mobile + r.wifi;
        return (
          <Pressable
            key={r.key}
            onPress={() => r.pkg && router.push({ pathname: '/app/[pkg]', params: { pkg: r.pkg } })}
            style={styles.appRow}
            android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
          >
            <AppIcon pkg={r.pkg} label={r.label} size={38} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={[styles.appName, { color: t.text }]} numberOfLines={1}>
                  {r.label}
                </Text>
                <Text style={[styles.appValue, { color: t.text }]}>{fmtBytes(total)}</Text>
              </View>
              <View style={[styles.stack, { backgroundColor: t.track }]}>
                <View style={{ width: `${(r.mobile / max) * 100}%`, backgroundColor: t.mobile }} />
                <View style={{ width: `${(r.wifi / max) * 100}%`, backgroundColor: t.wifi }} />
              </View>
            </View>
          </Pressable>
        );
      })}
      <View style={styles.legend}>
        <View style={[styles.legendDot, { backgroundColor: t.mobile }]} />
        <Text style={[styles.legendText, { color: t.textSecondary }]}>Mobile</Text>
        <View style={[styles.legendDot, { backgroundColor: t.wifi, marginLeft: 14 }]} />
        <Text style={[styles.legendText, { color: t.textSecondary }]}>Wi‑Fi</Text>
      </View>
    </Animated.View>
  );
}

const TONES = {
  danger: { fg: '#E5484D', bg: 'rgba(229,72,77,0.12)' },
  warning: { fg: '#E08A12', bg: 'rgba(238,154,46,0.14)' },
  info: { fg: '#5B3BF4', bg: 'rgba(91,59,244,0.11)' },
  success: { fg: '#17A665', bg: 'rgba(23,166,101,0.12)' },
};

function InsightCard({ item, index }: { item: Insight; index: number }) {
  const t = useTheme();
  const tone = TONES[item.tone];
  const run = () => {
    const a = item.action;
    if (!a) return;
    if (a.kind === 'eco') setEconomy(true);
    else if (a.kind === 'blockBg' && a.pkg) setAppRule(a.pkg, 'b', true);
    else if (a.kind === 'dataSaver') Native?.openSettings('dataSaver');
    else if (a.kind === 'plan') router.push('/plan');
  };
  return (
    <Animated.View entering={FadeInDown.delay(320 + index * 60).duration(360)} style={[styles.insight, { backgroundColor: t.surface }]}>
      <IconBadge name={item.icon} color={tone.fg} bg={tone.bg} size={40} />
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={[styles.insightTitle, { color: t.text }]}>{item.title}</Text>
        <Text style={[styles.insightText, { color: t.textSecondary }]}>{item.text}</Text>
        {item.action ? (
          <Text onPress={run} style={[styles.insightAction, { color: tone.fg }]}>
            {item.action.label}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

function Insights() {
  const plan = useData((s) => s.plan);
  const week = useData((s) => s.periods.week);
  const net = useData((s) => s.net);
  const loadPeriod = useData((s) => s.loadPeriod);
  const economy = useSettings((s) => s.firewall.economy);
  const rules = useSettings((s) => s.firewall.rules);
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    loadPeriod('week');
  }, [loadPeriod]);
  const items = useMemo(
    () => buildInsights({ plan, week: week?.rows, net, economy }).filter((i) => !dismissed.includes(i.id) && !(i.action?.kind === 'blockBg' && i.action.pkg && rules[i.action.pkg]?.b)),
    [plan, week, net, economy, dismissed, rules]
  );
  void setDismissed;
  if (!items.length) return null;
  return (
    <View>
      <Text style={[styles.section, { color: useTheme().tabInactive }]}>Conseils intelligents</Text>
      {items.map((it, i) => (
        <InsightCard key={it.id} item={it} index={i} />
      ))}
    </View>
  );
}

export function Overview() {
  const t = useTheme();
  const access = useData((s) => s.access);
  const refresh = useData((s) => s.refreshOverview);
  const [refreshing, setRefreshing] = useState(false);
  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: 6, paddingBottom: NAV_HEIGHT + 40 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          colors={[t.accent]}
          progressBackgroundColor={t.surfaceAlt}
          onRefresh={async () => {
            setRefreshing(true);
            await Promise.all([refresh(), useData.getState().refreshNet(), useData.getState().loadPeriod('today', true)]);
            setRefreshing(false);
          }}
        />
      }
    >
      {!access ? (
        <PermissionCard
          icon="chart"
          title="Voyez où partent vos données"
          text="Autorisez l’accès aux statistiques d’utilisation pour afficher la consommation exacte de chaque application, suivre votre forfait et recevoir des alertes."
          action="Autoriser l’accès"
          onPress={openUsageAccess}
        />
      ) : null}
      {access ? <PlanHero /> : null}
      <LiveCard />
      {access ? <TodayTiles /> : null}
      <Controls />
      {access ? <TopApps /> : null}
      {access ? <Insights /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: 12, borderRadius: 28, padding: 20, overflow: 'hidden' },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  ringPct: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  ringCaption: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '600', marginTop: 1 },
  heroLabel: { color: 'rgba(255,255,255,0.86)', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  heroSmall: { color: 'rgba(255,255,255,0.8)', fontSize: 13.5, marginTop: 2 },
  heroSub: { color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 18, marginTop: 6 },
  heroChips: { flexDirection: 'row', marginTop: 10 },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, height: 28, borderRadius: 14 },
  heroChipText: { color: '#fff', fontSize: 12.5, fontWeight: '600' },
  heroFooter: { flexDirection: 'row', marginTop: 18, backgroundColor: 'rgba(255,255,255,0.13)', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 },
  footLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },
  footValue: { color: '#fff', fontSize: 15.5, fontWeight: '700', marginTop: 3 },
  footSep: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 10 },
  card: { marginHorizontal: 12, marginTop: 12, borderRadius: 26, padding: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 16.5, fontWeight: '700', marginLeft: 2 },
  netBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: 14, maxWidth: 190 },
  netBadgeText: { fontSize: 12.5, fontWeight: '700' },
  liveRow: { flexDirection: 'row', marginTop: 12, paddingHorizontal: 4 },
  liveLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveCaption: { fontSize: 13, fontWeight: '600' },
  liveValue: { fontSize: 30, fontWeight: '700', letterSpacing: -0.6, marginTop: 2 },
  liveUnit: { fontSize: 15, fontWeight: '600' },
  tiles: { flexDirection: 'row', marginHorizontal: 12, marginTop: 12, gap: 10 },
  tile: { flex: 1, borderRadius: 24, padding: 16 },
  tileLabel: { fontSize: 14.5, fontWeight: '600', marginLeft: 10 },
  tileSub: { fontSize: 11.5, marginTop: 8 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginHorizontal: 12, marginTop: 12, rowGap: 10 },
  control: { borderRadius: 24, padding: 15, minHeight: 112 },
  controlIcon: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  controlTitle: { fontSize: 16, fontWeight: '700', marginTop: 12 },
  controlSub: { fontSize: 12.5, marginTop: 2 },
  link: { fontSize: 14, fontWeight: '700' },
  appRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  appName: { flex: 1, fontSize: 15.5, fontWeight: '600', marginRight: 8 },
  appValue: { fontSize: 14, fontWeight: '700' },
  stack: { height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row', marginTop: 7 },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  legendDot: { width: 9, height: 9, borderRadius: 5, marginRight: 6 },
  legendText: { fontSize: 12.5, fontWeight: '600' },
  section: { fontSize: 14, fontWeight: '600', marginTop: 22, marginBottom: 8, marginLeft: 26 },
  insight: { flexDirection: 'row', marginHorizontal: 12, marginBottom: 10, borderRadius: 24, padding: 16 },
  insightTitle: { fontSize: 15.5, fontWeight: '700' },
  insightText: { fontSize: 13.5, lineHeight: 19, marginTop: 3 },
  insightAction: { fontSize: 14, fontWeight: '700', marginTop: 9 },
});
