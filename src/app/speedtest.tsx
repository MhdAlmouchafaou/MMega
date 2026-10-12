import { Redirect } from 'expo-router';
import React, { useEffect } from 'react';
import { useNav } from '../store/nav';

/** Deep link from the notification ("Tester le débit"). */
export default function SpeedTestLink() {
  useEffect(() => {
    useNav.setState((s) => ({ section: 'test', testTab: 0, autoStart: s.autoStart + 1 }));
  }, []);
  return <Redirect href="/" />;
}
