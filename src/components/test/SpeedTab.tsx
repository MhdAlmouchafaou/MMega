import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { activateKeepAwakeAsync, deactivateKeepAwake } from '../../lib/keepAwake';
import { Native, type SpeedEvent, type SpeedResult } from '../../../modules/mmega-core';
import { useData } from '../../store/data';
import { useNav } from '../../store/nav';
import { useSettings } from '../../store/settings';
import { toast } from '../../store/ui';
import { useTheme } from '../../theme';
import { fmtBytes, fmtMbps, fmtMs } from '../../utils/format';
import { NAV_HEIGHT } from '../BottomNav';
import { Gauge, Sparkline } from '../charts';
import { Chips } from '../blocks';
import { Icon, type IconName } from '../Icon';
import { haptic } from '../ui';

type Phase = 'idle' | 'meta' | 'ping' | 'download' | 'upload' | 'done';

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Prêt',
  meta: 'Recherche du serveur…',
  ping: 'Mesure de la latence…',
  download: 'Réception',
  upload: 'Envoi',
  done: 'Terminé',
};

export function grade(r: Pick<SpeedResult, 'download' | 'upload' | 'ping'>) {
  const score = Math.min(r.download / 25, 1) * 55 + Math.min(r.upload / 10, 1) * 25 + Math.max(0, 1 - Math.max(0, r.ping - 20) / 180) * 20;
  if (score >= 85) return { label: 'Excellente', color: '#17A665' };
  if (score >= 60) return { label: 'Bonne', color: '#3F9C3A' };
  if (score >= 38) return { label: 'Moyenne', color: '#EE9A2E' };
  return { label: 'Faible', color: '#E5484D' };
}

export function capabilities(r: Pick<SpeedResult, 'download' | 'upload' | 'ping' | 'jitter'>) {
  const list: { icon: IconName; label: string; ok: boolean; hint: string }[] = [
    { icon: 'globe', label: 'Navigation et réseaux sociaux', ok: r.download >= 1.5, hint: '≥ 1,5 Mbps' },
    { icon: 'phone', label: 'Appels WhatsApp audio', ok: r.download >= 0.3 && r.upload >= 0.3 && r.ping < 300, hint: 'stable < 300 ms' },
    { icon: 'video', label: 'Appels vidéo', ok: r.download >= 2 && r.upload >= 1.5 && r.ping < 150 && r.jitter < 40, hint: '≥ 2 / 1,5 Mbps' },
    { icon: 'film', label: 'Vidéo HD (720p–1080p)', ok: r.download >= 5, hint: '≥ 5 Mbps' },
    { icon: 'hd', label: 'Vidéo 4K', ok: r.download >= 25, hint: '≥ 25 Mbps' },
    { icon: 'target', label: 'Jeux en ligne', ok: r.ping < 60 && r.jitter < 20 && r.download >= 3, hint: '< 60 ms' },
  ];
  return list;
}

function GoButton({ onPress, size }: { onPress: () => void; size: number }) {
  const t = useTheme();
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })), -1);
  }, [pulse]);
  const ring1 = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - pulse.value), transform: [{ scale: 1 + pulse.value * 0.45 }] }));
  const ring2 = useAnimatedStyle(() => {
    const p = (pulse.value + 0.5) % 1;
    return { opacity: 0.45 * (1 - p), transform: [{ scale: 1 + p * 0.45 }] };
  });
  return (
    <View style={{ width: size * 1.5, height: size * 1.5, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: t.accent }, ring1]} />
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: t.accentSoft }, ring2]} />
      <Pressable
        onPress={() => {
          haptic();
          onPress();
        }}
        style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', elevation: 10, shadowColor: t.accent }}
      >
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="go" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0" stopColor={t.hero[0]} />
              <Stop offset="1" stopColor={t.hero[2]} />
            </LinearGradient>
          </Defs>
          <Rect width={size} height={size} fill="url(#go)" />
        </Svg>
        <Text style={styles.goText}>GO</Text>
        <Text style={styles.goSub}>Lancer le test</Text>
      </Pressable>
    </View>
  );
}

function Metric({ icon, label, value, unit, color, active, done }: { icon: IconName; label: string; value: string; unit: string; color: string; active: boolean; done: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.metric, { backgroundColor: active ? t.accentTrack : t.surface }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon name={icon} size={14} color={color} strokeWidth={2.4} />
        <Text style={[styles.metricLabel, { color: t.textSecondary }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.metricValue, { color: done || active ? t.text : t.textTertiary }]} numberOfLines={1}>
        {value}
        <Text style={[styles.metricUnit, { color: t.textSecondary }]}> {unit}</Text>
      </Text>
    </View>
  );
}

export function SpeedTab() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const light = useSettings((s) => s.lightTest);
  const setSettings = useSettings((s) => s.set);
  const addRecord = useSettings((s) => s.addRecord);
  const net = useData((s) => s.net);
  const autoStart = useNav((s) => s.autoStart);
  const [phase, setPhase] = useState<Phase>('idle');
  const [live, setLive] = useState(0);
  const [ping, setPing] = useState<number | null>(null);
  const [result, setResult] = useState<SpeedResult | null>(null);
  const [server, setServer] = useState<SpeedEvent | null>(null);
  const [down, setDown] = useState<number | null>(null);
  const [up, setUp] = useState<number | null>(null);
  const [samples, setSamples] = useState<{ download: number[]; upload: number[] }>({ download: [], upload: [] });
  const [used, setUsed] = useState(0);
  const value = useSharedValue(0);
  const running = phase !== 'idle' && phase !== 'done';

  const start = useCallback(async () => {
    if (!Native) return;
    const info = await useData.getState().refreshNet();
    if (info && !info.connected) {
      toast('Aucune connexion Internet');
      return;
    }
    setPhase('meta');
    setResult(null);
    setPing(null);
    setDown(null);
    setUp(null);
    setSamples({ download: [], upload: [] });
    setUsed(0);
    value.value = 0;
    activateKeepAwakeAsync();
    let current: Phase = 'meta';
    const sub = Native.addListener('onSpeedTest', (e) => {
      if (e.phase !== current && e.phase !== 'done') {
        current = e.phase;
        setPhase(e.phase);
        if (e.phase === 'download' || e.phase === 'upload') value.value = withTiming(0, { duration: 200 });
      }
      if (e.phase === 'meta') setServer(e);
      if (e.phase === 'ping' && e.ping) setPing(e.ping);
      if ((e.phase === 'download' || e.phase === 'upload') && e.mbps !== undefined) {
        const mbps = e.mbps;
        value.value = withTiming(mbps, { duration: 240, easing: Easing.out(Easing.quad) });
        setLive(mbps);
        setSamples((s) => ({ ...s, [e.phase]: [...s[e.phase as 'download' | 'upload'], mbps].slice(-80) }));
        if (e.bytes) setUsed(e.bytes);
      }
    });
    try {
      const r = await Native.speedTest(light);
      if (r.cancelled) {
        setPhase('idle');
        value.value = withTiming(0);
        return;
      }
      setResult(r);
      setDown(r.download);
      setUp(r.upload);
      setPing(r.ping);
      setUsed(r.dataUsed);
      setPhase('done');
      value.value = withTiming(r.download, { duration: 600 });
      haptic();
      const n = useData.getState().net;
      addRecord({
        id: Date.now().toString(36),
        at: Date.now(),
        ping: r.ping,
        jitter: r.jitter,
        download: r.download,
        upload: r.upload,
        loadedPing: r.loadedPing,
        dataUsed: r.dataUsed,
        network: n?.type ?? 'other',
        isp: r.isp,
        ip: r.ip,
        city: r.city,
        colo: r.colo,
        light,
        generation: n?.generation,
        operator: n?.type === 'mobile' ? n.operator : undefined,
      });
    } catch {
      toast('Le test a échoué. Vérifiez votre connexion.');
      setPhase('idle');
      value.value = withTiming(0);
    } finally {
      sub.remove();
      deactivateKeepAwake();
    }
  }, [light, value, addRecord]);

  useEffect(() => {
    if (autoStart > useNav.getState().autoHandled) {
      useNav.setState({ autoHandled: autoStart });
      if (!running) start();
    }
  }, [autoStart, running, start]);

  useEffect(() => () => Native?.cancelSpeedTest(), []);

  // Keep the down figure visible once the upload starts.
  useEffect(() => {
    if (phase === 'upload' && samples.download.length && down === null) {
      const d = samples.download;
      setDown(d.slice(Math.floor(d.length * 0.3)).reduce((a, b) => a + b, 0) / Math.max(1, d.length - Math.floor(d.length * 0.3)));
    }
  }, [phase, samples.download, down]);

  const gaugeSize = Math.min(width - 60, 330);
  const g = result ? grade(result) : null;
  const shown = phase === 'done' && result ? result.download : live;
  const color = phase === 'upload' ? t.wifi : t.accent;
  const isp = result?.isp || server?.isp;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: NAV_HEIGHT + 40 }} showsVerticalScrollIndicator={false}>
      <View style={styles.top}>
        <View style={{ width: gaugeSize, height: gaugeSize * 0.86, alignItems: 'center', justifyContent: 'center' }}>
          {phase === 'idle' ? (
            <Animated.View key="go" entering={ZoomIn.duration(300)} exiting={FadeOut.duration(150)}>
              <GoButton size={Math.round(gaugeSize * 0.48)} onPress={start} />
            </Animated.View>
          ) : (
            <Animated.View key="gauge" entering={FadeIn.duration(350)} style={{ alignItems: 'center' }}>
              <Gauge size={gaugeSize} value={value} colors={phase === 'upload' ? ['#13A9C4', '#5BE0F0'] : [t.hero[0], t.hero[2]]} active={running} />
              <View style={[styles.center, { top: gaugeSize * 0.56 }]}>
                <Text style={[styles.centerValue, { color: t.text }]}>{phase === 'ping' || phase === 'meta' ? (ping ? fmtMs(ping) : '…') : fmtMbps(shown)}</Text>
                <Text style={[styles.centerUnit, { color: t.textSecondary }]}>{phase === 'ping' || phase === 'meta' ? 'ms' : 'Mbps'}</Text>
              </View>
            </Animated.View>
          )}
        </View>
        <View style={styles.phaseRow}>
          {running ? <Icon name={phase === 'upload' ? 'upload' : phase === 'download' ? 'download' : 'pulse'} size={18} color={color} strokeWidth={2.2} /> : null}
          <Text style={[styles.phase, { color: running ? color : t.textSecondary }]}>{phase === 'done' && g ? `Connexion ${g.label.toLowerCase()}` : PHASE_LABEL[phase]}</Text>
        </View>
        {isp ? (
          <Animated.Text entering={FadeIn} style={[styles.server, { color: t.textTertiary }]} numberOfLines={1}>
            {isp}
            {server?.colo ? ` · serveur ${server.colo}` : ''}
            {server?.city ? ` · ${server.city}` : ''}
          </Animated.Text>
        ) : null}
      </View>

      <View style={styles.metrics}>
        <Metric icon="pulse" label="Ping" value={ping !== null ? fmtMs(ping) : '—'} unit="ms" color={t.warning} active={phase === 'ping'} done={ping !== null} />
        <Metric icon="layers" label="Gigue" value={result ? fmtMs(result.jitter) : '—'} unit="ms" color={t.textSecondary} active={false} done={!!result} />
        <Metric icon="arrowDown" label="Réception" value={phase === 'download' ? fmtMbps(live) : down !== null ? fmtMbps(down) : '—'} unit="Mbps" color={t.accent} active={phase === 'download'} done={down !== null} />
        <Metric icon="arrowUp" label="Envoi" value={phase === 'upload' ? fmtMbps(live) : up !== null ? fmtMbps(up) : '—'} unit="Mbps" color={t.wifi} active={phase === 'upload'} done={up !== null} />
      </View>

      {samples.download.length > 2 ? (
        <Animated.View entering={FadeInDown.duration(300)} style={[styles.card, { backgroundColor: t.surface }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.cardTitle, { color: t.text }]}>Courbe du débit</Text>
            <View style={{ flex: 1 }} />
            <Text style={[styles.small, { color: t.textTertiary }]}>Données utilisées : {fmtBytes(used)}</Text>
          </View>
          <View style={{ marginTop: 10 }}>
            <Sparkline data={samples.download} width={width - 56} height={58} color={t.accent} max={Math.max(...samples.download, ...samples.upload, 1)} />
          </View>
          {samples.upload.length > 2 ? (
            <View style={{ marginTop: 6 }}>
              <Sparkline data={samples.upload} width={width - 56} height={46} color={t.wifi} max={Math.max(...samples.download, ...samples.upload, 1)} />
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      {phase === 'done' && result ? (
        <Animated.View entering={FadeInDown.delay(120).duration(380)}>
          <View style={[styles.card, { backgroundColor: t.surface }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.grade, { backgroundColor: g!.color }]}>
                <Text style={styles.gradeText}>{g!.label}</Text>
              </View>
              <View style={{ flex: 1 }} />
              <Pressable onPress={start} style={[styles.again, { backgroundColor: t.accentTrack }]}>
                <Icon name="refresh" size={17} color={t.accent} strokeWidth={2.2} />
                <Text style={[styles.againText, { color: t.accent }]}>Relancer</Text>
              </Pressable>
            </View>
            <Text style={[styles.cardTitle, { color: t.text, marginTop: 16 }]}>Ce que votre connexion permet</Text>
            {capabilities(result).map((c) => (
              <View key={c.label} style={styles.cap}>
                <Icon name={c.icon} size={20} color={c.ok ? t.success : t.textTertiary} strokeWidth={1.9} />
                <Text style={[styles.capLabel, { color: c.ok ? t.text : t.textTertiary }]}>{c.label}</Text>
                <Icon name={c.ok ? 'checkCircle' : 'close'} size={19} color={c.ok ? t.success : t.danger} strokeWidth={2.1} />
              </View>
            ))}
            <View style={[styles.loaded, { backgroundColor: t.bg }]}>
              <Text style={[styles.small, { color: t.textSecondary }]}>Latence en charge</Text>
              <Text style={[styles.loadedValue, { color: result.loadedPing - result.ping > 150 ? t.danger : result.loadedPing - result.ping > 60 ? t.warning : t.success }]}>
                {result.loadedPing > 0 ? `${fmtMs(result.loadedPing)} ms (+${fmtMs(Math.max(0, result.loadedPing - result.ping))})` : '—'}
              </Text>
              <Text style={[styles.small, { color: t.textTertiary, marginTop: 4, lineHeight: 17 }]}>
                {result.loadedPing - result.ping > 150
                  ? 'Votre réseau sature quand il est chargé : les appels peuvent couper pendant un téléchargement.'
                  : 'Votre réseau reste réactif même quand il est chargé.'}
              </Text>
            </View>
          </View>
        </Animated.View>
      ) : null}

      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <Text style={[styles.cardTitle, { color: t.text }]}>Type de test</Text>
        <Text style={[styles.small, { color: t.textSecondary, marginTop: 2, marginBottom: 10 }]}>
          {light ? 'Le test léger consomme environ 15 Mo : idéal sur les données mobiles.' : 'Le test complet est plus précis mais peut consommer 100 à 500 Mo sur une connexion rapide.'}
        </Text>
        <Chips
          items={[
            { key: 'light', label: 'Léger · ~15 Mo' },
            { key: 'full', label: 'Complet' },
          ]}
          value={light ? 'light' : 'full'}
          onChange={(v) => !running && setSettings({ lightTest: v === 'light' })}
          style={{ paddingHorizontal: 0 }}
        />
        {net?.type === 'mobile' && !light ? (
          <Text style={[styles.small, { color: t.warning, marginTop: 10 }]}>Vous êtes sur les données mobiles : préférez le test léger.</Text>
        ) : null}
        {running ? (
          <Pressable
            onPress={() => {
              Native?.cancelSpeedTest();
            }}
            style={[styles.stop, { backgroundColor: t.chip }]}
          >
            <Icon name="stop" size={16} color={t.danger} />
            <Text style={[styles.againText, { color: t.danger }]}>Arrêter le test</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'center', paddingTop: 10 },
  ring: { position: 'absolute', borderWidth: 2 },
  goText: { color: '#fff', fontSize: 44, fontWeight: '800', letterSpacing: 2 },
  goSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600', marginTop: -2 },
  center: { position: 'absolute', alignSelf: 'center', alignItems: 'center' },
  centerValue: { fontSize: 46, fontWeight: '800', letterSpacing: -1.5 },
  centerUnit: { fontSize: 14, fontWeight: '700', marginTop: -4 },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  phase: { fontSize: 17, fontWeight: '700' },
  server: { fontSize: 12.5, marginTop: 4, paddingHorizontal: 30 },
  metrics: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 18 },
  metric: { flex: 1, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 10 },
  metricLabel: { fontSize: 11.5, fontWeight: '600' },
  metricValue: { fontSize: 19, fontWeight: '800', marginTop: 4, letterSpacing: -0.4 },
  metricUnit: { fontSize: 10.5, fontWeight: '600' },
  card: { marginHorizontal: 12, marginTop: 12, borderRadius: 26, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  small: { fontSize: 12.5 },
  grade: { paddingHorizontal: 14, height: 32, borderRadius: 16, justifyContent: 'center' },
  gradeText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  again: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 18 },
  againText: { fontSize: 14, fontWeight: '700' },
  cap: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 12 },
  capLabel: { flex: 1, fontSize: 15 },
  loaded: { marginTop: 12, borderRadius: 18, padding: 14 },
  loadedValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  stop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 22, marginTop: 14 },
});
