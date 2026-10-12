package expo.modules.mmega

import android.annotation.SuppressLint
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.TrafficStats
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.telephony.TelephonyManager
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket

object NetInfo {
  private fun cm(ctx: Context) = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

  private fun generation(type: Int): String = when (type) {
    TelephonyManager.NETWORK_TYPE_GPRS, TelephonyManager.NETWORK_TYPE_EDGE, TelephonyManager.NETWORK_TYPE_CDMA,
    TelephonyManager.NETWORK_TYPE_1xRTT, TelephonyManager.NETWORK_TYPE_IDEN, TelephonyManager.NETWORK_TYPE_GSM -> "2G"
    TelephonyManager.NETWORK_TYPE_UMTS, TelephonyManager.NETWORK_TYPE_EVDO_0, TelephonyManager.NETWORK_TYPE_EVDO_A,
    TelephonyManager.NETWORK_TYPE_HSDPA, TelephonyManager.NETWORK_TYPE_HSUPA, TelephonyManager.NETWORK_TYPE_HSPA,
    TelephonyManager.NETWORK_TYPE_EVDO_B, TelephonyManager.NETWORK_TYPE_EHRPD, TelephonyManager.NETWORK_TYPE_HSPAP,
    TelephonyManager.NETWORK_TYPE_TD_SCDMA -> "3G"
    TelephonyManager.NETWORK_TYPE_LTE, TelephonyManager.NETWORK_TYPE_IWLAN, 19 /* LTE_CA */ -> "4G"
    TelephonyManager.NETWORK_TYPE_NR -> "5G"
    else -> ""
  }

  private fun techName(type: Int): String = when (type) {
    TelephonyManager.NETWORK_TYPE_GPRS -> "GPRS"
    TelephonyManager.NETWORK_TYPE_EDGE -> "EDGE"
    TelephonyManager.NETWORK_TYPE_UMTS -> "UMTS"
    TelephonyManager.NETWORK_TYPE_HSDPA -> "HSDPA"
    TelephonyManager.NETWORK_TYPE_HSUPA -> "HSUPA"
    TelephonyManager.NETWORK_TYPE_HSPA -> "HSPA"
    TelephonyManager.NETWORK_TYPE_HSPAP -> "HSPA+"
    TelephonyManager.NETWORK_TYPE_LTE -> "LTE"
    19 -> "LTE-A"
    TelephonyManager.NETWORK_TYPE_NR -> "NR"
    else -> ""
  }

  @SuppressLint("MissingPermission")
  @Suppress("DEPRECATION")
  fun info(ctx: Context): Map<String, Any?> {
    val cm = cm(ctx)
    val net = cm.activeNetwork
    val caps = cm.getNetworkCapabilities(net)
    val lp = cm.getLinkProperties(net)
    val out = HashMap<String, Any?>()
    val type = when {
      caps == null -> "none"
      caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
      caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "mobile"
      caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
      caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "vpn"
      else -> "other"
    }
    out["type"] = type
    out["connected"] = caps != null
    out["validated"] = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
    out["metered"] = caps != null && !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    out["downKbps"] = caps?.linkDownstreamBandwidthKbps ?: 0
    out["upKbps"] = caps?.linkUpstreamBandwidthKbps ?: 0
    out["vpn"] = cm.allNetworks.any { cm.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true }
    out["dataSaver"] = when (cm.restrictBackgroundStatus) {
      ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED -> "on"
      ConnectivityManager.RESTRICT_BACKGROUND_STATUS_WHITELISTED -> "whitelisted"
      else -> "off"
    }
    out["airplane"] = Settings.Global.getInt(ctx.contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0) == 1
    if (lp != null) {
      out["iface"] = lp.interfaceName
      out["ipv4"] = lp.linkAddresses.map { it.address }.filterIsInstance<Inet4Address>().map { it.hostAddress }
      out["ipv6"] = lp.linkAddresses.map { it.address }.filterIsInstance<Inet6Address>().filter { !it.isLinkLocalAddress }.map { it.hostAddress?.substringBefore('%') }
      out["dns"] = lp.dnsServers.mapNotNull { it.hostAddress?.substringBefore('%') }
      if (Build.VERSION.SDK_INT >= 28) {
        out["privateDns"] = lp.isPrivateDnsActive
        out["privateDnsName"] = lp.privateDnsServerName
      }
      if (Build.VERSION.SDK_INT >= 29) out["mtu"] = lp.mtu
      out["gateway"] = lp.routes.firstOrNull { it.isDefaultRoute && it.gateway != null }?.gateway?.hostAddress
    }

    // Mobile
    val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    out["operator"] = tm.networkOperatorName ?: ""
    out["simOperator"] = tm.simOperatorName ?: ""
    out["roaming"] = try { tm.isNetworkRoaming } catch (_: Throwable) { false }
    out["countryIso"] = tm.networkCountryIso ?: ""
    var netType = 0
    try {
      netType = if (Build.VERSION.SDK_INT >= 24) tm.dataNetworkType else tm.networkType
    } catch (_: Throwable) {
      try { netType = tm.networkType } catch (_: Throwable) {}
    }
    out["generation"] = generation(netType)
    out["tech"] = techName(netType)
    if (Build.VERSION.SDK_INT >= 28) {
      try {
        val ss = tm.signalStrength
        if (ss != null) {
          out["signalLevel"] = ss.level
          if (Build.VERSION.SDK_INT >= 29) {
            val cell = ss.cellSignalStrengths.firstOrNull()
            if (cell != null) {
              out["signalDbm"] = cell.dbm
              out["signalAsu"] = cell.asuLevel
            }
          }
        }
      } catch (_: Throwable) {
      }
    }
    out["simState"] = tm.simState
    out["mobileDataOn"] = try { if (Build.VERSION.SDK_INT >= 26) tm.isDataEnabled else true } catch (_: Throwable) { true }

    // Wi-Fi
    if (type == "wifi") {
      val wi: WifiInfo? = if (Build.VERSION.SDK_INT >= 29) (caps?.transportInfo as? WifiInfo)
      else (ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).connectionInfo
      val legacy = try { (ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).connectionInfo } catch (_: Throwable) { null }
      val info = wi ?: legacy
      if (info != null) {
        val ssid = (legacy?.ssid ?: info.ssid)?.trim('"')
        out["ssid"] = if (ssid == null || ssid == "<unknown ssid>" || ssid.isEmpty()) null else ssid
        out["rssi"] = info.rssi
        out["linkSpeed"] = info.linkSpeed
        out["frequency"] = info.frequency
        out["wifiLevel"] = WifiManager.calculateSignalLevel(info.rssi, 5)
        if (Build.VERSION.SDK_INT >= 29) {
          out["txLink"] = info.txLinkSpeedMbps
          out["rxLink"] = info.rxLinkSpeedMbps
        }
        if (Build.VERSION.SDK_INT >= 30) out["wifiStandard"] = info.wifiStandard
      }
    }
    return out
  }

  /** Round trip measured as TCP connection time (works where ICMP ping is not allowed). */
  fun tcpPing(host: String, port: Int, count: Int, timeout: Int): Map<String, Any?> {
    val times = ArrayList<Double>()
    var ip: String? = null
    var dnsMs = -1.0
    var error: String? = null
    try {
      val t0 = SystemClock.elapsedRealtimeNanos()
      val addr = InetAddress.getByName(host)
      dnsMs = (SystemClock.elapsedRealtimeNanos() - t0) / 1e6
      ip = addr.hostAddress
      for (i in 0 until count) {
        val s = Socket()
        try {
          TrafficStats.setThreadStatsTag(0x4D4D)
          val start = SystemClock.elapsedRealtimeNanos()
          s.connect(InetSocketAddress(addr, port), timeout)
          times.add((SystemClock.elapsedRealtimeNanos() - start) / 1e6)
        } catch (e: Throwable) {
          error = e.javaClass.simpleName
        } finally {
          try { s.close() } catch (_: Throwable) {}
        }
        if (i < count - 1) Thread.sleep(120)
      }
    } catch (e: Throwable) {
      error = "dns"
    }
    val sorted = times.sorted()
    var jitter = 0.0
    for (i in 1 until times.size) jitter += Math.abs(times[i] - times[i - 1])
    if (times.size > 1) jitter /= (times.size - 1)
    return mapOf(
      "host" to host,
      "ip" to ip,
      "dnsMs" to dnsMs,
      "sent" to count,
      "received" to times.size,
      "loss" to if (count > 0) (count - times.size).toDouble() / count else 1.0,
      "min" to (sorted.firstOrNull() ?: -1.0),
      "avg" to (if (times.isEmpty()) -1.0 else times.average()),
      "median" to (if (sorted.isEmpty()) -1.0 else sorted[sorted.size / 2]),
      "max" to (sorted.lastOrNull() ?: -1.0),
      "jitter" to jitter,
      "times" to times,
      "error" to error,
    )
  }

  fun resolve(host: String): Map<String, Any?> = try {
    val t0 = SystemClock.elapsedRealtimeNanos()
    val all = InetAddress.getAllByName(host)
    mapOf("ok" to true, "ms" to (SystemClock.elapsedRealtimeNanos() - t0) / 1e6, "addresses" to all.mapNotNull { it.hostAddress })
  } catch (e: Throwable) {
    mapOf("ok" to false, "ms" to -1.0, "addresses" to emptyList<String>(), "error" to (e.message ?: e.javaClass.simpleName))
  }
}
