import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Native, type NativeApp } from '../../../modules/mmega-core';
import { openUsageAccess, setAppRule, setEconomy, setFirewallEnabled } from '../../lib/actions';
import { PERIOD_LABELS, useData, type AppUsage, type Period } from '../../store/data';
import { useSettings, type Rule } from '../../store/settings';
import { useUI } from '../../store/ui';
import { useTheme } from '../../theme';
import { fmtBytes, plural } from '../../utils/format';
import { NAV_HEIGHT } from '../BottomNav';
import { AppIcon, Chips, PermissionCard } from '../blocks';
import { EmptyState } from '../EmptyState';
import { Icon, type IconName } from '../Icon';
import { haptic, Switch } from '../ui';

const PERIODS: Period[] = ['today', 'week', 'month', 'cycle'];
const NO_RULE: Rule = {};

export function appSheet(pkg: string, label: string) {
  const s = useSettings.getState();
  const r = s.firewall.rules[pkg] ?? {};
  useUI.getState().showSheet({
    title: label,
    subtitle: pkg,
    actions: [
      { label: r.m ? 'Autoriser sur les données mobiles' : 'Bloquer sur les données mobiles', icon: 'signal', onPress: () => setAppRule(pkg, 'm', !r.m) },
      { label: r.w ? 'Autoriser sur le Wi‑Fi' : 'Bloquer sur le Wi‑Fi', icon: 'wifi', onPress: () => setAppRule(pkg, 'w', !r.w) },
      { label: r.b ? 'Autoriser en arrière-plan' : 'Bloquer en arrière-plan', icon: 'moon', onPress: () => setAppRule(pkg, 'b', !r.b) },
      { label: 'Détails de consommation', icon: 'chart', onPress: () => router.push({ pathname: '/app/[pkg]', params: { pkg } }) },
      { label: 'Ouvrir l’application', icon: 'link', onPress: () => Native?.launchApp(pkg) },
      { label: 'Paramètres Android de l’app', icon: 'settings', onPress: () => Native?.openSettings(`appDetails:${pkg}`) },
    ],
  });
}

const UsageRow = memo(function UsageRow({ item, max, network }: { item: AppUsage; max: number; network: 'mobile' | 'wifi' }) {
  const t = useTheme();
  const rule = useSettings((s) => (item.pkg ? s.firewall.rules[item.pkg] : undefined)) ?? NO_RULE;
  const value = network === 'mobile' ? item.mobile : item.wifi;
  const bg = network === 'mobile' ? item.mobileBg : item.wifiBg;
  const color = network === 'mobile' ? t.mobile : t.wifi;
  const blocked = network === 'mobile' ? rule.m : rule.w;
  return (
    <Pressable
      onPress={() => item.pkg && router.push({ pathname: '/app/[pkg]', params: { pkg: item.pkg } })}
      onLongPress={() => item.pkg && (haptic(), appSheet(item.pkg, item.label))}
      android_ripple={{ color: t.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }}
      style={styles.row}
    >
      <AppIcon pkg={item.pkg} label={item.label} size={42} />
      <View style={{ flex: 1, marginLeft: 14 }}>
        <View style={styles.rowTop}>
          <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
            {item.label}
          </Text>
          {blocked || rule.b ? <Icon name="shield" size={15} color={t.danger} strokeWidth={2.2} /> : null}
          <Text style={[styles.value, { color: t.text }]}>{fmtBytes(value)}</Text>
        </View>
        <View style={[styles.bar, { backgroundColor: t.track }]}>
          <View style={{ width: `${Math.max(1.5, (value / max) * 100)}%`, height: '100%', borderRadius: 3, backgroundColor: color }} />
        </View>
        <Text style={[styles.sub, { color: t.textTertiary }]} numberOfLines={1}>
          {bg > 0 ? `Arrière-plan ${fmtBytes(bg)} · ` : ''}↓ {fmtBytes(network === 'mobile' ? item.mobileRx : item.wifiRx)} ↑ {fmtBytes(network === 'mobile' ? item.mobileTx : item.wifiTx)}
        </Text>
      </View>
    </Pressable>
  );
});

export function UsageTab({ network }: { network: 'mobile' | 'wifi' }) {
  const t = useTheme();
  const access = useData((s) => s.access);
  const planOn = useSettings((s) => s.plan.enabled);
  const [period, setPeriod] = useState<Period>('today');
  const data = useData((s) => s.periods[period]);
  const loading = !!useData((s) => s.loadingPeriod[period]);
  const loadPeriod = useData((s) => s.loadPeriod);
  useEffect(() => {
    loadPeriod(period);
  }, [period, loadPeriod]);

  const rows = useMemo(() => {
    const key = network === 'mobile' ? 'mobile' : 'wifi';
    return (data?.rows ?? []).filter((r) => r[key] > 0).sort((a, b) => b[key] - a[key]);
  }, [data, network]);
  const total = rows.reduce((s, r) => s + (network === 'mobile' ? r.mobile : r.wifi), 0);
  const max = rows.length ? (network === 'mobile' ? rows[0].mobile : rows[0].wifi) || 1 : 1;
  const periods = PERIODS.filter((p) => p !== 'cycle' || planOn).map((p) => ({ key: p, label: PERIOD_LABELS[p] }));

  if (!access)
    return (
      <View style={{ paddingTop: 6 }}>
        <PermissionCard icon="apps" title="Consommation par application" text="Autorisez l’accès aux statistiques pour voir combien chaque application utilise sur les données mobiles et le Wi‑Fi." action="Autoriser l’accès" onPress={openUsageAccess} />
      </View>
    );

  const header = (
    <View>
      <Chips items={periods} value={period} onChange={setPeriod} style={{ paddingTop: 8 }} />
      <Animated.View key={`${period}-${network}`} entering={FadeIn.duration(220)} style={styles.summary}>
        <Text style={[styles.summaryLabel, { color: t.textSecondary }]}>
          {network === 'mobile' ? 'Données mobiles' : 'Wi‑Fi'} · {PERIOD_LABELS[period].toLowerCase()}
        </Text>
        <Text style={[styles.summaryValue, { color: t.text }]}>{fmtBytes(total)}</Text>
        <Text style={[styles.summarySub, { color: t.textTertiary }]}>{plural(rows.length, 'application', 'applications')} · appui long pour bloquer</Text>
      </Animated.View>
    </View>
  );

  return (
    <FlashList
      data={rows}
      keyExtractor={(r) => r.key}
      ListHeaderComponent={header}
      extraData={max}
      contentContainerStyle={{ paddingBottom: NAV_HEIGHT + 40 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={() => loadPeriod(period, true)} colors={[t.accent]} />}
      ListEmptyComponent={loading ? null : <EmptyState text={network === 'mobile' ? 'Aucune donnée mobile utilisée sur cette période.' : 'Aucune donnée Wi‑Fi sur cette période.'} />}
      renderItem={({ item }) => <UsageRow item={item} max={max} network={network} />}
    />
  );
}

function RuleButton({ icon, on, onPress, label }: { icon: IconName; on: boolean; onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic();
        onPress();
      }}
      accessibilityLabel={label}
      hitSlop={4}
      style={[styles.ruleBtn, { backgroundColor: on ? t.danger : t.chip }]}
    >
      <Icon name={icon} size={18} color={on ? '#fff' : t.textSecondary} strokeWidth={2.1} />
      {on ? <View style={styles.ruleSlash} /> : null}
    </Pressable>
  );
}

const FirewallRow = memo(function FirewallRow({ app }: { app: NativeApp }) {
  const t = useTheme();
  const rule = useSettings((s) => s.firewall.rules[app.pkg]) ?? NO_RULE;
  const essential = useSettings((s) => s.firewall.whitelist.includes(app.pkg));
  const set = useCallback((k: 'm' | 'w' | 'b', v: boolean) => setAppRule(app.pkg, k, v), [app.pkg]);
  return (
    <Pressable onLongPress={() => appSheet(app.pkg, app.label)} onPress={() => router.push({ pathname: '/app/[pkg]', params: { pkg: app.pkg } })} style={styles.fwRow} android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
      <AppIcon pkg={app.pkg} label={app.label} size={40} />
      <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
        <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
          {app.label}
        </Text>
        <Text style={[styles.sub, { color: essential ? t.success : t.textTertiary, marginTop: 1 }]} numberOfLines={1}>
          {essential ? 'Essentielle · toujours connectée en mode Éco' : app.system ? 'Application système' : app.pkg}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <RuleButton icon="signal" on={!!rule.m} onPress={() => set('m', !rule.m)} label="Bloquer sur les données mobiles" />
        <RuleButton icon="wifi" on={!!rule.w} onPress={() => set('w', !rule.w)} label="Bloquer sur le Wi‑Fi" />
        <RuleButton icon="moon" on={!!rule.b} onPress={() => set('b', !rule.b)} label="Bloquer en arrière-plan" />
      </View>
    </Pressable>
  );
});

type Filter = 'all' | 'blocked' | 'system';

export function FirewallTab() {
  const t = useTheme();
  const apps = useData((s) => s.apps);
  const loaded = useData((s) => s.appsLoaded);
  const loadApps = useData((s) => s.loadApps);
  const fw = useSettings((s) => s.firewall);
  const status = useData((s) => s.firewall);
  const update = useSettings((s) => s.updateFirewall);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((a) => {
      if (a.self) return false;
      if (filter === 'blocked' && !fw.rules[a.pkg]) return false;
      if (filter === 'all' && a.system && !a.launchable && !fw.rules[a.pkg]) return false;
      if (filter === 'system' && !a.system) return false;
      if (q && !a.label.toLowerCase().includes(q) && !a.pkg.includes(q)) return false;
      return true;
    });
  }, [apps, query, filter, fw.rules]);

  const blockedCount = Object.keys(fw.rules).length;
  const statusText = !fw.enabled
    ? 'Désactivé'
    : status?.mode === 'economy'
      ? 'Mode Éco actif'
      : status?.mode === 'cutoff'
        ? 'Coupure : forfait épuisé'
        : status?.mode === 'sleep'
          ? 'Écran éteint : tout est coupé'
          : status?.active
            ? `Actif · ${plural(status.blocked > 0 ? status.blocked : blockedCount, 'app bloquée', 'apps bloquées')} sur ce réseau`
            : blockedCount
              ? 'Prêt · aucune règle sur ce réseau'
              : 'Prêt · choisissez les apps à bloquer';

  const header = (
    <View>
      <View style={[styles.fwCard, { backgroundColor: t.surface }]}>
        <View style={styles.fwHead}>
          <View style={[styles.fwIcon, { backgroundColor: fw.enabled ? t.accent : t.accentTrack }]}>
            <Icon name={fw.enabled ? 'shieldCheck' : 'shield'} size={24} color={fw.enabled ? '#fff' : t.accent} strokeWidth={2} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={[styles.fwTitle, { color: t.text }]}>Pare-feu</Text>
            <Text style={[styles.fwStatus, { color: fw.enabled ? t.success : t.textSecondary }]}>{statusText}</Text>
          </View>
          <Switch value={fw.enabled} onChange={(v) => setFirewallEnabled(v)} />
        </View>
        <View style={[styles.fwDivider, { backgroundColor: t.divider }]} />
        <Pressable style={styles.fwOption} onPress={() => setEconomy(!fw.economy)}>
          <Icon name="leaf" size={20} color={t.success} strokeWidth={2} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.fwOptTitle, { color: t.text }]}>Mode Éco</Text>
            <Text style={[styles.fwOptSub, { color: t.textSecondary }]}>Sur les données mobiles, seules les apps essentielles se connectent</Text>
          </View>
          <Switch value={fw.economy} onChange={(v) => setEconomy(v)} />
        </Pressable>
        <Pressable style={styles.fwOption} onPress={() => update({ screenOff: !fw.screenOff })}>
          <Icon name="moon" size={20} color={t.accent} strokeWidth={2} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.fwOptTitle, { color: t.text }]}>Couper quand l’écran est éteint</Text>
            <Text style={[styles.fwOptSub, { color: t.textSecondary }]}>Plus aucune consommation cachée la nuit (sauf apps essentielles)</Text>
          </View>
          <Switch value={fw.screenOff} onChange={(v) => update({ screenOff: v })} />
        </Pressable>
        <Pressable style={styles.fwOption} onPress={() => router.push('/whitelist')}>
          <Icon name="checkCircle" size={20} color={t.accent} strokeWidth={2} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.fwOptTitle, { color: t.text }]}>Applications essentielles</Text>
            <Text style={[styles.fwOptSub, { color: t.textSecondary }]}>{plural(fw.whitelist.length, 'application toujours autorisée', 'applications toujours autorisées')}</Text>
          </View>
          <Icon name="chevronRight" size={20} color={t.textTertiary} />
        </Pressable>
      </View>
      <View style={[styles.search, { backgroundColor: t.surface }]}>
        <Icon name="search" size={20} color={t.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher une application"
          placeholderTextColor={t.textTertiary}
          style={[styles.searchInput, { color: t.text }]}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Icon name="close" size={18} color={t.textTertiary} />
          </Pressable>
        ) : null}
      </View>
      <Chips
        items={[
          { key: 'all', label: 'Applications' },
          { key: 'blocked', label: `Bloquées${blockedCount ? ` (${blockedCount})` : ''}` },
          { key: 'system', label: 'Système' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <View style={styles.legendRow}>
        <Text style={[styles.legendText, { color: t.textTertiary }]}>Touchez une icône pour bloquer : données mobiles · Wi‑Fi · arrière-plan</Text>
      </View>
    </View>
  );

  return (
    <FlashList
      data={list}
      keyExtractor={(a) => a.pkg}
      ListHeaderComponent={header}
      contentContainerStyle={{ paddingBottom: NAV_HEIGHT + 40 }}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={loaded ? <EmptyState text={filter === 'blocked' ? 'Aucune application bloquée pour l’instant.' : 'Aucune application trouvée.'} /> : null}
      renderItem={({ item }) => <FirewallRow app={item} />}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 11 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  value: { fontSize: 15, fontWeight: '700' },
  bar: { height: 6, borderRadius: 3, marginTop: 7, overflow: 'hidden' },
  sub: { fontSize: 12, marginTop: 5 },
  summary: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 8 },
  summaryLabel: { fontSize: 13.5, fontWeight: '600' },
  summaryValue: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8, marginTop: 2 },
  summarySub: { fontSize: 12.5, marginTop: 2 },
  ruleBtn: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  ruleSlash: { position: 'absolute', width: 26, height: 2.4, borderRadius: 2, backgroundColor: '#fff', transform: [{ rotate: '-45deg' }] },
  fwRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  fwCard: { marginHorizontal: 12, marginTop: 8, borderRadius: 26, paddingVertical: 8 },
  fwHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  fwIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  fwTitle: { fontSize: 18, fontWeight: '700' },
  fwStatus: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  fwDivider: { height: 1, marginHorizontal: 16, marginVertical: 4 },
  fwOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 11 },
  fwOptTitle: { fontSize: 15.5, fontWeight: '600' },
  fwOptSub: { fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  search: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 12, marginBottom: 8, borderRadius: 22, paddingHorizontal: 16, height: 48 },
  searchInput: { flex: 1, fontSize: 16, marginLeft: 10, paddingVertical: 0 },
  legendRow: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 4 },
  legendText: { fontSize: 12 },
});
