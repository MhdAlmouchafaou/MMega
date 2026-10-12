import { router } from 'expo-router';
import { useEffect } from 'react';
import { useNav } from '../store/nav';

/** Deep link from the notification ("Tester le débit"). */
export default function SpeedTestLink() {
  useEffect(() => {
    useNav.setState((s) => ({ section: 'test', testTab: 0, autoStart: s.autoStart + 1 }));
    // Pop back to the existing home screen (a replace would stack a second copy of it).
    router.dismissTo('/');
  }, []);
  return null;
}
