import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ring } from '../components/charts';
import { HeroBackground } from '../components/blocks';
import { ScreenHeader, SettingItem } from '../components/SettingItem';
import { Card, haptic, SectionLabel, Switch } from '../components/ui';
import { ensureFirewallConsent, setMonitorEnabled } from '../lib/actions';
import { forecast } from '../lib/insights';
import { useData } from '../store/data';
import { planCycle, useSettings } from '../store/settings';
import { toast, useUI } from '../store/ui';
import { useTheme } from '../theme';
import { fmtBytes, fmtDateTime, fmtDuration, GB, MB, startOfDay } from '../utils/format';

const VOLUMES = [100 * MB, 500 * MB, GB, 2 * GB, 5 * GB, 10 * GB, 25 * GB, 50 * GB, 100 * GB];
const PERIODS = [
  { days: 1, label: '24 h' },
  { days: 3, label: '3 jours' },
  { days: 7, label: '7 jours' },
  { days: 15, label: '15 jours' },
  { days: 30, label: '30 jours' },
  { days: 31, label: '1 mois' },
];
const ALERTS = [25, 50, 75, 80, 90, 95];

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic();
        onPress();
      }}
      style={[styles.pill, { backgroundColor: on ? t.accent : t.chip }]}
    >
      <Text style={[styles.pillText, { color: on ? '#fff' : t.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const parseNumber = (v: string) => Number(v.replace(',', '.').replace(/[^\d.]/g, ''));

export default function PlanScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const plan = useSettings((s) => s.plan);
  const update = useSettings((s) => s.updatePlan);
  const status = useData((s) => s.plan);
  const refresh = useData((s) => s.refreshOverview);
  const cycle = planCycle(plan);
  const f = forecast(status);

  useEffect(() => {
    const id = setTimeout(refresh, 450);
    return () => clearTimeout(id);
  }, [plan, refresh]);

  const enable = (v: boolean) => {
    update({ enabled: v, offsetBytes: 0, offsetCycle: 0 });
    if (v && !useSettings.getState().monitor.enabled) {
      setMonitorEnabled(true);
      toast('Compteur activé pour suivre le forfait et vous alerter');
    }
  };

  const customVolume = () =>
    useUI.getState().showPrompt({
      title: 'Volume du forfait',
      message: 'En gigaoctets (ex. 1,5). Pour les mégaoctets, écrivez par ex. 300 Mo.',
      initial: plan.volumeBytes >= GB ? String(plan.volumeBytes / GB).replace('.', ',') : `${Math.round(plan.volumeBytes / MB)} Mo`,
      keyboard: 'default',
      onSubmit: (v) => {
        const isMb = /mo|mb/i.test(v);
        const n = parseNumber(v);
        if (!n) return;
        update({ volumeBytes: Math.round(isMb ? n * MB : n * GB) });
      },
    });

  const customPeriod = () =>
    useUI.getState().showPrompt({
      title: 'Durée de validité',
      message: 'Nombre de jours',
      initial: String(plan.periodDays),
      keyboard: 'numeric',
      suffix: 'jours',
      onSubmit: (v) => {
        const n = Math.round(parseNumber(v));
        if (n >= 1 && n <= 365) update({ periodDays: n });
      },
    });

  const startOptions = () =>
    useUI.getState().showSheet({
      title: 'Début du forfait',
      subtitle: 'Quand avez-vous activé ou renouvelé ce forfait ?',
      actions: [
        { label: 'Maintenant', icon: 'clock', onPress: () => update({ startAt: Date.now(), offsetBytes: 0, offsetCycle: 0 }) },
        { label: 'Aujourd’hui à minuit', icon: 'calendar', onPress: () => update({ startAt: startOfDay(), offsetBytes: 0, offsetCycle: 0 }) },
        { label: 'Hier à minuit', icon: 'calendar', onPress: () => update({ startAt: startOfDay(-1), offsetBytes: 0, offsetCycle: 0 }) },
        {
          label: 'Il y a plusieurs jours…',
          icon: 'history',
          onPress: () =>
            useUI.getState().showPrompt({
              title: 'Activé il y a combien de jours ?',
              keyboard: 'numeric',
              suffix: 'jours',
              initial: '2',
              onSubmit: (v) => {
                const n = Math.round(parseNumber(v));
                if (n >= 0 && n <= 365) update({ startAt: startOfDay(-n), offsetBytes: 0, offsetCycle: 0 });
              },
            }),
        },
        { label: 'Le 1er du mois', icon: 'calendar', onPress: () => {
            const d = new Date();
            d.setDate(1);
            d.setHours(0, 0, 0, 0);
            update({ startAt: d.getTime(), periodDays: 31, renew: true, offsetBytes: 0, offsetCycle: 0 });
          } },
      ],
    });

  const correct = () => {
    if (!status || !cycle) return;
    useUI.getState().showPrompt({
      title: 'Corriger avec le solde de l’opérateur',
      message: 'Indiquez ce qu’il vous reste d’après votre opérateur (SMS ou code USSD). Ex. 850 Mo ou 1,2 Go.',
      keyboard: 'default',
      onSubmit: (v) => {
        const n = parseNumber(v);
        if (!(n >= 0)) return;
        const remaining = /go|gb/i.test(v) || (!/mo|mb/i.test(v) && n < 50) ? n * GB : n * MB;
        const used = Math.max(0, plan.volumeBytes - remaining);
        update({ offsetBytes: Math.round(used - status.measured), offsetCycle: cycle.start });
        toast('Consommation corrigée');
      },
    });
  };

  const left = status ? Math.max(0, status.volume - status.used) : plan.volumeBytes;
  const pct = status ? Math.min(1, status.used / Math.max(1, status.volume)) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader title="Mon forfait" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(360)} style={styles.hero}>
          <HeroBackground />
          <Ring size={124} stroke={13} progress={plan.enabled ? 1 - pct : 0} colors={['#FFFFFF', '#CFC6FF']} track="rgba(255,255,255,0.2)">
            <Text style={styles.ringPct}>{plan.enabled ? `${Math.round((1 - pct) * 100)}%` : '—'}</Text>
            <Text style={styles.ringCap}>restant</Text>
          </Ring>
          <View style={{ flex: 1, marginLeft: 18 }}>
            <Text style={styles.heroLabel}>{plan.enabled ? 'Il vous reste' : 'Forfait désactivé'}</Text>
            <Text style={styles.heroValue}>{plan.enabled ? fmtBytes(left) : fmtBytes(plan.volumeBytes)}</Text>
            {plan.enabled && cycle ? (
              <Text style={styles.heroSub}>
                {cycle.expired ? 'Expiré' : `Jusqu’au ${fmtDateTime(cycle.end)}`}
                {f && !cycle.expired ? `\n${f.willRunOut && f.eta ? `Épuisé dans ≈ ${fmtDuration(f.eta)}` : `${fmtBytes(f.dailyBudget)} / jour disponibles`}` : ''}
              </Text>
            ) : (
              <Text style={styles.heroSub}>Activez le suivi pour connaître votre solde en temps réel.</Text>
            )}
          </View>
        </Animated.View>

        <Card style={{ marginTop: 14 }}>
          <SettingItem title="Suivre mon forfait" sub="Calcul du solde, prévisions et alertes" onPress={() => enable(!plan.enabled)} right={<Switch value={plan.enabled} onChange={enable} />} />
          <SettingItem
            title="Nom"
            value={plan.name || 'Mon forfait'}
            onPress={() => useUI.getState().showPrompt({ title: 'Nom du forfait', initial: plan.name, placeholder: 'Ex. Pass 5 Go', onSubmit: (v) => update({ name: v.slice(0, 40) }) })}
            last
          />
        </Card>

        <SectionLabel>Volume</SectionLabel>
        <View style={styles.pills}>
          {VOLUMES.map((v) => (
            <Pill key={v} label={fmtBytes(v)} on={plan.volumeBytes === v} onPress={() => update({ volumeBytes: v })} />
          ))}
          <Pill label={VOLUMES.includes(plan.volumeBytes) ? 'Autre…' : `${fmtBytes(plan.volumeBytes)} ✎`} on={!VOLUMES.includes(plan.volumeBytes)} onPress={customVolume} />
        </View>

        <SectionLabel>Validité</SectionLabel>
        <View style={styles.pills}>
          {PERIODS.map((p) => (
            <Pill key={p.days} label={p.label} on={plan.periodDays === p.days} onPress={() => update({ periodDays: p.days })} />
          ))}
          <Pill label={PERIODS.some((p) => p.days === plan.periodDays) ? 'Autre…' : `${plan.periodDays} jours ✎`} on={!PERIODS.some((p) => p.days === plan.periodDays)} onPress={customPeriod} />
        </View>

        <Card style={{ marginTop: 14 }}>
          <SettingItem title="Début" value={fmtDateTime(plan.startAt)} onPress={startOptions} />
          <SettingItem
            title="Renouvellement automatique"
            sub={plan.renew ? `Un nouveau cycle démarre tous les ${plan.periodDays} jour${plan.periodDays > 1 ? 's' : ''}` : 'Forfait ponctuel : il expire à la fin'}
            onPress={() => update({ renew: !plan.renew })}
            right={<Switch value={plan.renew} onChange={(v) => update({ renew: v })} />}
          />
          <SettingItem
            title="Corriger le solde"
            sub={status ? `Mesuré par Android : ${fmtBytes(status.measured)}${plan.offsetBytes && plan.offsetCycle === cycle?.start ? ` · correction ${plan.offsetBytes >= 0 ? '+' : '−'}${fmtBytes(Math.abs(plan.offsetBytes))}` : ''}` : 'Disponible quand le suivi est actif'}
            onPress={correct}
            last
          />
        </Card>

        <SectionLabel>Alertes</SectionLabel>
        <View style={styles.pills}>
          {ALERTS.map((a) => {
            const on = plan.alerts.includes(a);
            return <Pill key={a} label={`${a} %`} on={on} onPress={() => update({ alerts: on ? plan.alerts.filter((x) => x !== a) : [...plan.alerts, a].sort((x, y) => x - y) })} />;
          })}
        </View>
        <Card style={{ marginTop: 14 }}>
          <SettingItem
            title="Couper les données à 100 %"
            sub="Seules vos applications essentielles restent connectées quand le forfait est épuisé"
            onPress={async () => {
              if (!plan.cutoff && !(await ensureFirewallConsent())) return;
              update({ cutoff: !plan.cutoff });
            }}
            right={
              <Switch
                value={plan.cutoff}
                onChange={async (v) => {
                  if (v && !(await ensureFirewallConsent())) return;
                  update({ cutoff: v });
                }}
              />
            }
            last
          />
        </Card>
        <Text style={[styles.note, { color: t.textTertiary }]}>
          MMega compte les données mobiles mesurées par Android depuis le début du forfait. Le résultat peut différer légèrement de celui de l’opérateur : utilisez « Corriger le solde » si besoin.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: 12, borderRadius: 28, padding: 20, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  ringPct: { color: '#fff', fontSize: 26, fontWeight: '800' },
  ringCap: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },
  heroValue: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: 2 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 6, lineHeight: 18 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  pill: { height: 38, paddingHorizontal: 16, borderRadius: 19, justifyContent: 'center' },
  pillText: { fontSize: 14.5, fontWeight: '700' },
  note: { fontSize: 12.5, lineHeight: 18, marginHorizontal: 26, marginTop: 16 },
});
