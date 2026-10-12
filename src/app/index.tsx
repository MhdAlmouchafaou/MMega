import { Redirect, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FirewallTab, UsageTab } from '../components/apps/AppsTabs';
import { BottomNav } from '../components/BottomNav';
import { BrandLogo } from '../components/BrandLogo';
import { Overview } from '../components/home/Overview';
import { Stats } from '../components/home/Stats';
import { SectionPager } from '../components/SectionPager';
import { DiagnosticTab } from '../components/test/DiagnosticTab';
import { HistoryTab } from '../components/test/HistoryTab';
import { NetworkTab } from '../components/test/NetworkTab';
import { SpeedTab } from '../components/test/SpeedTab';
import { IconButton } from '../components/ui';
import { useData } from '../store/data';
import { useNav, type Section } from '../store/nav';
import { useSettings } from '../store/settings';
import { toast } from '../store/ui';
import { fonts, useTheme } from '../theme';
import { SettingsContent } from './settings';

function HomeSection() {
  return <SectionPager labels={['Aperçu', 'Statistiques']} initial={0} pages={[<Overview key="o" />, <Stats key="s" />]} />;
}

function AppsSection() {
  const tab = useNav((s) => s.appsTab);
  const [nonce, setNonce] = useState(0);
  const [last, setLast] = useState(tab);
  if (tab !== last) {
    setLast(tab);
    setNonce((n) => n + 1);
  }
  return (
    <SectionPager
      labels={['Mobile', 'Wi‑Fi', 'Pare-feu']}
      initial={tab}
      select={{ index: tab, nonce }}
      onChange={(i) => useNav.setState({ appsTab: i })}
      pages={[<UsageTab key="m" network="mobile" />, <UsageTab key="w" network="wifi" />, <FirewallTab key="f" />]}
    />
  );
}

function TestSection() {
  const tab = useNav((s) => s.testTab);
  const autoStart = useNav((s) => s.autoStart);
  const visible = useNav((s) => s.section === 'test');
  const [page, setPage] = useState(tab);
  return (
    <SectionPager
      labels={['Débit', 'Diagnostic', 'Réseau', 'Historique']}
      initial={tab}
      select={{ index: tab, nonce: autoStart }}
      onChange={(i) => {
        setPage(i);
        useNav.setState({ testTab: i });
      }}
      pages={[<SpeedTab key="s" />, <DiagnosticTab key="d" />, <NetworkTab key="n" active={visible && page === 2} />, <HistoryTab key="h" />]}
    />
  );
}

function SettingsHeader() {
  const t = useTheme();
  return <Text style={[styles.bigTitle, { color: t.brand }]}>Paramètres</Text>;
}

export default function Home() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const onboarded = useSettings((s) => s.onboarded);
  const section = useNav((s) => s.section);
  const setSection = useNav((s) => s.setSection);
  const [visited, setVisited] = useState<Record<Section, boolean>>({ home: true, apps: false, test: false, settings: false });
  const refresh = useData((s) => s.refreshOverview);

  useFocusEffect(
    useCallback(() => {
      useData.getState().checkAccess();
    }, [])
  );

  if (!onboarded) return <Redirect href="/welcome" />;

  const change = (s: Section) => {
    setVisited((v) => ({ ...v, [s]: true }));
    setSection(s);
  };
  if (!visited[section]) setVisited((v) => ({ ...v, [section]: true }));
  const show = (s: Section) => (section === s ? styles.fill : styles.hidden);

  return (
    <View style={[styles.root, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, section === 'settings' && { display: 'none' }]}>
        <BrandLogo size={22} color={t.accent} id="hdr" />
        <Text style={[styles.brand, { color: t.brand, fontFamily: fonts.brand }]}>MMega</Text>
        <View style={{ flex: 1 }} />
        <IconButton
          name="refresh"
          size={25}
          color={t.brand}
          strokeWidth={1.9}
          label="Actualiser"
          onPress={async () => {
            await Promise.all([refresh(), useData.getState().refreshNet(), useData.getState().loadPeriod('today', true)]);
            toast('Données actualisées');
          }}
        />
        <IconButton name="settings" size={25} color={t.brand} strokeWidth={1.8} label="Paramètres" onPress={() => change('settings')} />
      </View>

      <View style={styles.fill}>
        <View style={show('home')}>
          <HomeSection />
        </View>
        <View style={show('apps')}>{visited.apps || section === 'apps' ? <AppsSection /> : null}</View>
        <View style={show('test')}>{visited.test || section === 'test' ? <TestSection /> : null}</View>
        <View style={show('settings')}>{visited.settings || section === 'settings' ? <SettingsContent header={<SettingsHeader />} /> : null}</View>
      </View>

      <BottomNav section={section} onChange={change} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  hidden: { display: 'none' },
  header: { height: 60, flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, marginTop: 4 },
  brand: { fontSize: 24, letterSpacing: -0.4, marginLeft: 9 },
  bigTitle: { fontSize: 34, fontWeight: '600', marginLeft: 24, marginTop: 50, marginBottom: 14 },
});
