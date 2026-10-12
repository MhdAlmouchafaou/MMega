import { FlashList } from '@shopify/flash-list';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSettings, type SpeedRecord } from '../../store/settings';
import { useUI } from '../../store/ui';
import { useTheme } from '../../theme';
import { fmtBytes, fmtMbps, fmtMs, relative } from '../../utils/format';
import { NAV_HEIGHT } from '../BottomNav';
import { EmptyState } from '../EmptyState';
import { Icon } from '../Icon';
import { grade } from './SpeedTab';

function RecordRow({ r }: { r: SpeedRecord }) {
  const t = useTheme();
  const g = grade(r);
  const remove = useSettings((s) => s.removeRecord);
  const wifi = r.network === 'wifi';
  return (
    <Pressable
      onLongPress={() =>
        useUI.getState().showSheet({
          title: `Test du ${new Date(r.at).toLocaleDateString('fr-FR')}`,
          subtitle: r.isp,
          details: [
            { label: 'Réception', value: `${fmtMbps(r.download)} Mbps` },
            { label: 'Envoi', value: `${fmtMbps(r.upload)} Mbps` },
            { label: 'Ping · gigue', value: `${fmtMs(r.ping)} ms · ${fmtMs(r.jitter)} ms` },
            { label: 'Latence en charge', value: r.loadedPing ? `${fmtMs(r.loadedPing)} ms` : '—' },
            { label: 'Données utilisées', value: fmtBytes(r.dataUsed) },
            ...(r.ip ? [{ label: 'IP publique', value: r.ip }] : []),
          ],
          actions: [{ label: 'Supprimer ce test', icon: 'trash', destructive: true, onPress: () => remove(r.id) }],
        })
      }
      android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
      style={[styles.row, { backgroundColor: t.surface }]}
    >
      <View style={styles.rowHead}>
        <View style={[styles.net, { backgroundColor: wifi ? t.wifiSoft : t.mobileSoft }]}>
          <Icon name={wifi ? 'wifi' : 'signal'} size={15} color={wifi ? t.wifi : t.mobile} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
            {wifi ? 'Wi‑Fi' : [r.generation, r.operator].filter(Boolean).join(' · ') || 'Mobile'}
            {r.isp ? <Text style={{ color: t.textTertiary, fontWeight: '500' }}> · {r.isp}</Text> : null}
          </Text>
          <Text style={[styles.when, { color: t.textTertiary }]}>
            {relative(r.at)}
            {r.light ? ' · test léger' : ''} · {fmtBytes(r.dataUsed)}
          </Text>
        </View>
        <View style={[styles.grade, { backgroundColor: `${g.color}22` }]}>
          <Text style={[styles.gradeText, { color: g.color }]}>{g.label}</Text>
        </View>
      </View>
      <View style={styles.values}>
        <View style={styles.value}>
          <Text style={[styles.vLabel, { color: t.textSecondary }]}>↓ Réception</Text>
          <Text style={[styles.vNum, { color: t.text }]}>
            {fmtMbps(r.download)} <Text style={[styles.vUnit, { color: t.textSecondary }]}>Mbps</Text>
          </Text>
        </View>
        <View style={styles.value}>
          <Text style={[styles.vLabel, { color: t.textSecondary }]}>↑ Envoi</Text>
          <Text style={[styles.vNum, { color: t.text }]}>
            {fmtMbps(r.upload)} <Text style={[styles.vUnit, { color: t.textSecondary }]}>Mbps</Text>
          </Text>
        </View>
        <View style={styles.value}>
          <Text style={[styles.vLabel, { color: t.textSecondary }]}>Ping</Text>
          <Text style={[styles.vNum, { color: t.text }]}>
            {fmtMs(r.ping)} <Text style={[styles.vUnit, { color: t.textSecondary }]}>ms</Text>
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function HistoryTab() {
  const t = useTheme();
  const history = useSettings((s) => s.history);
  const clear = useSettings((s) => s.clearHistory);
  const stats = useMemo(() => {
    if (!history.length) return null;
    const avg = (k: 'download' | 'upload' | 'ping') => history.reduce((s, r) => s + r[k], 0) / history.length;
    const best = history.reduce((b, r) => (r.download > b.download ? r : b), history[0]);
    return { down: avg('download'), up: avg('upload'), ping: avg('ping'), best: best.download, used: history.reduce((s, r) => s + r.dataUsed, 0) };
  }, [history]);

  const header = stats ? (
    <View style={[styles.summary, { backgroundColor: t.surface }]}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.vLabel, { color: t.textSecondary }]}>Moyenne ↓</Text>
          <Text style={[styles.sNum, { color: t.text }]}>{fmtMbps(stats.down)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.vLabel, { color: t.textSecondary }]}>Moyenne ↑</Text>
          <Text style={[styles.sNum, { color: t.text }]}>{fmtMbps(stats.up)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.vLabel, { color: t.textSecondary }]}>Record ↓</Text>
          <Text style={[styles.sNum, { color: t.accent }]}>{fmtMbps(stats.best)}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
        <Text style={[styles.when, { color: t.textTertiary, flex: 1 }]}>
          {history.length} tests · {fmtBytes(stats.used)} utilisés · appui long pour les détails
        </Text>
        <Text
          onPress={() =>
            useUI.getState().showConfirm({ title: 'Effacer l’historique ?', message: 'Tous les tests enregistrés seront supprimés.', confirmLabel: 'Effacer', destructive: true, onConfirm: clear })
          }
          style={{ color: t.danger, fontWeight: '700', fontSize: 13.5 }}
        >
          Effacer
        </Text>
      </View>
    </View>
  ) : null;

  return (
    <FlashList
      data={history}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={header}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: NAV_HEIGHT + 40 }}
      ListEmptyComponent={<EmptyState title="Aucun test pour l’instant" text="Vos tests de débit apparaîtront ici pour comparer vos réseaux." />}
      renderItem={({ item }) => <RecordRow r={item} />}
    />
  );
}

const styles = StyleSheet.create({
  summary: { marginHorizontal: 12, marginBottom: 10, borderRadius: 26, padding: 16 },
  sNum: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  row: { marginHorizontal: 12, marginBottom: 10, borderRadius: 24, padding: 14, overflow: 'hidden' },
  rowHead: { flexDirection: 'row', alignItems: 'center' },
  net: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700' },
  when: { fontSize: 12, marginTop: 1 },
  grade: { paddingHorizontal: 10, height: 26, borderRadius: 13, justifyContent: 'center' },
  gradeText: { fontSize: 12, fontWeight: '800' },
  values: { flexDirection: 'row', marginTop: 12 },
  value: { flex: 1 },
  vLabel: { fontSize: 12, fontWeight: '600' },
  vNum: { fontSize: 20, fontWeight: '800', marginTop: 2, letterSpacing: -0.4 },
  vUnit: { fontSize: 11.5, fontWeight: '600' },
});
