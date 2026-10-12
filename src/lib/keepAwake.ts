import { activateKeepAwakeAsync as activate, deactivateKeepAwake as deactivate } from 'expo-keep-awake';

const TAG = 'mmega-speedtest';

/** Keeps the screen on during a speed test (a sleeping phone throttles the network). */
export function activateKeepAwakeAsync() {
  activate(TAG).catch(() => {});
}

export function deactivateKeepAwake() {
  deactivate(TAG).catch(() => {});
}
