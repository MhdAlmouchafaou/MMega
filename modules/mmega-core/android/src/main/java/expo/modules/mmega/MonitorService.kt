package expo.modules.mmega

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.TrafficStats
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.graphics.drawable.IconCompat

/**
 * Foreground service: live speed in the status bar, today's usage in the notification,
 * data-plan alerts and the automatic cut-off when the plan runs out.
 */
class MonitorService : Service() {
  companion object {
    const val CHANNEL_MONITOR = "mmega_monitor"
    const val CHANNEL_ALERTS = "mmega_alerts"
    const val NOTIF_ID = 4101
    const val ACTION_ECO = "expo.modules.mmega.ECO"
    const val ACTION_REFRESH = "expo.modules.mmega.REFRESH"
    const val ACTION_STOP = "expo.modules.mmega.STOP"

    @Volatile var running = false

    fun start(ctx: Context) {
      val i = Intent(ctx, MonitorService::class.java)
      try {
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
      } catch (_: Throwable) {
      }
    }

    fun refresh(ctx: Context) {
      if (!running) return
      try { ctx.startService(Intent(ctx, MonitorService::class.java).setAction(ACTION_REFRESH)) } catch (_: Throwable) {}
    }

    fun stop(ctx: Context) {
      try { ctx.stopService(Intent(ctx, MonitorService::class.java)) } catch (_: Throwable) {}
    }

    fun ensureChannels(ctx: Context) {
      if (Build.VERSION.SDK_INT < 26) return
      val nm = ctx.getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(CHANNEL_MONITOR) == null) {
        nm.createNotificationChannel(
          NotificationChannel(CHANNEL_MONITOR, "Compteur de vitesse", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Vitesse en temps réel et consommation du jour"
            setShowBadge(false)
            enableVibration(false)
            setSound(null, null)
          }
        )
      }
      if (nm.getNotificationChannel(CHANNEL_ALERTS) == null) {
        nm.createNotificationChannel(
          NotificationChannel(CHANNEL_ALERTS, "Alertes forfait", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Seuils du forfait, limite quotidienne et coupure automatique"
          }
        )
      }
    }
  }

  private lateinit var thread: HandlerThread
  private lateinit var handler: Handler
  private var lastRx = -1L
  private var lastTx = -1L
  private var lastAt = 0L
  private var down = 0.0
  private var up = 0.0
  private var ticks = 0
  private var todayMobile = 0L
  private var todayWifi = 0L
  private var plan: Map<String, Any?>? = null
  private var config: Config = Store.parse("{}")
  private var vpnReady = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureChannels(this)
    running = true
    config = Store.config(this)
    startInForeground(build())
    thread = HandlerThread("mmega-monitor").apply { start() }
    handler = Handler(thread.looper)
    handler.post(tick)
  }

  private fun startInForeground(n: Notification) {
    try {
      ServiceCompat.startForeground(
        this, NOTIF_ID, n,
        if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
      )
    } catch (_: Throwable) {
      stopSelf()
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopSelf()
        return START_NOT_STICKY
      }
      ACTION_ECO -> {
        val now = !Store.config(this).economy
        Store.setEconomy(this, now)
        FirewallService.apply(this)
        handler.post { config = Store.config(this); ticks = 0 }
      }
      ACTION_REFRESH -> handler.post { config = Store.config(this); ticks = 0 }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    handler.removeCallbacksAndMessages(null)
    thread.quitSafely()
    super.onDestroy()
  }

  private val tick = object : Runnable {
    override fun run() {
      try {
        sample()
        if (ticks % 20 == 0) refreshUsage()
        ticks++
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        // While the screen is off nobody sees the speed: slow down to save battery.
        if (pm.isInteractive) NotificationManagerCompat.from(this@MonitorService).notify(NOTIF_ID, build())
        handler.postDelayed(this, if (pm.isInteractive) 1000L else 15_000L)
      } catch (_: SecurityException) {
        handler.postDelayed(this, 5000L)
      } catch (_: Throwable) {
        handler.postDelayed(this, 2000L)
      }
    }
  }

  private fun sample() {
    val rx = TrafficStats.getTotalRxBytes()
    val tx = TrafficStats.getTotalTxBytes()
    val now = SystemClock.elapsedRealtime()
    if (lastRx >= 0 && rx >= lastRx && tx >= lastTx && now > lastAt) {
      val dt = (now - lastAt) / 1000.0
      // Light smoothing so the figure doesn't flicker.
      down = down * 0.35 + ((rx - lastRx) / dt) * 0.65
      up = up * 0.35 + ((tx - lastTx) / dt) * 0.65
    }
    lastRx = rx
    lastTx = tx
    lastAt = now
  }

  private fun refreshUsage() {
    vpnReady = try { VpnService.prepare(this) == null } catch (_: Throwable) { false }
    // Restart the firewall if Android stopped it while it was idle (no VPN interface up).
    // Never fight the user: after a revoke (VPN turned off in Android settings) wait for the app.
    if (vpnReady && !FirewallService.running && !Store.prefs(this).getBoolean("fw_revoked", false) && FirewallService.wanted(this)) {
      FirewallService.apply(this)
    }
    if (!Usage.hasAccess(this)) return
    val start = Usage.dayStart()
    val now = System.currentTimeMillis()
    todayMobile = Usage.device(this, Usage.MOBILE, start, now).total
    todayWifi = Usage.device(this, Usage.WIFI, start, now).total
    plan = Usage.planStatus(this, config.plan)
    checkAlerts()
  }

  private fun num(key: String): Long = (plan?.get(key) as? Double)?.toLong() ?: 0L

  private fun checkAlerts() {
    val prefs = Store.prefs(this)
    val p = plan
    val cfg = config.plan
    if (p != null && p["expired"] != true) {
      val cycle = num("cycleStart")
      val used = num("used")
      val volume = num("volume").coerceAtLeast(1)
      val pct = (used * 100 / volume).toInt()
      val firedKey = "fired_$cycle"
      val fired = prefs.getString(firedKey, "")!!.split(',').filter { it.isNotEmpty() }.toMutableSet()
      val hit = (cfg.alerts + 100).filter { pct >= it && !fired.contains(it.toString()) }.maxOrNull()
      if (hit != null) {
        // Mark every threshold below as done too: one notification, not a burst.
        (cfg.alerts + 100).filter { it <= pct }.forEach { fired.add(it.toString()) }
        prefs.edit().putString(firedKey, fired.joinToString(",")).apply()
        val left = (volume - used).coerceAtLeast(0)
        if (hit >= 100) {
          val cut = cfg.cutoff
          if (cut) {
            prefs.edit().putLong("cutoff_cycle", cycle).apply()
            FirewallService.apply(this)
          }
          alert(
            11, "Forfait épuisé",
            if (cut) "Les données mobiles sont coupées par MMega, sauf pour vos applications essentielles."
            else "Vous avez consommé tout votre forfait (${Fmt.bytes(volume)})."
          )
        } else {
          val rate = num("recent").toDouble() / (num("recentSpan").coerceAtLeast(60_000)).toDouble()
          val eta = if (rate > 0) (left / rate).toLong() else 0L
          alert(
            10, "Forfait consommé à $hit %",
            "Il reste ${Fmt.bytes(left)}" + if (eta in 1 until 30L * 86_400_000L) " · à ce rythme, épuisé dans ${Fmt.duration(eta)}" else ""
          )
        }
      }
      // Cut-off only lasts for the cycle it was triggered in.
      val cutCycle = prefs.getLong("cutoff_cycle", 0L)
      if (cutCycle != 0L && (cutCycle != cycle || !cfg.cutoff || pct < 100)) {
        prefs.edit().remove("cutoff_cycle").apply()
        FirewallService.apply(this)
      }
    }
    if (cfg.dailyLimitBytes > 0 && todayMobile >= cfg.dailyLimitBytes) {
      val key = "daily_${Usage.dayStart()}"
      if (!prefs.getBoolean(key, false)) {
        prefs.edit().putBoolean(key, true).apply()
        alert(12, "Limite quotidienne atteinte", "${Fmt.bytes(todayMobile)} de données mobiles aujourd’hui (limite ${Fmt.bytes(cfg.dailyLimitBytes)}).")
      }
    }
  }

  private fun openApp(path: String? = null): PendingIntent {
    val i = (packageManager.getLaunchIntentForPackage(packageName) ?: Intent()).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
      if (path != null) data = android.net.Uri.parse("mmega://$path")
    }
    return PendingIntent.getActivity(this, path?.hashCode() ?: 0, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun alert(id: Int, title: String, text: String) {
    try {
      val n = NotificationCompat.Builder(this, CHANNEL_ALERTS)
        .setSmallIcon(R.drawable.mmega_notif)
        .setColor(0xFF5B3BF4.toInt())
        .setContentTitle(title)
        .setContentText(text)
        .setStyle(NotificationCompat.BigTextStyle().bigText(text))
        .setContentIntent(openApp())
        .setAutoCancel(true)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .build()
      NotificationManagerCompat.from(this).notify(id, n)
    } catch (_: SecurityException) {
    }
  }

  private fun build(): Notification {
    val total = down + up
    val b = NotificationCompat.Builder(this, CHANNEL_MONITOR)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setShowWhen(false)
      .setColor(0xFF5B3BF4.toInt())
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(openApp())
      .setContentTitle("↓ ${Fmt.speed(down)}   ↑ ${Fmt.speed(up)}")
    if (config.speedIcon) {
      b.setSmallIcon(IconCompat.createWithBitmap(SpeedIcon.render(total)))
    } else {
      b.setSmallIcon(R.drawable.mmega_notif)
    }
    val parts = ArrayList<String>()
    if (config.showToday) parts.add("Aujourd’hui · Mobile ${Fmt.bytes(todayMobile)} · Wi‑Fi ${Fmt.bytes(todayWifi)}")
    val p = plan
    if (p != null) {
      val volume = num("volume").coerceAtLeast(1)
      val used = num("used")
      if (p["expired"] == true) {
        parts.add("Forfait expiré")
      } else {
        val pct = (used * 100 / volume).toInt().coerceIn(0, 100)
        parts.add("Forfait : ${Fmt.bytes((volume - used).coerceAtLeast(0))} restants ($pct %)")
        b.setProgress(100, pct, false)
      }
    }
    if (parts.isNotEmpty()) {
      b.setContentText(parts[0])
      b.setStyle(NotificationCompat.BigTextStyle().bigText(parts.joinToString("\n")))
    }
    val eco = config.economy
    val ecoIntent = PendingIntent.getService(
      this, 1, Intent(this, MonitorService::class.java).setAction(ACTION_ECO),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    if (vpnReady) {
      b.addAction(0, if (eco) "Désactiver le mode Éco" else "Mode Éco", ecoIntent)
    }
    b.addAction(0, "Tester le débit", openApp("speedtest"))
    return b.build()
  }
}
