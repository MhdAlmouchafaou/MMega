import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Native } from '../../../modules/mmega-core';
import { requestLocation, requestPhoneState } from '../../lib/actions';
import { useData } from '../../store/data';
import { useTheme } from '../../theme';
import { NAV_HEIGHT } from '../BottomNav';
import { HeroBackground } from '../blocks';
import { Icon } from '../Icon';

function SignalBars({ level, max = 4, color }: { level: number; max?: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 46 }}>
      {Array.from({ length: max }).map((_, i) => (
        <Bar key={i} on={i < level} h={14 + i * 10} color={color} />
      ))}
    </View>
  );
}

function Bar({ on, h, color }: { on: boolean; h: number; color: string }) {
  const style = useAnimatedStyle(() => ({ opacity: withSpring(on ? 1 : 0.25), transform: [{ scaleY: withSpring(on ? 1 : 0.85) }] }), [on]);
  return <Animated.View style={[{ width: 10, height: h, borderRadius: 4, backgroundColor: color, transformOrigin: 'bottom' }, style]} />;
}

function Row({ label, value, last }: { label: string; value?: string | number | null; last?: boolean }) {
  const t = useTheme();
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: t.divider }]}>
      <Text style={[styles.rowLabel, { color: t.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: t.text }]} selectable numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

type Meta = { clientIp?: string; asOrganization?: string; city?: string; country?: string; colo?: string };

const STANDARDS: Record<number, string> = { 1: 'Wi‑Fi (ancien)', 4: 'Wi‑Fi 4 (n)', 5: 'Wi‑Fi 5 (ac)', 6: 'Wi‑Fi 6 (ax)', 7: 'Wi‑Fi 7 (be)' };

export function NetworkTab({ active }: { active: boolean }) {
  const t = useTheme();
  const net = useData((s) => s.net);
  const refreshNet = useData((s) => s.refreshNet);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState(false);

  useEffect(() => {
    if (!active) return;
    refreshNet();
    const id = setInterval(refreshNet, 2500);
    return () => clearInterval(id);
  }, [active, refreshNet]);

  const loadMeta = async () => {
    setMetaError(false);
    try {
      const r = await fetch('https://speed.cloudflare.com/meta');
      setMeta(await r.json());
    } catch {
      setMetaError(true);
    }
  };

  useEffect(() => {
    if (active && !meta) loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, net?.type]);

  const wifi = net?.type === 'wifi';
  const mobile = net?.type === 'mobile';
  const level = wifi ? (net?.wifiLevel ?? 0) : (net?.signalLevel ?? 0);
  const levelLabel = ['Très faible', 'Faible', 'Moyen', 'Bon', 'Excellent'][Math.max(0, Math.min(4, level))];
  const color = level >= 3 ? t.success : level === 2 ? t.warning : t.danger;
  const title = !net?.connected ? 'Hors ligne' : wifi ? net.ssid ?? 'Wi‑Fi' : mobile ? net.operator || 'Données mobiles' : net.type === 'ethernet' ? 'Ethernet' : 'Connecté';
  const sub = wifi
    ? `${net?.frequency ? (net.frequency >= 5900 ? '6 GHz' : net.frequency >= 5000 ? '5 GHz' : '2,4 GHz') : ''}${net?.wifiStandard && STANDARDS[net.wifiStandard] ? ` · ${STANDARDS[net.wifiStandard]}` : ''}`
    : mobile
      ? `${net?.generation || 'Mobile'}${net?.tech ? ` (${net.tech})` : ''}${net?.roaming ? ' · itinérance' : ''}`
      : '';

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: NAV_HEIGHT + 40 }} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.duration(360)} style={styles.hero}>
        <HeroBackground />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <View style={styles.heroBadge}>
              <Icon name={wifi ? 'wifi' : mobile ? 'signal' : 'globe'} size={14} color="#fff" strokeWidth={2.2} />
              <Text style={styles.heroBadgeText}>{wifi ? 'Wi‑Fi' : mobile ? 'Données mobiles' : net?.connected ? 'Réseau' : 'Aucun réseau'}</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={1}>
              {title}
            </Text>
            {sub ? <Text style={styles.heroSub}>{sub}</Text> : null}
            {net?.connected ? (
              <Text style={[styles.heroSub, { marginTop: 8 }]}>
                {net.validated ? '✓ Internet accessible' : '⚠ Accès Internet limité'}
                {net.metered ? ' · facturé' : ' · illimité'}
              </Text>
            ) : null}
          </View>
          {net?.connected && (wifi || mobile) ? (
            <View style={{ alignItems: 'center' }}>
              <SignalBars level={wifi ? Math.min(4, level) : level} color="#fff" />
              <Text style={styles.heroSmall}>{levelLabel}</Text>
              <Text style={styles.heroDbm}>{wifi ? `${net.rssi ?? '—'} dBm` : net.signalDbm ? `${net.signalDbm} dBm` : ''}</Text>
            </View>
          ) : null}
        </View>
      </Animated.View>

      {wifi && !net?.ssid ? (
        <Pressable onPress={async () => (await requestLocation()) && refreshNet()} style={[styles.hint, { backgroundColor: t.accentTrack }]}>
          <Icon name="info" size={18} color={t.accent} />
          <Text style={[styles.hintText, { color: t.accent }]}>Android exige la localisation pour afficher le nom du Wi‑Fi. Toucher pour l’autoriser.</Text>
        </Pressable>
      ) : null}
      {mobile && !net?.generation ? (
        <Pressable onPress={async () => (await requestPhoneState()) && refreshNet()} style={[styles.hint, { backgroundColor: t.accentTrack }]}>
          <Icon name="info" size={18} color={t.accent} />
          <Text style={[styles.hintText, { color: t.accent }]}>Autorisez l’accès à l’état du téléphone pour afficher 3G / 4G / 5G.</Text>
        </Pressable>
      ) : null}

      <Text style={[styles.section, { color: t.tabInactive }]}>Internet</Text>
      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <Row label="Fournisseur" value={meta?.asOrganization ?? (metaError ? 'Indisponible' : '…')} />
        <Row label="IP publique" value={meta?.clientIp ?? (metaError ? '—' : '…')} />
        <Row label="Localisation" value={meta?.city ? `${meta.city}${meta.country ? `, ${meta.country}` : ''}` : null} />
        <Row label="Serveur Cloudflare" value={meta?.colo} last />
      </View>

      <Text style={[styles.section, { color: t.tabInactive }]}>Détails</Text>
      <View style={[styles.card, { backgroundColor: t.surface }]}>
        {wifi ? (
          <>
            <Row label="Vitesse du lien" value={net?.linkSpeed ? `${net.linkSpeed} Mbps` : null} />
            <Row label="Lien montant / descendant" value={net?.txLink && net?.rxLink ? `${net.txLink} / ${net.rxLink} Mbps` : null} />
            <Row label="Fréquence" value={net?.frequency ? `${net.frequency} MHz` : null} />
          </>
        ) : null}
        {mobile ? (
          <>
            <Row label="Opérateur SIM" value={net?.simOperator} />
            <Row label="Technologie" value={net?.tech || net?.generation} />
            <Row label="Signal" value={net?.signalDbm ? `${net.signalDbm} dBm${net.signalAsu ? ` · ASU ${net.signalAsu}` : ''}` : null} />
            <Row label="Pays du réseau" value={net?.countryIso?.toUpperCase()} />
          </>
        ) : null}
        <Row label="Débit estimé" value={net?.downKbps ? `↓ ${(net.downKbps / 1000).toFixed(1).replace('.', ',')} · ↑ ${((net.upKbps ?? 0) / 1000).toFixed(1).replace('.', ',')} Mbps` : null} />
        <Row label="Adresse IPv4" value={net?.ipv4?.join('\n')} />
        <Row label="Adresse IPv6" value={net?.ipv6?.slice(0, 2).join('\n')} />
        <Row label="Passerelle" value={net?.gateway} />
        <Row label="Serveurs DNS" value={net?.dns?.join('\n')} />
        <Row label="DNS privé" value={net?.privateDns ? net.privateDnsName || 'Automatique (actif)' : 'Désactivé'} />
        <Row label="Interface" value={net?.iface ? `${net.iface}${net.mtu ? ` · MTU ${net.mtu}` : ''}` : null} last />
      </View>

      <Text style={[styles.section, { color: t.tabInactive }]}>Système</Text>
      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <Pressable onPress={() => Native?.openSettings('dataSaver')}>
          <Row label="Économiseur de données Android" value={net?.dataSaver === 'on' ? 'Activé' : net?.dataSaver === 'whitelisted' ? 'Activé (MMega autorisé)' : 'Désactivé · toucher pour l’ouvrir'} />
        </Pressable>
        <Row label="Données mobiles" value={net ? (net.mobileDataOn ? 'Activées' : 'Désactivées') : null} />
        <Row label="VPN" value={net ? (net.vpn ? 'Actif' : 'Aucun') : null} />
        <Row label="Mode avion" value={net ? (net.airplane ? 'Activé' : 'Désactivé') : null} last />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: 12, marginTop: 8, borderRadius: 28, padding: 20, overflow: 'hidden' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, height: 26, borderRadius: 13 },
  heroBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 10, letterSpacing: -0.5 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13.5, marginTop: 2 },
  heroSmall: { color: '#fff', fontSize: 12.5, fontWeight: '700', marginTop: 6 },
  heroDbm: { color: 'rgba(255,255,255,0.8)', fontSize: 11.5 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginTop: 10, borderRadius: 18, padding: 14 },
  hintText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  section: { fontSize: 14, fontWeight: '600', marginTop: 22, marginBottom: 8, marginLeft: 26 },
  card: { marginHorizontal: 12, borderRadius: 26, paddingHorizontal: 18, paddingVertical: 4 },
  row: { flexDirection: 'row', paddingVertical: 13, alignItems: 'flex-start' },
  rowLabel: { fontSize: 14.5, flex: 1, marginRight: 12 },
  rowValue: { fontSize: 14.5, fontWeight: '600', textAlign: 'right', flexShrink: 1, maxWidth: '62%' },
});
