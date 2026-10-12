import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { openUsageAccess } from '../../lib/actions';
import { useData } from '../../store/data';
import { useTheme } from '../../theme';
import { dayShort, fmtBytes, fmtDate } from '../../utils/format';
import { NAV_HEIGHT } from '../BottomNav';
import { BarChart, MiniBars } from '../charts';
import { Chips, PermissionCard } from '../blocks';

type Range = '7' | '14' | '30';

export function Stats() {
  const t = useTheme();
  const access = useData((s) => s.access);
  const daily = useData((s) => s.daily);
  const hourly = useData((s) => s.hourly);
  const [range, setRange] = useState<Range>('7');
  const [selected, setSelected] = useState(-1);

  const days = useMemo(() => daily.slice(-Number(range)), [daily, range]);
  const data = useMemo(
    () =>
      days.map((d, i) => ({
        key: String(d.start),
        label: range === '30' ? (i % 5 === 4 || i === days.length - 1 ? String(new Date(d.start).getDate()) : '') : range === '14' ? String(new Date(d.start).getDate()) : dayShort(d.start),
        mobile: d.mobile,
        wifi: d.wifi,
      })),
    [days, range]
  );
  const totalMobile = days.reduce((s, d) => s + d.mobile, 0);
  const totalWifi = days.reduce((s, d) => s + d.wifi, 0);
  const avg = days.length ? (totalMobile + totalWifi) / days.length : 0;
  const peak = days.reduce((best, d) => (d.mobile + d.wifi > best.mobile + best.wifi ? d : best), days[0] ?? { start: 0, mobile: 0, wifi: 0 });
  const sel = selected >= 0 ? days[selected] : null;
  const currentHour = new Date().getHours();
  const nightMobile = hourly.slice(0, 6).reduce((s, v) => s + v, 0);

  if (!access)
    return (
      <ScrollView contentContainerStyle={{ paddingTop: 6 }}>
        <PermissionCard icon="chart" title="Statistiques détaillées" text="Autorisez l’accès aux statistiques d’utilisation pour afficher vos graphiques de consommation." action="Autoriser l’accès" onPress={openUsageAccess} />
      </ScrollView>
    );

  return (
    <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: NAV_HEIGHT + 40 }} showsVerticalScrollIndicator={false}>
      <Chips
        items={[
          { key: '7', label: '7 jours' },
          { key: '14', label: '14 jours' },
          { key: '30', label: '30 jours' },
        ]}
        value={range}
        onChange={(r) => {
          setSelected(-1);
          setRange(r);
        }}
      />
      <Animated.View entering={FadeInDown.duration(360)} style={[styles.card, { backgroundColor: t.surface }]}>
        <Animated.View key={sel ? sel.start : 'total'} entering={FadeIn.duration(220)}>
          <Text style={[styles.caption, { color: t.textSecondary }]}>{sel ? fmtDate(sel.start) : `Total sur ${range} jours`}</Text>
          <Text style={[styles.big, { color: t.text }]}>{fmtBytes(sel ? sel.mobile + sel.wifi : totalMobile + totalWifi)}</Text>
          <View style={styles.split}>
            <View style={[styles.dot, { backgroundColor: t.mobile }]} />
            <Text style={[styles.splitText, { color: t.textSecondary }]}>Mobile {fmtBytes(sel ? sel.mobile : totalMobile)}</Text>
            <View style={[styles.dot, { backgroundColor: t.wifi, marginLeft: 14 }]} />
            <Text style={[styles.splitText, { color: t.textSecondary }]}>Wi‑Fi {fmtBytes(sel ? sel.wifi : totalWifi)}</Text>
          </View>
        </Animated.View>
        <BarChart key={range} data={data} height={160} selected={selected} onSelect={setSelected} style={{ marginTop: 18 }} />
      </Animated.View>

      <View style={styles.tiles}>
        <View style={[styles.tile, { backgroundColor: t.surface }]}>
          <Text style={[styles.tileLabel, { color: t.textSecondary }]}>Moyenne / jour</Text>
          <Text style={[styles.tileValue, { color: t.text }]}>{fmtBytes(avg)}</Text>
        </View>
        <View style={[styles.tile, { backgroundColor: t.surface }]}>
          <Text style={[styles.tileLabel, { color: t.textSecondary }]}>Jour record</Text>
          <Text style={[styles.tileValue, { color: t.text }]}>{peak ? fmtBytes(peak.mobile + peak.wifi) : '—'}</Text>
          {peak?.start ? <Text style={[styles.tileSub, { color: t.textTertiary }]}>{fmtDate(peak.start)}</Text> : null}
        </View>
      </View>

      <Animated.View entering={FadeInDown.delay(120).duration(360)} style={[styles.card, { backgroundColor: t.surface }]}>
        <Text style={[styles.cardTitle, { color: t.text }]}>Données mobiles heure par heure</Text>
        <Text style={[styles.caption, { color: t.textSecondary, marginTop: 2 }]}>Aujourd’hui · {fmtBytes(hourly.reduce((s, v) => s + v, 0))}</Text>
        <View style={{ marginTop: 16 }}>
          <MiniBars data={hourly} height={86} color={t.mobile} highlight={currentHour} />
          <View style={styles.hours}>
            {['0 h', '6 h', '12 h', '18 h', '23 h'].map((h) => (
              <Text key={h} style={[styles.hour, { color: t.textTertiary }]}>
                {h}
              </Text>
            ))}
          </View>
        </View>
        {nightMobile > 5 * 1024 * 1024 ? (
          <View style={[styles.note, { backgroundColor: t.accentTrack }]}>
            <Text style={[styles.noteText, { color: t.accent }]}>
              {fmtBytes(nightMobile)} consommés entre minuit et 6 h, pendant que vous dormiez. Activez « Bloquer quand l’écran est éteint » dans le pare-feu.
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 12, marginTop: 12, borderRadius: 26, padding: 18 },
  caption: { fontSize: 13.5, fontWeight: '600' },
  big: { fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: 2 },
  split: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 6 },
  splitText: { fontSize: 13, fontWeight: '600' },
  tiles: { flexDirection: 'row', gap: 10, marginHorizontal: 12, marginTop: 12 },
  tile: { flex: 1, borderRadius: 24, padding: 16 },
  tileLabel: { fontSize: 13, fontWeight: '600' },
  tileValue: { fontSize: 22, fontWeight: '800', marginTop: 4, letterSpacing: -0.4 },
  tileSub: { fontSize: 12, marginTop: 2 },
  cardTitle: { fontSize: 16.5, fontWeight: '700' },
  hours: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  hour: { fontSize: 11 },
  note: { marginTop: 14, borderRadius: 16, padding: 12 },
  noteText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
