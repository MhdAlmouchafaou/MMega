package expo.modules.mmega

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.ParcelFileDescriptor
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Per-app firewall without root. Apps that must be blocked are routed into a local VPN
 * interface that nobody reads: their traffic never leaves the phone. Every other app keeps
 * its normal connection and nothing is ever sent to a server.
 */
class FirewallService : VpnService() {
  companion object {
    const val ACTION_APPLY = "expo.modules.mmega.FW_APPLY"
    const val ACTION_STOP = "expo.modules.mmega.FW_STOP"
    const val EXTRA_FG = "fg"
    private const val FG_ID = 4102

    @Volatile var running = false
    @Volatile var status: Map<String, Any?> = mapOf("running" to false, "active" to false, "mode" to "off", "blocked" to 0, "network" to "none")
    @Volatile var listener: ((Map<String, Any?>) -> Unit)? = null

    fun cutoffActive(ctx: Context, cfg: Config): Boolean {
      if (!cfg.plan.cutoff) return false
      val c = Plans.cycle(cfg.plan) ?: return false
      return Store.prefs(ctx).getLong("cutoff_cycle", 0L) == c.start
    }

    fun wanted(ctx: Context): Boolean {
      val cfg = Store.config(ctx)
      return cfg.firewallEnabled || cfg.economy || cutoffActive(ctx, cfg)
    }

    /** Starts, refreshes or stops the firewall to match the stored settings. */
    fun apply(ctx: Context, foreground: Boolean = false) {
      val consent = try { VpnService.prepare(ctx) == null } catch (_: Throwable) { false }
      if (!wanted(ctx) || !consent) {
        if (running) try { ctx.startService(Intent(ctx, FirewallService::class.java).setAction(ACTION_STOP)) } catch (_: Throwable) {}
        return
      }
      val i = Intent(ctx, FirewallService::class.java).setAction(ACTION_APPLY)
      if (!foreground) {
        try {
          ctx.startService(i)
          return
        } catch (_: Throwable) {
        }
      }
      try {
        i.putExtra(EXTRA_FG, true)
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
      } catch (_: Throwable) {
      }
    }
  }

  private lateinit var thread: HandlerThread
  private lateinit var handler: Handler
  private var pfd: ParcelFileDescriptor? = null
  private var lastKey = ""
  private var network = "none"
  private var screenOn = true
  private var foregroundPkg: String? = null
  private var lastEventQuery = 0L
  private var watchingForeground = false
  private var callback: ConnectivityManager.NetworkCallback? = null

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      screenOn = intent.action != Intent.ACTION_SCREEN_OFF
      handler.post { rebuild() }
    }
  }

  override fun onCreate() {
    super.onCreate()
    running = true
    thread = HandlerThread("mmega-firewall").apply { start() }
    handler = Handler(thread.looper)
    screenOn = (getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_SCREEN_ON)
    }
    if (Build.VERSION.SDK_INT >= 33) registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    else registerReceiver(screenReceiver, filter)
    val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    network = typeOf(cm.getNetworkCapabilities(cm.activeNetwork))
    val cb = object : ConnectivityManager.NetworkCallback() {
      override fun onCapabilitiesChanged(n: Network, caps: NetworkCapabilities) {
        val t = typeOf(caps)
        if (t != network) {
          network = t
          handler.post { rebuild() }
        }
      }

      override fun onLost(n: Network) {
        handler.postDelayed({
          val now = typeOf(cm.getNetworkCapabilities(cm.activeNetwork))
          if (now != network) {
            network = now
            rebuild()
          }
        }, 600)
      }
    }
    try {
      cm.registerDefaultNetworkCallback(cb, handler)
      callback = cb
    } catch (_: Throwable) {
    }
  }

  private fun typeOf(caps: NetworkCapabilities?): String = when {
    caps == null -> "none"
    caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) && !caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) && !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> network
    caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "mobile"
    caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "wifi"
    else -> "other"
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val fg = intent?.getBooleanExtra(EXTRA_FG, false) == true
    if (fg) promote()
    when (intent?.action) {
      ACTION_STOP -> {
        handler.post {
          close()
          publish()
          stopSelf()
        }
        return START_NOT_STICKY
      }
      else -> handler.post {
        lastKey = ""
        rebuild()
        if (fg) demote()
      }
    }
    return START_STICKY
  }

  private fun promote() {
    try {
      if (Build.VERSION.SDK_INT >= 26) {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel("mmega_firewall") == null) {
          nm.createNotificationChannel(NotificationChannel("mmega_firewall", "Pare-feu", NotificationManager.IMPORTANCE_MIN))
        }
      }
      val n = NotificationCompat.Builder(this, "mmega_firewall")
        .setSmallIcon(R.drawable.mmega_notif)
        .setContentTitle("Pare-feu MMega")
        .setContentText("Activation du pare-feu…")
        .setSilent(true)
        .build()
      ServiceCompat.startForeground(this, FG_ID, n, if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0)
    } catch (_: Throwable) {
    }
  }

  private fun demote() {
    // Once the VPN interface is up the system keeps the service bound; no notification needed.
    try { ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE) } catch (_: Throwable) {}
  }

  override fun onRevoke() {
    // Another VPN took over, or the user turned it off in Android settings.
    handler.post {
      close()
      Store.prefs(this).edit().putBoolean("fw_revoked", true).apply()
      publish()
      stopSelf()
    }
  }

  override fun onDestroy() {
    running = false
    try { unregisterReceiver(screenReceiver) } catch (_: Throwable) {}
    try { callback?.let { (getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).unregisterNetworkCallback(it) } } catch (_: Throwable) {}
    handler.removeCallbacksAndMessages(null)
    close()
    publish()
    thread.quitSafely()
    super.onDestroy()
  }

  private fun close() {
    try { pfd?.close() } catch (_: Throwable) {}
    pfd = null
    lastKey = ""
  }

  private fun publish(mode: String = if (pfd != null) status["mode"] as? String ?: "off" else "off", blocked: Int = if (pfd != null) (status["blocked"] as? Int ?: 0) else 0) {
    status = mapOf(
      "running" to running,
      "active" to (pfd != null),
      "mode" to mode,
      "blocked" to blocked,
      "network" to network,
      "screenOn" to screenOn,
      "foreground" to foregroundPkg,
    )
    try { listener?.invoke(status) } catch (_: Throwable) {}
  }

  private val foregroundPoll = object : Runnable {
    override fun run() {
      if (!watchingForeground) return
      if (screenOn) {
        val changed = updateForeground()
        if (changed) rebuild()
      }
      handler.postDelayed(this, 1500L)
    }
  }

  /** Reads which app is on screen from the usage events (needs usage access). */
  private fun updateForeground(): Boolean {
    return try {
      val usm = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val now = System.currentTimeMillis()
      val from = if (lastEventQuery == 0L) now - 2 * 3_600_000L else lastEventQuery - 2000
      val events = usm.queryEvents(from, now)
      lastEventQuery = now
      val e = UsageEvents.Event()
      var latest: String? = null
      while (events.hasNextEvent()) {
        events.getNextEvent(e)
        if (e.eventType == 1 /* ACTIVITY_RESUMED / MOVE_TO_FOREGROUND */) latest = e.packageName
      }
      if (latest != null && latest != foregroundPkg) {
        foregroundPkg = latest
        true
      } else false
    } catch (_: Throwable) {
      false
    }
  }

  private fun rebuild() {
    val cfg = Store.config(this)
    val cutoff = cutoffActive(this, cfg)
    if (!cfg.firewallEnabled && !cfg.economy && !cutoff) {
      close()
      publish("off", 0)
      stopSelf()
      return
    }
    val needsForeground = cfg.firewallEnabled && cfg.rules.values.any { it.background }
    if (needsForeground != watchingForeground) {
      watchingForeground = needsForeground
      if (needsForeground) {
        updateForeground()
        handler.postDelayed(foregroundPoll, 1500L)
      } else handler.removeCallbacks(foregroundPoll)
    }

    if (network == "none") {
      publish()
      return
    }
    val mobile = network == "mobile"
    val self = packageName
    val economy = mobile && cfg.economy
    val sleeping = !screenOn && cfg.firewallEnabled && cfg.screenOff
    val blockAll = economy || (mobile && cutoff) || sleeping
    val mode: String
    val apps: List<String>
    if (blockAll) {
      mode = if (economy) "economy" else if (mobile && cutoff) "cutoff" else "sleep"
      apps = (cfg.whitelist + self).sorted()
    } else {
      mode = "rules"
      apps = if (!cfg.firewallEnabled) emptyList() else cfg.rules.filter { (pkg, r) ->
        pkg != self && ((mobile && r.mobile) || (!mobile && r.wifi) || (r.background && (!screenOn || pkg != foregroundPkg)))
      }.keys.sorted()
    }
    val key = "$mode|$network|${apps.joinToString(",")}"
    if (key == lastKey && pfd != null) return
    if (mode == "rules" && apps.isEmpty()) {
      close()
      lastKey = key
      publish("idle", 0)
      return
    }
    val builder = Builder()
      .setSession("MMega")
      .setMtu(1500)
      .addAddress("10.215.173.1", 32)
      .addRoute("0.0.0.0", 0)
    try {
      builder.addAddress("fd00:6d6d:6567::1", 128)
      builder.addRoute("::", 0)
    } catch (_: Throwable) {
    }
    if (Build.VERSION.SDK_INT >= 29) builder.setMetered(false)
    var added = 0
    if (blockAll) {
      for (p in apps) try { builder.addDisallowedApplication(p); added++ } catch (_: Throwable) {}
    } else {
      for (p in apps) try { builder.addAllowedApplication(p); added++ } catch (_: Throwable) {}
      // Without any allowed app the VPN would capture everything: never let that happen.
      if (added == 0) {
        close()
        lastKey = key
        publish("idle", 0)
        return
      }
    }
    try {
      builder.setBlocking(false)
      val next = builder.establish()
      val old = pfd
      pfd = next
      try { old?.close() } catch (_: Throwable) {}
      lastKey = if (next != null) key else ""
      Store.prefs(this).edit().putBoolean("fw_revoked", false).apply()
      val blockedCount = if (blockAll) -1 else added
      publish(if (next != null) mode else "off", blockedCount)
    } catch (_: Throwable) {
      close()
      publish("off", 0)
    }
  }
}
