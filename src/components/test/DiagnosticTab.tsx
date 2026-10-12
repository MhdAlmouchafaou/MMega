import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Native, type NetworkInfo, type PingResult } from '../../../modules/mmega-core';
import { useData } from '../../store/data';
import { useSettings } from '../../store/settings';
import { useTheme } from '../../theme';
import { fmtMs } from '../../utils/format';
import { NAV_HEIGHT } from '../BottomNav';
import { MiniBars } from '../charts';
import { HeroBackground, IconBadge, PrimaryButton } from '../blocks';
import { Icon, type IconName } from '../Icon';

type Status = 'wait' | 'run' | 'ok' | 'warn' | 'fail';
type Step = { id: string; label: string; icon: IconName; status: Status; detail?: string };
type Service = { name: string; host: string; result?: PingResult };

const SERVICES: Service[] = [
  { name: 'WhatsApp', host: 'g.whatsapp.net' },
  { name: 'YouTube', host: 'www.youtube.com' },
  { name: 'Facebook', host: 'www.facebook.com' },
  { name: 'TikTok', host: 'www.tiktok.com' },
  { name: 'Instagram', host: 'www.instagram.com' },
  { name: 'Google', host: 'www.google.com' },
];

const INITIAL: Step[] = [
  { id: 'net', label: 'Connexion au réseau', icon: 'link', status: 'wait' },
  { id: 'signal', label: 'Qualité du signal', icon: 'signal', status: 'wait' },
  { id: 'internet', label: 'Accès à Internet', icon: 'globe', status: 'wait' },
  { id: 'dns', label: 'Résolution des noms (DNS)', icon: 'server', status: 'wait' },
  { id: 'services', label: 'Applications populaires', icon: 'apps', status: 'wait' },
  { id: 'limits', label: 'Restrictions et forfait', icon: 'shield', status: 'wait' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function latencyColor(ms: number, t: { success: string; warning: string; danger: string }) {
  if (ms < 0) return t.danger;
  if (ms < 120) return t.success;
  if (ms < 300) return t.warning;
  return t.danger;
}

function StepRow({ step, index }: { step: Step; index: number }) {
  const t = useTheme();
  const color = step.status === 'ok' ? t.success : step.status === 'warn' ? t.warning : step.status === 'fail' ? t.danger : t.textTertiary;
  return (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(260)} layout={LinearTransition.springify().damping(18)} style={styles.step}>
      <View style={[styles.stepIcon, { backgroundColor: step.status === 'wait' ? t.chip : `${color}22` }]}>
        {step.status === 'run' ? <ActivityIndicator size="small" color={t.accent} /> : <Icon name={step.status === 'ok' ? 'check' : step.status === 'fail' ? 'close' : step.status === 'warn' ? 'alert' : step.icon} size={18} color={step.status === 'wait' ? t.textTertiary : color} strokeWidth={2.4} />}
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[styles.stepLabel, { color: step.status === 'wait' ? t.textTertiary : t.text }]}>{step.label}</Text>
        {step.detail ? (
          <Animated.Text entering={FadeIn.duration(200)} style={[styles.stepDetail, { color: step.status === 'ok' ? t.textSecondary : color }]}>
            {step.detail}
          </Animated.Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

function PingTool() {
  const t = useTheme();
  const [host, setHost] = useState('google.com');
  const [res, setRes] = useState<PingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!Native || busy || !host.trim()) return;
    setBusy(true);
    setRes(null);
    try {
      setRes(await Native.tcpPing(host.trim().replace(/^https?:\/\//, '').split('/')[0], 443, 10, 3000));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[styles.card, { backgroundColor: t.surface }]}>
      <Text style={[styles.cardTitle, { color: t.text }]}>Outil ping</Text>
      <Text style={[styles.small, { color: t.textSecondary, marginTop: 2 }]}>Mesure le temps de réponse d’un site (10 essais)</Text>
      <View style={[styles.input, { backgroundColor: t.bg }]}>
        <Icon name="globe" size={18} color={t.textTertiary} />
        <TextInput
          value={host}
          onChangeText={setHost}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={run}
          placeholder="exemple.com"
          placeholderTextColor={t.textTertiary}
          style={[styles.inputText, { color: t.text }]}
        />
        <Pressable onPress={run} style={[styles.pingBtn, { backgroundColor: t.accent }]}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.pingBtnText}>Ping</Text>}
        </Pressable>
      </View>
      {res ? (
        <Animated.View entering={FadeIn.duration(250)} style={{ marginTop: 14 }}>
          {res.received ? (
            <>
              <View style={styles.pingStats}>
                {[
                  ['Min', res.min],
                  ['Moy.', res.avg],
                  ['Max', res.max],
                  ['Gigue', res.jitter],
                ].map(([l, v]) => (
                  <View key={l as string} style={{ flex: 1 }}>
                    <Text style={[styles.small, { color: t.textSecondary }]}>{l}</Text>
                    <Text style={[styles.pingValue, { color: t.text }]}>{fmtMs(v as number)} ms</Text>
                  </View>
                ))}
              </View>
              <View style={{ marginTop: 12 }}>
                <MiniBars data={res.times} height={48} color={latencyColor(res.avg, t)} />
              </View>
              <Text style={[styles.small, { color: res.loss > 0 ? t.warning : t.textTertiary, marginTop: 10 }]}>
                {res.ip} · {Math.round(res.loss * 100)} % de perte · DNS {fmtMs(res.dnsMs)} ms
              </Text>
            </>
          ) : (
            <Text style={[styles.small, { color: t.danger }]}>{res.error === 'dns' ? 'Adresse introuvable' : 'Aucune réponse du serveur'}</Text>
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

type Verdict = { tone: 'ok' | 'warn' | 'fail'; title: string; advice: string[] };

export function DiagnosticTab() {
  const t = useTheme();
  const [steps, setSteps] = useState<Step[]>(INITIAL);
  const [services, setServices] = useState<Service[]>(SERVICES);
  const [running, setRunning] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const advice = useRef<string[]>([]);

  const update = (id: string, p: Partial<Step>) => setSteps((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const run = async () => {
    if (!Native || running) return;
    setRunning(true);
    setVerdict(null);
    setSteps(INITIAL);
    setServices(SERVICES);
    advice.current = [];
    let worst: Status = 'ok';
    const mark = (id: string, status: Status, detail: string, tip?: string) => {
      update(id, { status, detail });
      if (status === 'fail') worst = 'fail';
      else if (status === 'warn' && worst !== 'fail') worst = 'warn';
      if (tip) advice.current.push(tip);
    };

    // 1. Network
    update('net', { status: 'run' });
    await sleep(350);
    const net: NetworkInfo | null = await useData.getState().refreshNet();
    if (!net || !net.connected) {
      mark(
        'net',
        'fail',
        net?.airplane ? 'Mode avion activé' : 'Aucun réseau connecté',
        net?.airplane ? 'Désactivez le mode avion.' : 'Activez les données mobiles ou connectez-vous à un Wi‑Fi.'
      );
      for (const id of ['signal', 'internet', 'dns', 'services', 'limits']) update(id, { status: 'fail', detail: 'Ignoré : pas de réseau' });
      setVerdict({ tone: 'fail', title: 'Vous n’êtes pas connecté', advice: advice.current });
      setRunning(false);
      return;
    }
    const kind = net.type === 'wifi' ? `Wi‑Fi${net.ssid ? ` « ${net.ssid} »` : ''}` : net.type === 'mobile' ? `${net.generation || 'Mobile'} · ${net.operator || 'opérateur inconnu'}` : 'Connecté';
    mark('net', 'ok', kind);

    // 2. Signal
    update('signal', { status: 'run' });
    await sleep(300);
    if (net.type === 'wifi' && net.rssi !== undefined) {
      const lvl = net.rssi;
      if (lvl < -78) mark('signal', 'warn', `Faible (${lvl} dBm)`, 'Rapprochez-vous du routeur Wi‑Fi ou évitez les murs épais.');
      else mark('signal', 'ok', `${lvl >= -60 ? 'Excellent' : lvl >= -70 ? 'Bon' : 'Correct'} (${lvl} dBm${net.frequency ? ` · ${net.frequency >= 5000 ? '5 GHz' : '2,4 GHz'}` : ''})`);
    } else if (net.type === 'mobile') {
      const lvl = net.signalLevel ?? -1;
      const dbm = net.signalDbm ? ` (${net.signalDbm} dBm)` : '';
      if (lvl >= 0 && lvl <= 1) mark('signal', 'warn', `Faible${dbm}`, 'Le signal mobile est faible : déplacez-vous près d’une fenêtre ou à l’extérieur.');
      else if (net.generation === '2G') mark('signal', 'warn', `Réseau 2G (EDGE) : très lent${dbm}`, 'Vous êtes en 2G. Vérifiez que la 4G est activée dans Paramètres › Réseaux mobiles › Mode réseau.');
      else if (net.generation === '3G') mark('signal', 'warn', `Réseau 3G${dbm}`, 'La 4G n’est pas disponible ici ou est désactivée dans les réglages du réseau mobile.');
      else mark('signal', 'ok', lvl >= 0 ? `${['Très faible', 'Faible', 'Moyen', 'Bon', 'Excellent'][lvl]}${dbm}` : 'Signal mobile disponible');
    } else mark('signal', 'ok', 'Non applicable');

    // 3. Internet
    update('internet', { status: 'run' });
    const cf = await Native.tcpPing('1.1.1.1', 443, 4, 3000);
    if (cf.received === 0) {
      mark(
        'internet',
        'fail',
        'Aucune réponse d’Internet',
        net.type === 'mobile' ? 'Votre forfait est peut-être épuisé : vérifiez votre solde auprès de l’opérateur.' : 'Le Wi‑Fi n’a pas accès à Internet : redémarrez le routeur.'
      );
    } else if (!net.validated) {
      mark('internet', 'warn', 'Connecté, mais Android signale un accès limité', 'Une page de connexion (portail Wi‑Fi) ou un forfait épuisé peut bloquer l’accès.');
    } else if (cf.loss > 0.25) {
      mark('internet', 'warn', `Instable : ${Math.round(cf.loss * 100)} % de perte · ${fmtMs(cf.median)} ms`, 'La connexion perd des paquets : les appels et vidéos peuvent couper.');
    } else {
      mark('internet', cf.median > 250 ? 'warn' : 'ok', `${fmtMs(cf.median)} ms de latence`, cf.median > 250 ? 'La latence est élevée : le réseau est saturé ou le signal est faible.' : undefined);
    }

    // 4. DNS
    update('dns', { status: 'run' });
    const host = `www.wikipedia.org`;
    const dns = await Native.resolve(host);
    if (!dns.ok) mark('dns', 'fail', 'Les adresses ne sont pas résolues', 'Essayez un DNS privé (Paramètres › Connexions › DNS privé : one.one.one.one).');
    else if (dns.ms > 400) mark('dns', 'warn', `Lent : ${fmtMs(dns.ms)} ms`, 'Le DNS de l’opérateur est lent : un DNS privé (one.one.one.one ou dns.google) accélère l’ouverture des pages.');
    else mark('dns', 'ok', `${fmtMs(dns.ms)} ms${net.privateDns ? ` · DNS privé ${net.privateDnsName ?? 'actif'}` : ''}`);

    // 5. Services
    update('services', { status: 'run' });
    const results = await Promise.all(
      SERVICES.map((s) =>
        Native!.tcpPing(s.host, 443, 3, 3500).then((r) => {
          setServices((list) => list.map((x) => (x.host === s.host ? { ...x, result: r } : x)));
          return r;
        })
      )
    );
    const down = SERVICES.filter((_, i) => results[i].received === 0).map((s) => s.name);
    const slow = SERVICES.filter((_, i) => results[i].received > 0 && results[i].median > 300).map((s) => s.name);
    if (down.length === SERVICES.length) mark('services', 'fail', 'Aucun service ne répond');
    else if (down.length) mark('services', 'warn', `Inaccessible : ${down.join(', ')}`, `${down.join(', ')} ne répond pas : le service est peut-être bloqué ou en panne.`);
    else if (slow.length) mark('services', 'warn', `Lent : ${slow.join(', ')}`);
    else mark('services', 'ok', 'Tous les services répondent rapidement');

    // 6. Restrictions
    update('limits', { status: 'run' });
    await sleep(250);
    const st = useSettings.getState();
    const fw = Native.firewallStatus();
    const plan = useData.getState().plan;
    const issues: string[] = [];
    if (plan && plan.used >= plan.volume) issues.push('forfait épuisé');
    if (fw.active && (fw.mode === 'economy' || fw.mode === 'cutoff')) {
      issues.push(fw.mode === 'economy' ? 'mode Éco actif' : 'coupure du forfait');
      advice.current.push('Le mode Éco de MMega bloque les applications non essentielles sur les données mobiles.');
    }
    if (net.dataSaver === 'on') {
      issues.push('Économiseur de données Android');
      advice.current.push('L’économiseur de données Android bloque les applications en arrière-plan (notifications retardées).');
    }
    if (net.vpn && !fw.active) {
      issues.push('VPN actif');
      advice.current.push('Un VPN est actif : il peut ralentir la connexion.');
    }
    if (st.firewall.enabled && Object.keys(st.firewall.rules).length) issues.push(`${Object.keys(st.firewall.rules).length} app(s) bloquée(s) par le pare-feu`);
    if (issues.length) mark('limits', 'warn', issues.join(' · '));
    else mark('limits', 'ok', 'Aucune restriction');

    const tone = worst as 'ok' | 'warn' | 'fail';
    setVerdict({
      tone,
      title: tone === 'ok' ? 'Tout fonctionne correctement' : tone === 'warn' ? 'Votre connexion peut être améliorée' : 'Un problème bloque votre connexion',
      advice: advice.current.length ? advice.current : ['Si une application reste lente, le problème vient probablement de ses serveurs.'],
    });
    setRunning(false);
  };

  const verdictColor = verdict?.tone === 'ok' ? t.success : verdict?.tone === 'warn' ? t.warning : t.danger;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: NAV_HEIGHT + 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <HeroBackground />
        <IconBadge name="pulse" color="#fff" bg="rgba(255,255,255,0.2)" size={50} />
        <Text style={styles.heroTitle}>Pourquoi mon Internet est lent ?</Text>
        <Text style={styles.heroText}>MMega vérifie le réseau, le signal, le DNS et vos applications, puis vous dit quoi faire.</Text>
        <PrimaryButton label={running ? 'Analyse en cours…' : verdict ? 'Relancer le diagnostic' : 'Lancer le diagnostic'} tone="light" icon="target" onPress={run} disabled={running} style={{ marginTop: 16, alignSelf: 'stretch' }} />
      </View>

      {verdict ? (
        <Animated.View entering={FadeInDown.duration(380)} style={[styles.card, { backgroundColor: t.surface, borderLeftWidth: 5, borderLeftColor: verdictColor }]}>
          <Text style={[styles.verdict, { color: verdictColor }]}>{verdict.title}</Text>
          {verdict.advice.map((a, i) => (
            <View key={i} style={styles.adviceRow}>
              <View style={[styles.bullet, { backgroundColor: verdictColor }]} />
              <Text style={[styles.adviceText, { color: t.text }]}>{a}</Text>
            </View>
          ))}
        </Animated.View>
      ) : null}

      <View style={[styles.card, { backgroundColor: t.surface }]}>
        {steps.map((s, i) => (
          <View key={s.id}>
            <StepRow step={s} index={i} />
            {s.id === 'services' && s.status !== 'wait' ? (
              <View style={styles.services}>
                {services.map((sv) => {
                  const r = sv.result;
                  const ms = r ? (r.received ? r.median : -1) : null;
                  return (
                    <View key={sv.host} style={[styles.service, { backgroundColor: t.bg }]}>
                      <Text style={[styles.serviceName, { color: t.text }]}>{sv.name}</Text>
                      {ms === null ? (
                        <ActivityIndicator size="small" color={t.accent} />
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <View style={[styles.dot, { backgroundColor: latencyColor(ms, t) }]} />
                          <Text style={[styles.serviceMs, { color: latencyColor(ms, t) }]}>{ms < 0 ? 'Échec' : `${fmtMs(ms)} ms`}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <PingTool />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: 12, marginTop: 8, borderRadius: 28, padding: 20, overflow: 'hidden' },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 14, letterSpacing: -0.4 },
  heroText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20, marginTop: 6 },
  card: { marginHorizontal: 12, marginTop: 12, borderRadius: 26, padding: 16, overflow: 'hidden' },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  small: { fontSize: 12.5 },
  step: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  stepIcon: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: 15.5, fontWeight: '600' },
  stepDetail: { fontSize: 13, marginTop: 2 },
  services: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 50, paddingBottom: 6 },
  service: { width: '47%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  serviceName: { fontSize: 13.5, fontWeight: '600' },
  serviceMs: { fontSize: 12.5, fontWeight: '700' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  verdict: { fontSize: 18, fontWeight: '800' },
  adviceRow: { flexDirection: 'row', marginTop: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8, marginRight: 10 },
  adviceText: { flex: 1, fontSize: 14.5, lineHeight: 21 },
  input: { flexDirection: 'row', alignItems: 'center', borderRadius: 22, paddingLeft: 14, marginTop: 12, height: 50 },
  inputText: { flex: 1, fontSize: 16, marginLeft: 8, paddingVertical: 0 },
  pingBtn: { height: 40, paddingHorizontal: 20, borderRadius: 20, justifyContent: 'center', marginRight: 5, minWidth: 74, alignItems: 'center' },
  pingBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  pingStats: { flexDirection: 'row' },
  pingValue: { fontSize: 16, fontWeight: '800', marginTop: 2 },
});
