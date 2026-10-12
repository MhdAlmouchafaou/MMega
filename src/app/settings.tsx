import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Native } from '../../modules/mmega-core';
import { NAV_HEIGHT } from '../components/BottomNav';
import { BrandLogo } from '../components/BrandLogo';
import { HeroBackground } from '../components/blocks';
import { Icon } from '../components/Icon';
import { PopupMenu, type MenuItem } from '../components/PopupMenu';
import { ScreenHeader, SettingItem } from '../components/SettingItem';
import { Card, SectionLabel, Switch } from '../components/ui';
import { ensureFirewallConsent, openUsageAccess, setMonitorEnabled } from '../lib/actions';
import { useData } from '../store/data';
import { useSettings, type ThemeMode } from '../store/settings';
import { useUI } from '../store/ui';
import { useTheme } from '../theme';
import { fmtBytes, MB } from '../utils/format';

export default function SettingsScreen() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader title="Paramètres" />
      <SettingsContent />
    </View>
  );
}

function usePermissions() {
  const [state, setState] = useState({ usage: false, notif: false, battery: false, vpn: false });
  const read = useCallback(() => {
    if (!Native) return;
    setState({
      usage: Native.hasUsageAccess(),
      notif: Native.notificationsEnabled(),
      battery: Native.ignoringBatteryOptimizations(),
      vpn: !!Native.firewallStatus().consent,
    });
    useData.getState().checkAccess();
  }, []);
  useFocusEffect(
    useCallback(() => {
      read();
      const sub = AppState.addEventListener('change', (s) => s === 'active' && read());
      return () => sub.remove();
    }, [read])
  );
  return state;
}

export function SettingsContent({ header }: { header?: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const plan = useSettings((s) => s.plan);
  const monitor = useSettings((s) => s.monitor);
  const fw = useSettings((s) => s.firewall);
  const theme = useSettings((s) => s.theme);
  const set = useSettings((s) => s.set);
  const updatePlan = useSettings((s) => s.updatePlan);
  const updateMonitor = useSettings((s) => s.updateMonitor);
  const updateFirewall = useSettings((s) => s.updateFirewall);
  const perms = usePermissions();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[]; title?: string } | null>(null);
  const refs = useRef<Record<string, View | null>>({});

  const openMenu = (key: string, title: string, items: MenuItem[]) => {
    refs.current[key]?.measureInWindow((x, y, w, h) => setMenu({ x: x + w - 16, y: y + h / 2, items, title }));
  };

  const themeLabel = { system: 'Selon le système', light: 'Clair', dark: 'Sombre' }[theme];
  const alertsLabel = plan.alerts.length ? plan.alerts.map((a) => `${a} %`).join(' · ') : 'Aucune';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + NAV_HEIGHT + 30 }} showsVerticalScrollIndicator={false}>
        {header}
        <Pressable onPress={() => router.push('/plan')} style={styles.planCard}>
          <HeroBackground radius={26} />
          <View style={styles.planIcon}>
            <Icon name="database" size={24} color="#fff" strokeWidth={2} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.planTitle}>{plan.enabled ? plan.name || 'Mon forfait' : 'Mon forfait'}</Text>
            <Text style={styles.planSub}>
              {plan.enabled ? `${fmtBytes(plan.volumeBytes)} · ${plan.periodDays} jour${plan.periodDays > 1 ? 's' : ''}${plan.renew ? ' · renouvelé' : ''}` : 'Volume, validité, alertes et coupure automatique'}
            </Text>
          </View>
          <Icon name="chevronRight" size={20} color="#fff" />
        </Pressable>

        <SectionLabel>Compteur en temps réel</SectionLabel>
        <Card>
          <SettingItem
            title="Vitesse dans la barre d’état"
            sub="Affiche la vitesse en direct à côté de l’heure et la consommation du jour dans les notifications"
            onPress={() => setMonitorEnabled(!monitor.enabled)}
            right={<Switch value={monitor.enabled} onChange={(v) => setMonitorEnabled(v)} />}
          />
          <SettingItem
            title="Vitesse dans l’icône"
            sub="Sinon, le logo MMega est affiché"
            onPress={() => updateMonitor({ speedIcon: !monitor.speedIcon })}
            right={<Switch value={monitor.speedIcon} onChange={(v) => updateMonitor({ speedIcon: v })} />}
          />
          <SettingItem
            title="Consommation du jour"
            sub="Mobile et Wi‑Fi d’aujourd’hui dans la notification"
            onPress={() => updateMonitor({ showToday: !monitor.showToday })}
            right={<Switch value={monitor.showToday} onChange={(v) => updateMonitor({ showToday: v })} />}
            last
          />
        </Card>

        <SectionLabel>Alertes du forfait</SectionLabel>
        <Card>
          <SettingItem
            onRef={(v) => (refs.current.alerts = v)}
            title="Seuils d’alerte"
            value={alertsLabel}
            onPress={() =>
              openMenu('alerts', 'Me prévenir à', [
                { label: '50 % · 80 % · 95 %', checked: plan.alerts.join() === '50,80,95', onPress: () => updatePlan({ alerts: [50, 80, 95] }) },
                { label: '75 % · 90 %', checked: plan.alerts.join() === '75,90', onPress: () => updatePlan({ alerts: [75, 90] }) },
                { label: '25 % · 50 % · 75 % · 90 %', checked: plan.alerts.join() === '25,50,75,90', onPress: () => updatePlan({ alerts: [25, 50, 75, 90] }) },
                { label: 'Seulement à 90 %', checked: plan.alerts.join() === '90', onPress: () => updatePlan({ alerts: [90] }) },
              ])
            }
          />
          <SettingItem
            title="Limite quotidienne"
            value={plan.dailyLimitBytes ? fmtBytes(plan.dailyLimitBytes) : 'Aucune'}
            sub="Alerte quand vous dépassez ce volume de données mobiles dans la journée"
            onPress={() =>
              useUI.getState().showPrompt({
                title: 'Limite quotidienne',
                message: 'En mégaoctets (0 pour désactiver).',
                initial: plan.dailyLimitBytes ? String(Math.round(plan.dailyLimitBytes / MB)) : '',
                keyboard: 'numeric',
                suffix: 'Mo',
                onSubmit: (v) => updatePlan({ dailyLimitBytes: Math.max(0, Math.round(Number(v.replace(',', '.')) || 0)) * MB }),
              })
            }
          />
          <SettingItem
            title="Couper les données à 100 %"
            sub="Quand le forfait est épuisé, seules les applications essentielles restent connectées. Évite le hors-forfait."
            onPress={async () => {
              if (!plan.cutoff && !(await ensureFirewallConsent())) return;
              updatePlan({ cutoff: !plan.cutoff });
            }}
            right={
              <Switch
                value={plan.cutoff}
                onChange={async (v) => {
                  if (v && !(await ensureFirewallConsent())) return;
                  updatePlan({ cutoff: v });
                }}
              />
            }
            last
          />
        </Card>
        {!monitor.enabled && plan.enabled ? (
          <Text style={[styles.note, { color: t.warning }]}>Les alertes et la coupure automatique fonctionnent quand le compteur en temps réel est activé.</Text>
        ) : null}

        <SectionLabel>Pare-feu</SectionLabel>
        <Card>
          <SettingItem title="Applications essentielles" value={`${fw.whitelist.length} application${fw.whitelist.length > 1 ? 's' : ''}`} sub="Toujours connectées en mode Éco, écran éteint et après la coupure" onPress={() => router.push('/whitelist')} />
          <SettingItem
            title="Couper quand l’écran est éteint"
            sub="Bloque toutes les autres applications pendant que le téléphone dort"
            onPress={() => updateFirewall({ screenOff: !fw.screenOff })}
            right={<Switch value={fw.screenOff} onChange={(v) => updateFirewall({ screenOff: v })} />}
            last
          />
        </Card>

        <SectionLabel>Autorisations</SectionLabel>
        <Card>
          <SettingItem title="Accès aux statistiques" value={perms.usage ? 'Autorisé' : 'Requis · toucher pour autoriser'} onPress={() => (perms.usage ? Native?.openSettings('usage') : openUsageAccess())} />
          <SettingItem title="Notifications" value={perms.notif ? 'Autorisées' : 'Désactivées'} onPress={() => Native?.openSettings('notifications')} />
          <SettingItem
            title="Fonctionnement en arrière-plan"
            value={perms.battery ? 'Sans restriction' : 'Optimisé par Android'}
            sub="Autorisez MMega à fonctionner sans restriction pour que le compteur et les alertes ne s’arrêtent jamais"
            onPress={() => Native?.openSettings('battery')}
          />
          <SettingItem title="Pare-feu (VPN local)" value={perms.vpn ? 'Autorisé' : 'Pas encore autorisé'} onPress={() => (perms.vpn ? Native?.openSettings('vpn') : ensureFirewallConsent())} last />
        </Card>

        <SectionLabel>Affichage</SectionLabel>
        <Card>
          <SettingItem
            onRef={(v) => (refs.current.theme = v)}
            title="Thème"
            value={themeLabel}
            onPress={() =>
              openMenu(
                'theme',
                'Thème',
                (['system', 'light', 'dark'] as ThemeMode[]).map((m) => ({
                  label: { system: 'Selon le système', light: 'Clair', dark: 'Sombre' }[m],
                  checked: theme === m,
                  onPress: () => set({ theme: m }),
                }))
              )
            }
            last
          />
        </Card>

        <SectionLabel>Android</SectionLabel>
        <Card>
          <SettingItem title="Économiseur de données Android" sub="Bloque les données en arrière-plan pour toutes les applications" onPress={() => Native?.openSettings('dataSaver')} />
          <SettingItem title="Utilisation des données Android" onPress={() => Native?.openSettings('dataUsage')} last />
        </Card>

        <View style={styles.about}>
          <BrandLogo size={30} color={t.accent} id="about" />
          <Text style={[styles.aboutName, { color: t.text }]}>MMega {Constants.expoConfig?.version ?? ''}</Text>
          <Text style={[styles.aboutText, { color: t.textSecondary }]}>Économiseur de données et testeur de connexion. Tout est calculé sur votre téléphone : aucune donnée n’est envoyée.</Text>
        </View>
      </ScrollView>
      <PopupMenu visible={!!menu} anchor={menu ? { x: menu.x, y: menu.y, align: 'right' } : null} items={menu?.items ?? []} title={menu?.title} onClose={() => setMenu(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  planCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 10, borderRadius: 26, padding: 18, overflow: 'hidden' },
  planIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  planTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  planSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13.5, marginTop: 2 },
  note: { fontSize: 13, marginHorizontal: 26, marginTop: 8, lineHeight: 18 },
  about: { alignItems: 'center', paddingHorizontal: 40, marginTop: 34 },
  aboutName: { fontSize: 16, fontWeight: '700', marginTop: 10 },
  aboutText: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 4 },
});
