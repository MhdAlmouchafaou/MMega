import { FlashList } from '@shopify/flash-list';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../components/blocks';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/SettingItem';
import { haptic } from '../components/ui';
import { useData } from '../store/data';
import { DEFAULT_WHITELIST, useSettings } from '../store/settings';
import { useTheme } from '../theme';

export default function Whitelist() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const apps = useData((s) => s.apps);
  const loadApps = useData((s) => s.loadApps);
  const whitelist = useSettings((s) => s.firewall.whitelist);
  const toggle = useSettings((s) => s.toggleWhitelist);
  const update = useSettings((s) => s.updateFirewall);
  const [query, setQuery] = useState('');
  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = apps.filter((a) => !a.self && (a.launchable || whitelist.includes(a.pkg) || a.pkg === 'com.google.android.gms') && (!q || a.label.toLowerCase().includes(q) || a.pkg.includes(q)));
    // Selected apps first.
    return items.sort((a, b) => Number(whitelist.includes(b.pkg)) - Number(whitelist.includes(a.pkg)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, query]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader title="Apps essentielles" />
      <FlashList
        data={list}
        keyExtractor={(a) => a.pkg}
        extraData={whitelist}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
        ListHeaderComponent={
          <View>
            <Text style={[styles.intro, { color: t.textSecondary }]}>
              Ces applications restent connectées en mode Éco, quand l’écran est éteint (si activé) et après la coupure du forfait. Gardez-y vos messageries et les services Google (nécessaires aux notifications).
            </Text>
            <View style={[styles.search, { backgroundColor: t.surface }]}>
              <Icon name="search" size={20} color={t.textTertiary} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Rechercher" placeholderTextColor={t.textTertiary} style={[styles.input, { color: t.text }]} />
            </View>
            <Text onPress={() => update({ whitelist: DEFAULT_WHITELIST })} style={[styles.reset, { color: t.accent }]}>
              Rétablir la sélection recommandée
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const on = whitelist.includes(item.pkg);
          return (
            <Pressable
              onPress={() => {
                haptic();
                toggle(item.pkg);
              }}
              android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
              style={styles.row}
            >
              <AppIcon pkg={item.pkg} label={item.label} size={40} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={[styles.pkg, { color: t.textTertiary }]} numberOfLines={1}>
                  {item.pkg}
                </Text>
              </View>
              <View style={[styles.check, { backgroundColor: on ? t.accent : 'transparent', borderColor: on ? t.accent : t.textTertiary }]}>
                {on ? <Icon name="check" size={16} color="#fff" strokeWidth={3} /> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 14, lineHeight: 20, marginHorizontal: 24, marginBottom: 12 },
  search: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, borderRadius: 22, paddingHorizontal: 16, height: 48 },
  input: { flex: 1, fontSize: 16, marginLeft: 10, paddingVertical: 0 },
  reset: { fontSize: 14, fontWeight: '700', marginHorizontal: 24, marginTop: 14, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  name: { fontSize: 16, fontWeight: '600' },
  pkg: { fontSize: 12, marginTop: 1 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
