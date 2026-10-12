import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeroBackground, PrimaryButton } from '../components/blocks';
import { BrandLogo } from '../components/BrandLogo';
import { Icon, type IconName } from '../components/Icon';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { fonts } from '../theme';
import { Native } from '../../modules/mmega-core';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'chart', title: 'Consommation exacte', text: 'Par application, sur mobile et Wi‑Fi, au mégaoctet près.' },
  { icon: 'database', title: 'Forfait sous contrôle', text: 'Solde en direct, alertes et prévision : « épuisé dans 3 h ».' },
  { icon: 'shield', title: 'Pare-feu sans root', text: 'Coupez Internet aux applications gourmandes, même en arrière-plan.' },
  { icon: 'speed', title: 'Tests et diagnostic', text: 'Débit, ping, latence et la raison d’une connexion lente.' },
];

function Halo({ delay, size }: { delay: number; size: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })), -1));
  }, [p, delay]);
  const style = useAnimatedStyle(() => ({ opacity: 0.35 * (1 - p.value), transform: [{ scale: 0.6 + p.value * 0.9 }] }));
  return <Animated.View style={[styles.halo, { width: size, height: size, borderRadius: size / 2 }, style]} />;
}

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(0.4);
  const float = useSharedValue(0);
  useEffect(() => {
    scale.value = withSpring(1, { damping: 11, stiffness: 120 });
    float.value = withRepeat(withSequence(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.sin) })), -1);
  }, [scale, float]);
  const logo = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { translateY: -6 + float.value * 12 }], opacity: Math.min(1, scale.value * 1.4) }));

  const start = () => {
    useSettings.getState().set({ onboarded: true });
    router.replace('/');
    if (!Native?.hasUsageAccess()) {
      setTimeout(() => {
        useData.getState().checkAccess();
        Native?.openSettings('usage');
      }, 500);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <HeroBackground radius={0} />
      <View style={[styles.top, { paddingTop: insets.top + 40 }]}>
        <View style={styles.logoWrap}>
          <Halo delay={0} size={230} />
          <Halo delay={1300} size={230} />
          <Animated.View style={logo}>
            <BrandLogo size={92} color="#fff" id="wel" />
          </Animated.View>
        </View>
        <Animated.Text entering={FadeInDown.delay(250).duration(500)} style={[styles.title, { fontFamily: fonts.brand }]}>
          MMega
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(380).duration(500)} style={styles.tagline}>
          Chaque mégaoctet compte.
        </Animated.Text>
      </View>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        {FEATURES.map((f, i) => (
          <Animated.View key={f.title} entering={FadeInDown.delay(500 + i * 110).duration(450)} style={styles.feature}>
            <View style={styles.featureIcon}>
              <Icon name={f.icon} size={22} color="#fff" strokeWidth={2} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          </Animated.View>
        ))}
        <Animated.View entering={FadeInDown.delay(1000).duration(450)}>
          <PrimaryButton label="Commencer" onPress={start} tone="white" style={{ marginTop: 22 }} />
          <Text style={styles.privacy}>Tout reste sur votre téléphone. MMega ne collecte aucune donnée.</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#5A15F1' },
  top: { alignItems: 'center' },
  logoWrap: { width: 240, height: 200, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', borderWidth: 2, borderColor: '#fff' },
  title: { color: '#fff', fontSize: 44, letterSpacing: -1, marginTop: 4 },
  tagline: { color: 'rgba(255,255,255,0.86)', fontSize: 17, marginTop: 4 },
  sheet: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24 },
  feature: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  featureIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  featureTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  featureText: { color: 'rgba(255,255,255,0.82)', fontSize: 13.5, lineHeight: 19, marginTop: 1 },
  privacy: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, textAlign: 'center', marginTop: 14 },
});
