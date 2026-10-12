import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUI } from '../store/ui';
import { useTheme } from '../theme';
import { Icon, type IconName } from './Icon';

function Backdrop({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onPress} />
    </Animated.View>
  );
}

function SheetFrame({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Backdrop onPress={onClose} />
      <Animated.View
        entering={SlideInDown.duration(240)}
        exiting={SlideOutDown.duration(200)}
        style={[styles.sheet, { backgroundColor: t.surface, paddingBottom: insets.bottom + 10 }]}
      >
        <View style={[styles.grabber, { backgroundColor: t.divider }]} />
        {children}
      </Animated.View>
    </Modal>
  );
}

function ActionSheet() {
  const t = useTheme();
  const sheet = useUI((s) => s.sheet);
  const hide = useUI((s) => s.hideSheet);
  if (!sheet) return null;
  return (
    <SheetFrame onClose={hide}>
      {sheet.title ? (
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[styles.sheetTitle, { color: t.text }]}>
              {sheet.title}
            </Text>
            {sheet.subtitle ? (
              <Text numberOfLines={1} style={[styles.sheetSubtitle, { color: t.textSecondary }]}>
                {sheet.subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
      <ScrollView style={{ maxHeight: 520 }} bounces={false}>
        {sheet.details?.map((d) => (
          <View key={d.label} style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: t.textSecondary }]}>{d.label}</Text>
            <Text style={[styles.detailValue, { color: t.text }]} selectable>
              {d.value}
            </Text>
          </View>
        ))}
        {sheet.actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => {
              hide();
              setTimeout(a.onPress, 60);
            }}
            android_ripple={{ color: t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}
            style={styles.action}
          >
            {a.icon ? <Icon name={a.icon as IconName} size={22} color={a.destructive ? t.danger : t.icon} /> : null}
            <Text style={[styles.actionLabel, { color: a.destructive ? t.danger : t.text }]}>{a.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SheetFrame>
  );
}

function DialogFrame({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const t = useTheme();
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Backdrop onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.dialogWrap} pointerEvents="box-none">
        <Animated.View entering={FadeInDown.duration(220)} style={[styles.dialog, { backgroundColor: t.surface }]}>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DialogButtons({
  onCancel,
  onConfirm,
  confirmLabel,
  cancelLabel,
  destructive,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={styles.dialogButtons}>
      <Pressable onPress={onCancel} style={styles.dialogButton} android_ripple={{ color: 'rgba(0,0,0,0.06)' }}>
        <Text style={[styles.dialogButtonText, { color: t.accent }]}>{cancelLabel ?? 'Annuler'}</Text>
      </Pressable>
      <View style={{ width: 1, height: 20, backgroundColor: t.divider }} />
      <Pressable onPress={onConfirm} style={styles.dialogButton} android_ripple={{ color: 'rgba(0,0,0,0.06)' }}>
        <Text style={[styles.dialogButtonText, { color: destructive ? t.danger : t.accent }]}>{confirmLabel}</Text>
      </Pressable>
    </View>
  );
}

function PromptDialog() {
  const t = useTheme();
  const prompt = useUI((s) => s.prompt);
  const hide = useUI((s) => s.hidePrompt);
  const [value, setValue] = useState('');
  const input = useRef<TextInput>(null);
  useEffect(() => {
    if (prompt) {
      setValue(prompt.initial ?? '');
      setTimeout(() => input.current?.focus(), 250);
    }
  }, [prompt]);
  if (!prompt) return null;
  const submit = () => {
    if (!value.trim()) return;
    hide();
    prompt.onSubmit(value.trim());
  };
  return (
    <DialogFrame onClose={hide}>
      <Text style={[styles.dialogTitle, { color: t.text }]}>{prompt.title}</Text>
      {prompt.message ? <Text style={[styles.dialogMessage, { color: t.textSecondary }]}>{prompt.message}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TextInput
        ref={input}
        value={value}
        onChangeText={setValue}
        placeholder={prompt.placeholder}
        placeholderTextColor={t.textTertiary}
        selectTextOnFocus
        onSubmitEditing={submit}
        keyboardType={prompt.keyboard ?? 'default'}
        style={[styles.input, { color: t.text, borderBottomColor: t.accent, flex: 1 }]}
      />
      {prompt.suffix ? <Text style={{ color: t.textSecondary, fontSize: 17, marginLeft: 10, marginBottom: 10 }}>{prompt.suffix}</Text> : null}
      </View>
      <DialogButtons onCancel={hide} onConfirm={submit} confirmLabel={prompt.confirmLabel ?? 'OK'} />
    </DialogFrame>
  );
}

function ConfirmDialog() {
  const t = useTheme();
  const confirm = useUI((s) => s.confirm);
  const hide = useUI((s) => s.hideConfirm);
  if (!confirm) return null;
  return (
    <DialogFrame
      onClose={() => {
        hide();
        confirm.onCancel?.();
      }}
    >
      <Text style={[styles.dialogTitle, { color: t.text }]}>{confirm.title}</Text>
      {confirm.message ? <Text style={[styles.dialogMessage, { color: t.textSecondary }]}>{confirm.message}</Text> : null}
      <DialogButtons
        onCancel={() => {
          hide();
          confirm.onCancel?.();
        }}
        cancelLabel={confirm.cancelLabel}
        onConfirm={() => {
          hide();
          confirm.onConfirm();
        }}
        confirmLabel={confirm.confirmLabel}
        destructive={confirm.destructive}
      />
    </DialogFrame>
  );
}

function Toast() {
  const toastState = useUI((s) => s.toast);
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => {
    if (!toastState) return;
    setVisible(toastState);
    const timer = setTimeout(() => setVisible(null), 2200);
    return () => clearTimeout(timer);
  }, [toastState]);
  if (!visible) return null;
  return (
    <Animated.View
      key={visible.id}
      entering={FadeInDown.duration(200)}
      exiting={FadeOut.duration(200)}
      pointerEvents="none"
      style={[styles.toast, { bottom: insets.bottom + 96 }]}
    >
      <Text style={styles.toastText}>{visible.text}</Text>
    </Animated.View>
  );
}

export function Overlays() {
  return (
    <>
      <ActionSheet />
      <PromptDialog />
      <ConfirmDialog />
      <Toast />
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 28,
    paddingTop: 8,
    overflow: 'hidden',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  sheetSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  action: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 18,
  },
  actionLabel: {
    fontSize: 17,
  },
  detailRow: {
    paddingHorizontal: 24,
    paddingVertical: 9,
  },
  detailLabel: {
    fontSize: 13.5,
  },
  detailValue: {
    fontSize: 16.5,
    marginTop: 2,
  },
  dialogWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  dialog: {
    borderRadius: 28,
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 6,
  },
  dialogTitle: {
    fontSize: 19,
    fontWeight: '600',
    marginBottom: 12,
  },
  dialogMessage: {
    fontSize: 15.5,
    lineHeight: 22,
    marginBottom: 8,
  },
  input: {
    fontSize: 17,
    borderBottomWidth: 2,
    paddingVertical: 8,
    marginBottom: 10,
  },
  dialogButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  dialogButton: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(40,42,48,0.94)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    maxWidth: '86%',
  },
  toastText: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
  },
});
