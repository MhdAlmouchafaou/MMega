import { Outfit_500Medium, Outfit_700Bold, useFonts } from '@expo-google-fonts/outfit';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Overlays } from '../components/Overlays';
import { attachNativeSync, pullNativeState, startLive, stopLive, useData } from '../store/data';
import { useSettings } from '../store/settings';
import { useTheme } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function useHydrated() {
  const [hydrated, setHydrated] = useState(useSettings.persist.hasHydrated());
  useEffect(() => {
    const unsub = useSettings.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useSettings.persist.hasHydrated());
    return unsub;
  }, []);
  return hydrated;
}

function refreshAll() {
  const d = useData.getState();
  d.checkAccess();
  d.refreshOverview();
  d.refreshNet();
}

function Bootstrap({ onReady }: { onReady: () => void }) {
  const hydrated = useHydrated();

  useEffect(() => {
    if (!hydrated) return;
    const detach = attachNativeSync();
    pullNativeState();
    refreshAll();
    useData.getState().loadApps();
    startLive();
    // startLive/stopLive are ref-counted: keep this owner's calls paired even if 'active' repeats.
    let live = true;
    onReady();
    SplashScreen.hideAsync().catch(() => {});

    let timer: ReturnType<typeof setInterval> | null = setInterval(() => useData.getState().refreshOverview(), 30_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        pullNativeState();
        refreshAll();
        if (!live) {
          startLive();
          live = true;
        }
        if (!timer) timer = setInterval(() => useData.getState().refreshOverview(), 30_000);
      } else if (s === 'background') {
        if (live) {
          stopLive();
          live = false;
        }
        if (timer) clearInterval(timer);
        timer = null;
      }
    });
    return () => {
      detach();
      sub.remove();
      if (live) stopLive();
      if (timer) clearInterval(timer);
    };
  }, [hydrated, onReady]);

  return null;
}

export default function RootLayout() {
  const t = useTheme();
  const [fontsLoaded] = useFonts({ Outfit_700Bold, Outfit_500Medium });
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(t.bg).catch(() => {});
  }, [t.bg]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={[styles.root, { backgroundColor: t.bg }]}>
          <StatusBar style={t.dark ? 'light' : 'dark'} />
          <Bootstrap onReady={onReady} />
          {fontsLoaded && ready ? (
            <>
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: 'slide_from_right',
                  animationDuration: 260,
                  freezeOnBlur: true,
                  contentStyle: { backgroundColor: t.bg },
                }}
              >
                <Stack.Screen name="welcome" options={{ animation: 'fade', contentStyle: { backgroundColor: '#5A15F1' } }} />
                <Stack.Screen name="speedtest" options={{ animation: 'none' }} />
                <Stack.Screen name="plan" options={{ animation: 'fade_from_bottom' }} />
              </Stack>
              <Overlays />
            </>
          ) : null}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
