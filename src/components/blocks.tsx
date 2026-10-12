import { Image } from 'expo-image';
import React, { memo, useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useData } from '../store/data';
import { useTheme } from '../theme';
import { Icon, type IconName } from './Icon';
import { haptic } from './ui';

/** Horizontal pill selector. */
export function Chips<T extends string>({
  items,
  value,
  onChange,
  style,
}: {
  items: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, style]}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable
            key={it.key}
            onPress={() => {
              if (!on) haptic();
              onChange(it.key);
            }}
            style={[styles.chip, { backgroundColor: on ? t.accent : t.chip }]}
          >
            <Text style={[styles.chipText, { color: on ? '#fff' : t.textSecondary }]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const AVATAR_COLORS = ['#6A47F6', '#13A9C4', '#E5484D', '#EE9A2E', '#17A665', '#D24BC0', '#3F7CF2', '#8C6A4F'];

/** App icon from the native cache, with a coloured initial while it loads. */
export const AppIcon = memo(function AppIcon({ pkg, label, size = 42 }: { pkg: string | null; label: string; size?: number }) {
  const icon = useData((s) => (pkg ? s.icons[pkg] : null));
  const loadIcons = useData((s) => s.loadIcons);
  useEffect(() => {
    if (pkg && icon === undefined) loadIcons([pkg]);
  }, [pkg, icon, loadIcons]);
  const color = useMemo(() => {
    let h = 0;
    for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  }, [label]);
  if (icon) return <Image source={{ uri: icon }} style={{ width: size, height: size }} contentFit="contain" transition={120} recyclingKey={pkg ?? label} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      {pkg ? (
        <Text style={{ color: '#fff', fontSize: size * 0.42, fontWeight: '700' }}>{label.charAt(0).toUpperCase()}</Text>
      ) : (
        <Icon name="settings" size={size * 0.56} color="#fff" strokeWidth={2} />
      )}
    </View>
  );
});

/** Brand gradient background with soft light blobs, used by the hero cards. */
export function HeroBackground({ colors, radius = 28 }: { colors?: [string, string, string]; radius?: number }) {
  const t = useTheme();
  const c = colors ?? t.hero;
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="hb" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={c[0]} />
            <Stop offset="0.55" stopColor={c[1]} />
            <Stop offset="1" stopColor={c[2]} />
          </LinearGradient>
          <RadialGradient id="hl" cx="0.85" cy="0.1" r="0.6">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.28} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="hd" cx="0.05" cy="1" r="0.7">
            <Stop offset="0" stopColor="#2A0A9C" stopOpacity={0.45} />
            <Stop offset="1" stopColor="#2A0A9C" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#hb)" />
        <Rect width="100%" height="100%" fill="url(#hl)" />
        <Rect width="100%" height="100%" fill="url(#hd)" />
        <Circle cx="92%" cy="88%" r="70" fill="#FFFFFF" opacity={0.06} />
        <Circle cx="8%" cy="6%" r="46" fill="#FFFFFF" opacity={0.05} />
      </Svg>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  icon,
  style,
  tone = 'accent',
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  tone?: 'accent' | 'soft' | 'light' | 'danger' | 'white';
  disabled?: boolean;
}) {
  const t = useTheme();
  const bg = tone === 'accent' ? t.accent : tone === 'soft' ? t.accentTrack : tone === 'danger' ? t.danger : tone === 'white' ? '#FFFFFF' : 'rgba(255,255,255,0.2)';
  const fg = tone === 'soft' ? t.accent : tone === 'white' ? '#4A1FE0' : '#fff';
  return (
    <Pressable
      onPress={() => {
        haptic();
        onPress();
      }}
      disabled={disabled}
      android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
      style={[styles.button, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }, style]}
    >
      {icon ? <Icon name={icon} size={20} color={fg} strokeWidth={2.1} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** Rounded icon badge. */
export function IconBadge({ name, color, bg, size = 40 }: { name: IconName; color: string; bg: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.36, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={size * 0.55} color={color} strokeWidth={2} />
    </View>
  );
}

/** Pulsing dot, e.g. for "live". */
export function LiveDot({ color, size = 8 }: { color: string; size?: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 0 })), -1);
  }, [p]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - p.value), transform: [{ scale: 1 + p.value * 1.6 }] }));
  return (
    <View style={{ width: size * 2.6, height: size * 2.6, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, halo]} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

/** Card asking for a permission. */
export function PermissionCard({
  icon,
  title,
  text,
  action,
  onPress,
}: {
  icon: IconName;
  title: string;
  text: string;
  action: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(260)} style={[styles.perm, { backgroundColor: t.surface }]}>
      <IconBadge name={icon} color={t.accent} bg={t.accentTrack} size={52} />
      <Text style={[styles.permTitle, { color: t.text }]}>{title}</Text>
      <Text style={[styles.permText, { color: t.textSecondary }]}>{text}</Text>
      <PrimaryButton label={action} onPress={onPress} style={{ marginTop: 18, alignSelf: 'stretch' }} />
    </Animated.View>
  );
}

export function Progress({ value, color, track, height = 6 }: { value: number; color: string; track: string; height?: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(Math.max(0, Math.min(1, value)), { duration: 700 });
  }, [value, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color }, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: 16, gap: 8, paddingVertical: 4 },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '600' },
  button: { height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 22 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  perm: { marginHorizontal: 12, marginTop: 10, borderRadius: 28, padding: 24, alignItems: 'center' },
  permTitle: { fontSize: 20, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  permText: { fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: 'center' },
});
