import { PermissionsAndroid, Platform } from 'react-native';
import { Native } from '../../modules/mmega-core';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { toast, useUI } from '../store/ui';

/** Asks for the VPN consent once, with an explanation first. Resolves true when the firewall can run. */
export function ensureFirewallConsent(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!Native) return resolve(false);
    const st = Native.firewallStatus();
    if (st.consent) return resolve(true);
    useUI.getState().showConfirm({
      title: 'Activer le pare-feu',
      message:
        'Pour couper Internet à certaines applications sans root, MMega crée un « VPN local » sur votre téléphone. Aucune donnée n’est envoyée à un serveur : le trafic des applications bloquées est simplement arrêté. Android va vous demander de confirmer.',
      confirmLabel: 'Continuer',
      onConfirm: async () => {
        const ok = await Native!.vpnConsent();
        if (!ok) toast('Autorisation refusée : le pare-feu ne peut pas démarrer');
        useData.getState().refreshFirewall();
        resolve(ok);
      },
      onCancel: () => resolve(false),
    });
  });
}

export async function setFirewallEnabled(on: boolean) {
  if (on && !(await ensureFirewallConsent())) return false;
  useSettings.getState().updateFirewall({ enabled: on });
  return true;
}

export async function setEconomy(on: boolean) {
  if (on && !(await ensureFirewallConsent())) return false;
  const s = useSettings.getState();
  s.updateFirewall({ economy: on, enabled: on ? true : s.firewall.enabled });
  toast(on ? 'Mode Éco activé : seules vos apps essentielles utilisent les données mobiles' : 'Mode Éco désactivé');
  return true;
}

export async function setAppRule(pkg: string, key: 'm' | 'w' | 'b', value: boolean) {
  if (value && !(await setFirewallEnabled(true))) return;
  useSettings.getState().setRule(pkg, key, value);
}

export async function requestNotifications() {
  if (Platform.OS !== 'android' || Platform.Version < 33) return true;
  try {
    const r = await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as never);
    return r === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function setMonitorEnabled(on: boolean) {
  if (on) {
    const ok = await requestNotifications();
    if (!ok && !Native?.notificationsEnabled()) {
      useUI.getState().showConfirm({
        title: 'Notifications désactivées',
        message: 'Le compteur de vitesse s’affiche dans la barre de notification. Autorisez les notifications de MMega pour le voir.',
        confirmLabel: 'Ouvrir',
        onConfirm: () => Native?.openSettings('notifications'),
      });
    }
  }
  useSettings.getState().updateMonitor({ enabled: on });
}

export async function requestPhoneState() {
  try {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE);
    return r === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function requestLocation() {
  try {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return r === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export function openUsageAccess() {
  useUI.getState().showConfirm({
    title: 'Accès aux statistiques',
    message:
      'Android garde le compte exact des données utilisées par chaque application. Dans l’écran suivant, choisissez MMega puis activez « Autoriser l’accès à l’utilisation ». Tout reste sur votre téléphone.',
    confirmLabel: 'Autoriser',
    onConfirm: () => Native?.openSettings('usage'),
  });
}
