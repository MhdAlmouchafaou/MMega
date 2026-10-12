package expo.modules.mmega

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restores the speed monitor and the firewall after a reboot or an app update. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    val cfg = Store.config(context)
    if (cfg.monitorEnabled) MonitorService.start(context)
    FirewallService.apply(context, foreground = true)
  }
}
