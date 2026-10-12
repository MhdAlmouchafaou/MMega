package expo.modules.mmega

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.TrafficStats
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

class MMegaModule : Module() {
  private val pool = Executors.newCachedThreadPool()
  private val main = Handler(Looper.getMainLooper())
  private var consentPromise: Promise? = null
  private var speedTest: SpeedTest? = null

  private var liveOn = false
  private var lastRx = -1L
  private var lastTx = -1L
  private var lastMobileRx = -1L
  private var lastMobileTx = -1L
  private var lastAt = 0L

  companion object {
    private const val REQ_VPN = 7301
  }

  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private fun safeSend(name: String, body: Map<String, Any?>) {
    try {
      sendEvent(name, body)
    } catch (_: Throwable) {
    }
  }

  private fun bg(promise: Promise, block: () -> Any?) {
    pool.execute {
      try {
        promise.resolve(block())
      } catch (e: Throwable) {
        promise.reject("ERR_MMEGA", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

  private val liveTick = object : Runnable {
    override fun run() {
      if (!liveOn) return
      val rx = TrafficStats.getTotalRxBytes()
      val tx = TrafficStats.getTotalTxBytes()
      val mrx = TrafficStats.getMobileRxBytes()
      val mtx = TrafficStats.getMobileTxBytes()
      val now = SystemClock.elapsedRealtime()
      if (lastRx >= 0 && now > lastAt) {
        val dt = (now - lastAt) / 1000.0
        fun rate(a: Long, b: Long) = if (a >= b && b >= 0) (a - b) / dt else 0.0
        safeSend(
          "onTraffic",
          mapOf(
            "down" to rate(rx, lastRx),
            "up" to rate(tx, lastTx),
            "mobileDown" to rate(mrx, lastMobileRx),
            "mobileUp" to rate(mtx, lastMobileTx),
            "at" to System.currentTimeMillis().toDouble(),
          )
        )
      }
      lastRx = rx; lastTx = tx; lastMobileRx = mrx; lastMobileTx = mtx; lastAt = now
      main.postDelayed(this, 1000L)
    }
  }

  private fun firewallState(): Map<String, Any?> {
    val ctx = context
    val consent = try { VpnService.prepare(ctx) == null } catch (_: Throwable) { false }
    return FirewallService.status + mapOf(
      "consent" to consent,
      "revoked" to Store.prefs(ctx).getBoolean("fw_revoked", false),
      "cutoff" to FirewallService.cutoffActive(ctx, Store.config(ctx)),
    )
  }

  private fun syncServices() {
    val ctx = context
    val cfg = Store.config(ctx)
    if (cfg.monitorEnabled) {
      if (!MonitorService.running) MonitorService.start(ctx) else MonitorService.refresh(ctx)
    } else if (MonitorService.running) {
      MonitorService.stop(ctx)
    }
    FirewallService.apply(ctx)
  }

  private fun open(intent: Intent): Boolean {
    return try {
      val activity = appContext.currentActivity
      if (activity != null) activity.startActivity(intent)
      else context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    } catch (_: Throwable) {
      false
    }
  }

  override fun definition() = ModuleDefinition {
    Name("MMegaCore")

    Events("onTraffic", "onSpeedTest", "onFirewall")

    OnCreate {
      FirewallService.listener = { s ->
        main.post { safeSend("onFirewall", s) }
      }
    }

    OnDestroy {
      liveOn = false
      FirewallService.listener = null
      speedTest?.cancel()
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode == REQ_VPN) {
        val ok = payload.resultCode == Activity.RESULT_OK
        consentPromise?.resolve(ok)
        consentPromise = null
        if (ok) FirewallService.apply(context)
      }
    }

    // --- Settings shared with the native services ---------------------------------------------
    Function("setConfig") { json: String ->
      Store.saveConfig(context, json)
      syncServices()
      true
    }

    Function("getConfig") { Store.rawConfig(context) }

    // --- Permissions and system screens -------------------------------------------------------
    Function("hasUsageAccess") { Usage.hasAccess(context) }

    Function("notificationsEnabled") { NotificationManagerCompat.from(context).areNotificationsEnabled() }

    Function("ignoringBatteryOptimizations") {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    Function("openSettings") { kind: String ->
      val pkg = context.packageName
      val pkgUri = Uri.parse("package:$pkg")
      when {
        kind == "usage" -> open(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
          // Some Android versions open straight on the app with the package data.
          if (Build.VERSION.SDK_INT >= 29) data = pkgUri
        }) || open(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
        kind == "dataSaver" -> open(Intent("android.settings.DATA_SAVER_SETTINGS")) || open(Intent(Settings.ACTION_DATA_USAGE_SETTINGS)) || open(Intent(Settings.ACTION_WIRELESS_SETTINGS))
        kind == "dataUsage" -> open(Intent(Settings.ACTION_DATA_USAGE_SETTINGS)) || open(Intent(Settings.ACTION_WIRELESS_SETTINGS))
        kind == "mobile" -> open(Intent(Settings.ACTION_DATA_ROAMING_SETTINGS)) || open(Intent(Settings.ACTION_WIRELESS_SETTINGS))
        kind == "wifi" -> open(Intent(Settings.ACTION_WIFI_SETTINGS))
        kind == "vpn" -> open(Intent(Settings.ACTION_VPN_SETTINGS))
        kind == "notifications" -> open(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)) || open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkgUri))
        kind == "battery" -> open(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkgUri)) || open(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        kind == "app" -> open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkgUri))
        kind.startsWith("appDetails:") -> open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + kind.removePrefix("appDetails:"))))
        kind.startsWith("appData:") -> {
          val target = kind.removePrefix("appData:")
          open(Intent("android.settings.IGNORE_BACKGROUND_DATA_RESTRICTIONS_SETTINGS", Uri.parse("package:$target"))) ||
            open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$target")))
        }
        else -> open(Intent(Settings.ACTION_SETTINGS))
      }
    }

    Function("launchApp") { pkg: String ->
      val i = context.packageManager.getLaunchIntentForPackage(pkg)
      if (i == null) false else open(i)
    }

    // --- Apps and usage --------------------------------------------------------------------------
    AsyncFunction("listApps") { promise: Promise -> bg(promise) { Apps.list(context) } }

    AsyncFunction("appIcons") { pkgs: List<String>, promise: Promise -> bg(promise) { Apps.icons(context, pkgs) } }

    AsyncFunction("appUsage") { start: Double, end: Double, promise: Promise ->
      bg(promise) {
        Usage.perApp(context, start.toLong(), end.toLong()).map { (uid, a) ->
          mapOf(
            "uid" to uid,
            "mobileRx" to a.mobile.rx.toDouble(),
            "mobileTx" to a.mobile.tx.toDouble(),
            "wifiRx" to a.wifi.rx.toDouble(),
            "wifiTx" to a.wifi.tx.toDouble(),
            "mobileBg" to a.mobileBg.toDouble(),
            "wifiBg" to a.wifiBg.toDouble(),
          )
        }
      }
    }

    AsyncFunction("deviceUsage") { start: Double, end: Double, promise: Promise ->
      bg(promise) {
        val m = Usage.device(context, Usage.MOBILE, start.toLong(), end.toLong())
        val w = Usage.device(context, Usage.WIFI, start.toLong(), end.toLong())
        mapOf(
          "mobile" to m.total.toDouble(), "wifi" to w.total.toDouble(),
          "mobileRx" to m.rx.toDouble(), "mobileTx" to m.tx.toDouble(),
          "wifiRx" to w.rx.toDouble(), "wifiTx" to w.tx.toDouble(),
        )
      }
    }

    AsyncFunction("daily") { days: Int, promise: Promise -> bg(promise) { Usage.daily(context, days.coerceIn(1, 62)) } }

    AsyncFunction("appDaily") { uid: Int, days: Int, promise: Promise -> bg(promise) { Usage.appDaily(context, uid, days.coerceIn(1, 62)) } }

    AsyncFunction("hourlyToday") { promise: Promise -> bg(promise) { Usage.hourlyToday(context) } }

    AsyncFunction("planStatus") { promise: Promise -> bg(promise) { Usage.planStatus(context, Store.config(context).plan) } }

    Function("startLive") {
      if (!liveOn) {
        liveOn = true
        lastRx = -1
        main.post(liveTick)
      }
    }

    Function("stopLive") {
      liveOn = false
      main.removeCallbacks(liveTick)
    }

    // --- Monitor ---------------------------------------------------------------------------------
    Function("monitorRunning") { MonitorService.running }

    // --- Firewall --------------------------------------------------------------------------------
    AsyncFunction("vpnConsent") { promise: Promise ->
      val intent = try { VpnService.prepare(context) } catch (_: Throwable) { null }
      if (intent == null) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      consentPromise?.resolve(false)
      consentPromise = promise
      main.post {
        try {
          activity.startActivityForResult(intent, REQ_VPN)
        } catch (_: Throwable) {
          consentPromise?.resolve(false)
          consentPromise = null
        }
      }
    }

    Function("firewallStatus") { firewallState() }

    Function("firewallApply") {
      FirewallService.apply(context)
      true
    }

    // --- Speed test and diagnostics --------------------------------------------------------------
    AsyncFunction("speedTest") { light: Boolean, promise: Promise ->
      speedTest?.cancel()
      val test = SpeedTest { e -> safeSend("onSpeedTest", e) }
      speedTest = test
      bg(promise) {
        val r = test.run(light)
        if (speedTest === test) speedTest = null
        r
      }
    }

    Function("cancelSpeedTest") {
      speedTest?.cancel()
      speedTest = null
    }

    AsyncFunction("tcpPing") { host: String, port: Int, count: Int, timeout: Int, promise: Promise ->
      bg(promise) { NetInfo.tcpPing(host, port, count.coerceIn(1, 50), timeout.coerceIn(300, 10000)) }
    }

    AsyncFunction("resolve") { host: String, promise: Promise -> bg(promise) { NetInfo.resolve(host) } }

    AsyncFunction("networkInfo") { promise: Promise -> bg(promise) { NetInfo.info(context) } }
  }
}
