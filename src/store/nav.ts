import { create } from 'zustand';

export type Section = 'home' | 'apps' | 'test' | 'settings';

type NavState = {
  section: Section;
  testTab: number;
  appsTab: number;
  setSection: (s: Section) => void;
  /** Bumped to ask the speed test page to start a test (deep link from the notification). */
  autoStart: number;
  autoHandled: number;
};

export const useNav = create<NavState>((set) => ({
  section: 'home',
  testTab: 0,
  appsTab: 0,
  autoStart: 0,
  autoHandled: 0,
  setSection: (section) => set({ section }),
}));
