package expo.modules.mmega

import android.app.AppOpsManager
import android.app.usage.NetworkStats
import android.app.usage.NetworkStatsManager
import android.content.Context
import android.net.ConnectivityManager
import android.os.Build
import android.os.Process
import android.telephony.TelephonyManager
import java.util.Calendar

/** Data usage read from the system's own accounting (NetworkStatsManager). */
object Usage {
  const val MOBILE = ConnectivityManager.TYPE_MOBILE
  const val WIFI = ConnectivityManager.TYPE_WIFI

  fun hasAccess(ctx: Context): Boolean {
    val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= 29) {
      ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
    } else {
      @Suppress("DEPRECATION")
      ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
    }
    return if (mode == AppOpsManager.MODE_DEFAULT) {
      ctx.checkCallingOrSelfPermission("android.permission.PACKAGE_USAGE_STATS") == android.content.pm.PackageManager.PERMISSION_GRANTED
    } else mode == AppOpsManager.MODE_ALLOWED
  }

  private fun nsm(ctx: Context) = ctx.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager

  /** Android 10+ accepts null to mean "every SIM"; older versions need the subscriber id. */
  @Suppress("DEPRECATION", "MissingPermission", "HardwareIds")
  private fun subscriber(ctx: Context, type: Int): String? {
    if (type != MOBILE || Build.VERSION.SDK_INT >= 29) return null
    return try {
      (ctx.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager).subscriberId
    } catch (_: Throwable) {
      null
    }
  }

  data class Bytes(var rx: Long = 0, var tx: Long = 0) {
    val total get() = rx + tx
  }

  fun device(ctx: Context, type: Int, start: Long, end: Long): Bytes {
    if (end <= start) return Bytes()
    return try {
      val b = nsm(ctx).querySummaryForDevice(type, subscriber(ctx, type), start, end)
      Bytes(b.rxBytes.coerceAtLeast(0), b.txBytes.coerceAtLeast(0))
    } catch (_: Throwable) {
      Bytes()
    }
  }

  fun mobileTotal(ctx: Context, start: Long, end: Long) = device(ctx, MOBILE, start, end).total

  class AppBytes {
    val mobile = Bytes()
    val wifi = Bytes()
    var mobileBg = 0L
    var wifiBg = 0L
  }

  /** Per-UID usage over a period, split by network and foreground/background. */
  fun perApp(ctx: Context, start: Long, end: Long): Map<Int, AppBytes> {
    val out = HashMap<Int, AppBytes>()
    for (type in intArrayOf(MOBILE, WIFI)) {
      var stats: NetworkStats? = null
      try {
        stats = nsm(ctx).querySummary(type, subscriber(ctx, type), start, end)
        val bucket = NetworkStats.Bucket()
        while (stats.hasNextBucket()) {
          stats.getNextBucket(bucket)
          val a = out.getOrPut(bucket.uid) { AppBytes() }
          val target = if (type == MOBILE) a.mobile else a.wifi
          target.rx += bucket.rxBytes
          target.tx += bucket.txBytes
          if (bucket.state == NetworkStats.Bucket.STATE_DEFAULT) {
            if (type == MOBILE) a.mobileBg += bucket.rxBytes + bucket.txBytes
            else a.wifiBg += bucket.rxBytes + bucket.txBytes
          }
        }
      } catch (_: Throwable) {
      } finally {
        try { stats?.close() } catch (_: Throwable) {}
      }
    }
    return out
  }

  fun dayStart(offsetDays: Int = 0, now: Long = System.currentTimeMillis()): Long {
    val c = Calendar.getInstance()
    c.timeInMillis = now
    c.set(Calendar.HOUR_OF_DAY, 0)
    c.set(Calendar.MINUTE, 0)
    c.set(Calendar.SECOND, 0)
    c.set(Calendar.MILLISECOND, 0)
    c.add(Calendar.DAY_OF_YEAR, offsetDays)
    return c.timeInMillis
  }

  /** Device usage for each of the last [days] days (oldest first). */
  fun daily(ctx: Context, days: Int): List<Map<String, Any?>> {
    val now = System.currentTimeMillis()
    val out = ArrayList<Map<String, Any?>>()
    for (i in days - 1 downTo 0) {
      val s = dayStart(-i)
      val e = if (i == 0) now else dayStart(-i + 1)
      val m = device(ctx, MOBILE, s, e)
      val w = device(ctx, WIFI, s, e)
      out.add(mapOf("start" to s.toDouble(), "mobile" to m.total.toDouble(), "wifi" to w.total.toDouble()))
    }
    return out
  }

  /** Usage of one app for each of the last [days] days, from the 2-hour history buckets. */
  fun appDaily(ctx: Context, uid: Int, days: Int): List<Map<String, Any?>> {
    val starts = LongArray(days) { dayStart(-(days - 1 - it)) }
    val mobile = LongArray(days)
    val wifi = LongArray(days)
    val now = System.currentTimeMillis()
    for (type in intArrayOf(MOBILE, WIFI)) {
      var stats: NetworkStats? = null
      try {
        stats = nsm(ctx).queryDetailsForUid(type, subscriber(ctx, type), starts[0], now, uid)
        val b = NetworkStats.Bucket()
        while (stats.hasNextBucket()) {
          stats.getNextBucket(b)
          val mid = (b.startTimeStamp + b.endTimeStamp) / 2
          var idx = -1
          for (k in days - 1 downTo 0) if (mid >= starts[k]) { idx = k; break }
          if (idx < 0) continue
          if (type == MOBILE) mobile[idx] += b.rxBytes + b.txBytes else wifi[idx] += b.rxBytes + b.txBytes
        }
      } catch (_: Throwable) {
      } finally {
        try { stats?.close() } catch (_: Throwable) {}
      }
    }
    return (0 until days).map { mapOf("start" to starts[it].toDouble(), "mobile" to mobile[it].toDouble(), "wifi" to wifi[it].toDouble()) }
  }

  /** Mobile usage per hour of today, used to spot night-time background drain. */
  fun hourlyToday(ctx: Context): List<Double> {
    val start = dayStart()
    val now = System.currentTimeMillis()
    val out = ArrayList<Double>()
    var h = 0
    while (h < 24) {
      val s = start + h * 3_600_000L
      if (s >= now) {
        out.add(0.0)
      } else {
        out.add(mobileTotal(ctx, s, minOf(now, s + 3_600_000L)).toDouble())
      }
      h++
    }
    return out
  }

  /** Plan status computed the same way for the app, the notification and the alerts. */
  fun planStatus(ctx: Context, plan: PlanConfig): Map<String, Any?>? {
    val c = Plans.cycle(plan) ?: return null
    val now = System.currentTimeMillis()
    val measured = mobileTotal(ctx, c.start, minOf(now, c.end))
    val used = (measured + Plans.offsetFor(plan, c)).coerceAtLeast(0)
    val recentStart = maxOf(c.start, now - 3 * 3_600_000L)
    val recent = mobileTotal(ctx, recentStart, now)
    val today = mobileTotal(ctx, maxOf(c.start, dayStart()), now)
    return mapOf(
      "cycleStart" to c.start.toDouble(),
      "cycleEnd" to c.end.toDouble(),
      "expired" to c.expired,
      "measured" to measured.toDouble(),
      "used" to used.toDouble(),
      "volume" to plan.volumeBytes.toDouble(),
      "recent" to recent.toDouble(),
      "recentSpan" to (now - recentStart).toDouble(),
      "today" to today.toDouble(),
    )
  }
}
