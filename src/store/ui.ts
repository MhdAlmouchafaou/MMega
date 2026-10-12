import { create } from 'zustand';

export type SheetAction = {
  label: string;
  icon?: string;
  destructive?: boolean;
  onPress: () => void;
};

type PromptState = {
  title: string;
  message?: string;
  placeholder?: string;
  initial?: string;
  confirmLabel?: string;
  keyboard?: 'default' | 'numeric' | 'decimal-pad';
  suffix?: string;
  onSubmit: (value: string) => void;
};

type ConfirmState = {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
};

type UIState = {
  sheet: {
    title?: string;
    subtitle?: string;
    actions: SheetAction[];
    details?: { label: string; value: string }[];
  } | null;
  showSheet: (sheet: UIState['sheet']) => void;
  hideSheet: () => void;

  prompt: PromptState | null;
  showPrompt: (p: PromptState) => void;
  hidePrompt: () => void;

  confirm: ConfirmState | null;
  showConfirm: (c: ConfirmState) => void;
  hideConfirm: () => void;

  toast: { id: number; text: string } | null;
  showToast: (text: string) => void;
};

export const useUI = create<UIState>((set) => ({
  sheet: null,
  showSheet: (sheet) => set({ sheet }),
  hideSheet: () => set({ sheet: null }),

  prompt: null,
  showPrompt: (prompt) => set({ prompt }),
  hidePrompt: () => set({ prompt: null }),

  confirm: null,
  showConfirm: (confirm) => set({ confirm }),
  hideConfirm: () => set({ confirm: null }),

  toast: null,
  showToast: (text) => set({ toast: { id: Date.now(), text } }),
}));

export const toast = (text: string) => useUI.getState().showToast(text);
