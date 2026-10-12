import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Animated count-up used for the big figures. */
export function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    const t0 = Date.now();
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      const v = start + (target - start) * e;
      setValue(v);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, duration]);
  return value;
}

/** Progress ring with a gradient stroke that sweeps in. */
export function Ring({
  size,
  stroke,
  progress,
  colors,
  track,
  children,
  delay = 0,
}: {
  size: number;
  stroke: number;
  progress: number;
  colors: [string, string];
  track: string;
  children?: React.ReactNode;
  delay?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(Math.max(0, Math.min(1, progress)), { duration: 1300, easing: Easing.out(Easing.cubic) }));
  }, [progress, delay, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - p.value) }));
  const id = useMemo(() => `ring${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="1" stopColor={colors[1]} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={`url(#${id})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c} ${c}`}
            animatedProps={props}
          />
        </G>
      </Svg>
      {children}
    </View>
  );
}

function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return '';
  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/** Smooth area chart for the live speed. */
export function Sparkline({
  data,
  width,
  height,
  color,
  max,
}: {
  data: number[];
  width: number;
  height: number;
  color: string;
  max?: number;
}) {
  const top = Math.max(max ?? 0, ...data, 1);
  const pts = data.map((v, i) => ({
    x: (i / Math.max(1, data.length - 1)) * width,
    y: height - 3 - (Math.max(0, v) / top) * (height - 8),
  }));
  const line = smoothPath(pts);
  const area = line ? `${line} L${width} ${height} L0 ${height} Z` : '';
  const id = useMemo(() => `spark${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.32} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {area ? <Path d={area} fill={`url(#${id})`} /> : null}
      {line ? <Path d={line} stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" /> : null}
      {pts.length ? <Circle cx={pts[pts.length - 1].x - 2} cy={pts[pts.length - 1].y} r={3.6} fill={color} /> : null}
    </Svg>
  );
}

function Bar({
  index,
  mobile,
  wifi,
  max,
  height,
  selected,
  colors,
  label,
  onPress,
  dim,
}: {
  index: number;
  mobile: number;
  wifi: number;
  max: number;
  height: number;
  selected: boolean;
  colors: { mobile: string; wifi: string; label: string; active: string };
  label: string;
  onPress: () => void;
  dim: boolean;
}) {
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = 0;
    grow.value = withDelay(index * 28, withSpring(1, { damping: 16, stiffness: 120 }));
  }, [index, mobile, wifi, grow]);
  const total = mobile + wifi;
  const h = max > 0 ? Math.max(total > 0 ? 4 : 0, (total / max) * height) : 0;
  const mh = total > 0 ? (mobile / total) * h : 0;
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: grow.value }] }));
  return (
    <Pressable onPress={onPress} style={styles.barCol} hitSlop={4}>
      <View style={{ height, justifyContent: 'flex-end', width: '100%', alignItems: 'center' }}>
        <Animated.View style={[styles.bar, { height: h, opacity: dim ? 0.38 : 1, transformOrigin: 'bottom' }, style]}>
          <View style={{ flex: 1, backgroundColor: colors.wifi }} />
          <View style={{ height: mh, backgroundColor: colors.mobile }} />
        </Animated.View>
      </View>
      <Text style={[styles.barLabel, { color: selected ? colors.active : colors.label, fontWeight: selected ? '700' : '500' }]}>{label}</Text>
    </Pressable>
  );
}

/** Stacked daily bars (mobile at the bottom, Wi-Fi on top); tapping a bar selects it. */
export function BarChart({
  data,
  height = 150,
  selected,
  onSelect,
  style,
}: {
  data: { key: string; label: string; mobile: number; wifi: number }[];
  height?: number;
  selected: number;
  onSelect: (i: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const max = Math.max(1, ...data.map((d) => d.mobile + d.wifi));
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-end' }, style]}>
      {data.map((d, i) => (
        <Bar
          key={d.key}
          index={i}
          mobile={d.mobile}
          wifi={d.wifi}
          max={max}
          height={height}
          selected={i === selected}
          dim={selected >= 0 && i !== selected}
          label={d.label}
          colors={{ mobile: t.mobile, wifi: t.wifi, label: t.textTertiary, active: t.text }}
          onPress={() => onSelect(i === selected ? -1 : i)}
        />
      ))}
    </View>
  );
}

/** Tiny bars, e.g. usage per hour. */
export function MiniBars({ data, height, color, highlight }: { data: number[]; height: number; color: string; highlight?: number }) {
  const max = Math.max(1, ...data);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 3 }}>
      {data.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(2, (v / max) * height),
            borderRadius: 3,
            backgroundColor: color,
            opacity: highlight === i ? 1 : v > 0 ? 0.55 : 0.18,
          }}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Speedometer

const MARKS = [0, 1, 5, 10, 20, 30, 50, 75, 100];
const START = 150; // degrees, screen coordinates (clockwise)
const SWEEP = 240;

/** Non-linear scale so both 2 Mbps and 80 Mbps connections move the needle a lot. */
export function gaugeFraction(v: number) {
  'worklet';
  if (v <= 0) return 0;
  const n = MARKS.length - 1;
  for (let i = 0; i < n; i++) {
    if (v <= MARKS[i + 1]) return (i + (v - MARKS[i]) / (MARKS[i + 1] - MARKS[i])) / n;
  }
  return Math.min(1, 1 + Math.log10(v / 100) * 0.05);
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export function Gauge({
  size,
  value,
  colors,
  active,
}: {
  size: number;
  /** Shared value in Mbps, animated by the caller. */
  value: SharedValue<number>;
  colors: [string, string];
  active: boolean;
}) {
  const t = useTheme();
  const stroke = Math.round(size * 0.075);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - stroke / 2 - 4;
  const len = (r * SWEEP * Math.PI) / 180;
  const d = arc(cx, cy, r, START, START + SWEEP);
  const id = useMemo(() => `g${Math.random().toString(36).slice(2, 8)}`, []);
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, { duration: 400 });
  }, [active, on]);

  const progress = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - gaugeFraction(value.value)) }));
  const needle = useAnimatedStyle(() => ({
    opacity: interpolate(on.value, [0, 1], [0.35, 1]),
    transform: [{ rotate: `${START + gaugeFraction(value.value) * SWEEP}deg` }],
  }));
  const labelR = r - stroke - size * 0.06;

  return (
    <View style={{ width: size, height: size * 0.86 }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="1" stopColor={colors[1]} />
          </LinearGradient>
        </Defs>
        <Path d={d} stroke={t.track} strokeWidth={stroke} fill="none" strokeLinecap="round" />
        <AnimatedPath
          d={d}
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${len} ${len}`}
          animatedProps={progress}
        />
        {MARKS.map((m, i) => {
          const deg = START + (i / (MARKS.length - 1)) * SWEEP;
          const p = polar(cx, cy, labelR, deg);
          const a = polar(cx, cy, r - stroke / 2 - 5, deg);
          const b = polar(cx, cy, r - stroke / 2 - 11, deg);
          return (
            <G key={m}>
              <Path d={`M${a.x} ${a.y} L${b.x} ${b.y}`} stroke={t.textTertiary} strokeWidth={1.6} strokeLinecap="round" />
              <SvgText x={p.x} y={p.y + 4} fontSize={size * 0.043} fontWeight="600" fill={t.textSecondary} textAnchor="middle">
                {m}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      <Animated.View pointerEvents="none" style={[styles.needleWrap, { left: cx, top: cy, width: r * 0.78 }, needle]}>
        <View style={[styles.needle, { backgroundColor: t.text, width: r * 0.62 }]} />
      </Animated.View>
      <View pointerEvents="none" style={[styles.hub, { left: cx - 9, top: cy - 9, backgroundColor: t.text, borderColor: t.surface }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  barCol: { flex: 1, alignItems: 'center' },
  bar: { width: '58%', maxWidth: 22, borderRadius: 7, overflow: 'hidden' },
  barLabel: { fontSize: 11.5, marginTop: 7 },
  needleWrap: { position: 'absolute', height: 6, marginTop: -3, transformOrigin: 'left center', justifyContent: 'center' },
  needle: { height: 4, borderRadius: 2, marginLeft: 10 },
  hub: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 4 },
});
