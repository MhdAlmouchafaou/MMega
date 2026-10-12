import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Native, type DayUsage } from '../../../modules/mmega-core';
import { AppIcon, Chips } from '../../components/blocks';
import { BarChart } from '../../components/charts';
import { Icon, type IconName } from '../../components/Icon';
import { ScreenHeader } from '../../components/SettingItem';
import { Switch } from '../../components/ui';
import { setAppRule } from '../../lib/actions';
import { PERIOD_LABELS, useData, type Period } from '../../store/data';
import { useSettings } from '../../store/settings';
import { useTheme } from '../../theme';
import { dayShort, fmtBytes, fmtDate } from '../../utils/format';

const NO_RULE = {};

function RuleRow({ icon, title, sub, value, onChange, color }: { icon: IconName; title: string; sub: string; value: boolean; onChange: (v: boolean) => void; color: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.rule}>
      <View style={[styles.ruleIcon, { backgroundColor: value ? t.danger : `${color}22` }]}>
        <Icon name={icon} size={20} color={value ? '#fff' : color} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, marginLeft: 14, marginRight: 10 }}>
        <Text style={[styles.ruleTitle, { color: t.text }]}>{title}</Text>
        <Text style={[styles.ruleSub, { color: value ? t.danger : t.textSecondary }]}>{value ? 'Bloqué' : sub}</Text>
      </View>
      <Switch value={value} onChange={onChange} />
    </Pressable>
  );
}

export default function AppDetail() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { pkg } = useLocalSearchParams<{ pkg: string }>();
  const app = useData((s) => s.byPkg[pkg]);
  const loadApps = useData((s) => s.loadApps);
  const loadPeriod = useData((s) => s.loadPeriod);
  const rule = useSettings((s) => s.firewall.rules[pkg]) ?? NO_RULE;
  const essential = useSettings((s) => s.firewall.whitelist.includes(pkg));
  const toggleWhitelist = useSettings((s) => s.toggleWhitelist);
  const fwEnabled = useSettings((s) => s.firewall.enabled);
  const [period, setPeriod] = useState<Period>('week');
  const data = useData((s) => s.periods[period]);
  const [days, setDays] = useState<DayUsage[]>([]);
  const [selected, setSelected] = useState(-1);

  useEffect(() => {
    loadApps();
  }, [loadApps]);
  useEffect(() => {
    loadPeriod(period);
  }, [period, loadPeriod]);
  useEffect(() => {
    if (!app || !Native) return;
    Native.appDaily(app.uid, 14).then(setDays).catch(() => {});
  }, [app]);

  const row = useMemo(() => data?.rows.find((r) => r.pkg === pkg || (app && r.uid === app.uid)), [data, pkg, app]);
  const label = app?.label ?? pkg;
  const mobile = row?.mobile ?? 0;
  const wifi = row?.wifi ?? 0;
  const bg = (row?.mobileBg ?? 0) + (row?.wifiBg ?? 0);
  const total = mobile + wifi;
  const chart = days.map((d) => ({ key: String(d.start), label: dayShort(d.start), mobile: d.mobile, wifi: d.wifi }));
  const sel = selected >= 0 ? days[selected] : null;
  const shared = app ? (useData.getState().byUid[app.uid]?.length ?? 1) > 1 : false;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader title="" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(260)} style={styles.head}>
          <AppIcon pkg={pkg} label={label} size={72} />
          <Text style={[styles.name, { color: t.text }]} numberOfLines={2}>
            {label}
          </Text>
          <Text style={[styles.pkg, { color: t.textTertiary }]}>{pkg}</Text>
          {shared ? <Text style={[styles.pkg, { color: t.textTertiary }]}>Partage son identifiant réseau avec d’autres composants système</Text> : null}
        </Animated.View>

        <Chips
          items={(['today', 'week', 'month'] as Period[]).map((p) => ({ key: p, label: PERIOD_LABELS[p] }))}
          value={period}
          onChange={setPeriod}
          style={{ justifyContent: 'center', flexGrow: 1 }}
        />

        <Animated.View key={period} entering={FadeInDown.duration(300)} style={[styles.card, { backgroundColor: t.surface }]}>
          <Text style={[styles.caption, { color: t.textSecondary }]}>Total · {PERIOD_LABELS[period].toLowerCase()}</Text>
          <Text style={[styles.big, { color: t.text }]}>{fmtBytes(total)}</Text>
          <View style={[styles.split, { backgroundColor: t.track }]}>
            <View style={{ flex: Math.max(mobile, 0.0001), backgroundColor: t.mobile }} />
            <View style={{ flex: Math.max(wifi, 0.0001), backgroundColor: t.wifi }} />
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={[styles.statLabel, { color: t.mobile }]}>Mobile</Text>
              <Text style={[styles.statValue, { color: t.text }]}>{fmtBytes(mobile)}</Text>
              <Text style={[styles.statSub, { color: t.textTertiary }]}>↓ {fmtBytes(row?.mobileRx ?? 0)} · ↑ {fmtBytes(row?.mobileTx ?? 0)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statLabel, { color: t.wifi }]}>Wi‑Fi</Text>
              <Text style={[styles.statValue, { color: t.text }]}>{fmtBytes(wifi)}</Text>
              <Text style={[styles.statSub, { color: t.textTertiary }]}>↓ {fmtBytes(row?.wifiRx ?? 0)} · ↑ {fmtBytes(row?.wifiTx ?? 0)}</Text>
            </View>
          </View>
          <View style={[styles.bgBox, { backgroundColor: t.bg }]}>
            <Icon name="moon" size={18} color={t.accent} strokeWidth={2} />
            <Text style={[styles.bgText, { color: t.textSecondary }]}>
              <Text style={{ color: t.text, fontWeight: '700' }}>{fmtBytes(bg)}</Text> en arrière-plan ({total ? Math.round((bg / total) * 100) : 0} %) · <Text style={{ color: t.text, fontWeight: '700' }}>{fmtBytes(Math.max(0, total - bg))}</Text> quand vous l’utilisiez
            </Text>
          </View>
        </Animated.View>

        {chart.length ? (
          <Animated.View entering={FadeInDown.delay(80).duration(300)} style={[styles.card, { backgroundColor: t.surface }]}>
            <Text style={[styles.cardTitle, { color: t.text }]}>{sel ? fmtDate(sel.start) : '14 derniers jours'}</Text>
            <Text style={[styles.caption, { color: t.textSecondary, marginTop: 2 }]}>
              {sel ? `${fmtBytes(sel.mobile + sel.wifi)} · mobile ${fmtBytes(sel.mobile)} · Wi‑Fi ${fmtBytes(sel.wifi)}` : `${fmtBytes(days.reduce((s, d) => s + d.mobile + d.wifi, 0))} au total`}
            </Text>
            <BarChart data={chart} height={120} selected={selected} onSelect={setSelected} style={{ marginTop: 14 }} />
          </Animated.View>
        ) : null}

        <Text style={[styles.section, { color: t.tabInactive }]}>Pare-feu{!fwEnabled && Object.keys(rule).length ? ' (désactivé)' : ''}</Text>
        <View style={[styles.card, { backgroundColor: t.surface, marginTop: 0, paddingVertical: 6 }]}>
          <RuleRow icon="signal" title="Données mobiles" sub="Autorisé" value={!!(rule as { m?: boolean }).m} onChange={(v) => setAppRule(pkg, 'm', v)} color={t.mobile} />
          <RuleRow icon="wifi" title="Wi‑Fi" sub="Autorisé" value={!!(rule as { w?: boolean }).w} onChange={(v) => setAppRule(pkg, 'w', v)} color={t.wifi} />
          <RuleRow icon="moon" title="Arrière-plan" sub="Bloquer quand l’app n’est pas à l’écran" value={!!(rule as { b?: boolean }).b} onChange={(v) => setAppRule(pkg, 'b', v)} color={t.accent} />
          <Pressable onPress={() => toggleWhitelist(pkg)} style={styles.rule}>
            <View style={[styles.ruleIcon, { backgroundColor: essential ? t.success : `${t.success}22` }]}>
              <Icon name="checkCircle" size={20} color={essential ? '#fff' : t.success} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, marginLeft: 14, marginRight: 10 }}>
              <Text style={[styles.ruleTitle, { color: t.text }]}>Application essentielle</Text>
              <Text style={[styles.ruleSub, { color: t.textSecondary }]}>Reste connectée en mode Éco et après la coupure</Text>
            </View>
            <Switch value={essential} onChange={() => toggleWhitelist(pkg)} />
          </Pressable>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={() => Native?.launchApp(pkg)} style={[styles.action, { backgroundColor: t.surface }]}>
            <Icon name="link" size={20} color={t.accent} />
            <Text style={[styles.actionText, { color: t.text }]}>Ouvrir</Text>
          </Pressable>
          <Pressable onPress={() => Native?.openSettings(`appData:${pkg}`)} style={[styles.action, { backgroundColor: t.surface }]}>
            <Icon name="sliders" size={20} color={t.accent} />
            <Text style={[styles.actionText, { color: t.text }]}>Données Android</Text>
          </Pressable>
          <Pressable onPress={() => Native?.openSettings(`appDetails:${pkg}`)} style={[styles.action, { backgroundColor: t.surface }]}>
            <Icon name="info" size={20} color={t.accent} />
            <Text style={[styles.actionText, { color: t.text }]}>Infos</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', paddingHorizontal: 30, marginTop: -20, marginBottom: 16 },
  name: { fontSize: 24, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  pkg: { fontSize: 12.5, marginTop: 2, textAlign: 'center' },
  card: { marginHorizontal: 12, marginTop: 12, borderRadius: 26, padding: 18 },
  caption: { fontSize: 13, fontWeight: '600' },
  big: { fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: 2 },
  split: { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', marginTop: 12 },
  stats: { flexDirection: 'row', marginTop: 14 },
  stat: { flex: 1 },
  statLabel: { fontSize: 13, fontWeight: '700' },
  statValue: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  statSub: { fontSize: 11.5, marginTop: 2 },
  bgBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 12, marginTop: 14 },
  bgText: { flex: 1, fontSize: 13, lineHeight: 18 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  section: { fontSize: 14, fontWeight: '600', marginTop: 22, marginBottom: 8, marginLeft: 26 },
  rule: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  ruleIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ruleTitle: { fontSize: 16, fontWeight: '600' },
  ruleSub: { fontSize: 12.5, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginHorizontal: 12, marginTop: 14 },
  action: { flex: 1, borderRadius: 20, paddingVertical: 14, alignItems: 'center', gap: 6 },
  actionText: { fontSize: 13, fontWeight: '600' },
});
