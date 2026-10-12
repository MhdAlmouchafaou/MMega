package expo.modules.mmega

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

/** Per-app firewall rule: block on mobile data, on Wi-Fi, or whenever the app is not on screen. */
data class AppRule(val mobile: Boolean, val wifi: Boolean, val background: Boolean)

data class PlanConfig(
  val enabled: Boolean,
  val volumeBytes: Long,
  val startAt: Long,
  val periodDays: Int,
  val renew: Boolean,
  val offsetBytes: Long,
  val offsetCycle: Long,
  val dailyLimitBytes: Long,
  val alerts: List<Int>,
  val cutoff: Boolean,
)

data class Config(
  val plan: PlanConfig,
  val monitorEnabled: Boolean,
  val showToday: Boolean,
  val speedIcon: Boolean,
  val firewallEnabled: Boolean,
  val rules: Map<String, AppRule>,
  val economy: Boolean,
  val whitelist: Set<String>,
  val screenOff: Boolean,
)

/**
 * The JS side owns the settings and pushes them here as JSON; services read them back from
 * SharedPreferences so they keep working when the app is closed or after a reboot.
 */
object Store {
  private const val NAME = "mmega"
  const val KEY_CONFIG = "config"

  fun prefs(ctx: Context): SharedPreferences = ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)

  fun rawConfig(ctx: Context): String = prefs(ctx).getString(KEY_CONFIG, null) ?: "{}"

  fun saveConfig(ctx: Context, json: String) {
    prefs(ctx).edit().putString(KEY_CONFIG, json).apply()
  }

  fun config(ctx: Context): Config = parse(rawConfig(ctx))

  /** Flips the economy flag directly in the stored JSON (used by the notification action). */
  fun setEconomy(ctx: Context, on: Boolean) {
    val root = try { JSONObject(rawConfig(ctx)) } catch (_: Throwable) { JSONObject() }
    val fw = root.optJSONObject("firewall") ?: JSONObject().also { root.put("firewall", it) }
    fw.put("economy", on)
    if (on) fw.put("enabled", true)
    saveConfig(ctx, root.toString())
  }

  fun parse(json: String): Config {
    val root = try { JSONObject(json) } catch (_: Throwable) { JSONObject() }
    val p = root.optJSONObject("plan") ?: JSONObject()
    val alerts = mutableListOf<Int>()
    p.optJSONArray("alerts")?.let { a -> for (i in 0 until a.length()) alerts.add(a.optInt(i)) }
    val plan = PlanConfig(
      enabled = p.optBoolean("enabled", false),
      volumeBytes = p.optLong("volumeBytes", 0L),
      startAt = p.optLong("startAt", 0L),
      periodDays = p.optInt("periodDays", 30).coerceAtLeast(1),
      renew = p.optBoolean("renew", false),
      offsetBytes = p.optLong("offsetBytes", 0L),
      offsetCycle = p.optLong("offsetCycle", 0L),
      dailyLimitBytes = p.optLong("dailyLimitBytes", 0L),
      alerts = if (alerts.isEmpty()) listOf(50, 80, 95) else alerts,
      cutoff = p.optBoolean("cutoff", false),
    )
    val m = root.optJSONObject("monitor") ?: JSONObject()
    val f = root.optJSONObject("firewall") ?: JSONObject()
    val rules = mutableMapOf<String, AppRule>()
    f.optJSONObject("rules")?.let { r ->
      val keys = r.keys()
      while (keys.hasNext()) {
        val k = keys.next()
        val o = r.optJSONObject(k) ?: continue
        val rule = AppRule(o.optBoolean("m"), o.optBoolean("w"), o.optBoolean("b"))
        if (rule.mobile || rule.wifi || rule.background) rules[k] = rule
      }
    }
    val wl = mutableSetOf<String>()
    f.optJSONArray("whitelist")?.let { a -> for (i in 0 until a.length()) a.optString(i)?.takeIf { it.isNotEmpty() }?.let(wl::add) }
    return Config(
      plan = plan,
      monitorEnabled = m.optBoolean("enabled", false),
      showToday = m.optBoolean("showToday", true),
      speedIcon = m.optBoolean("speedIcon", true),
      firewallEnabled = f.optBoolean("enabled", false),
      rules = rules,
      economy = f.optBoolean("economy", false),
      whitelist = wl,
      screenOff = f.optBoolean("screenOff", false),
    )
  }
}

/** Current billing cycle of the data plan. */
data class Cycle(val start: Long, val end: Long, val expired: Boolean)

object Plans {
  private const val DAY = 86_400_000L

  fun cycle(plan: PlanConfig, now: Long = System.currentTimeMillis()): Cycle? {
    if (!plan.enabled || plan.volumeBytes <= 0 || plan.startAt <= 0) return null
    val period = plan.periodDays * DAY
    if (now < plan.startAt) return Cycle(plan.startAt, plan.startAt + period, false)
    if (!plan.renew) {
      val end = plan.startAt + period
      return Cycle(plan.startAt, end, now >= end)
    }
    val n = (now - plan.startAt) / period
    val start = plan.startAt + n * period
    return Cycle(start, start + period, false)
  }

  /** The manual correction only applies to the cycle it was entered in. */
  fun offsetFor(plan: PlanConfig, cycle: Cycle): Long =
    if (plan.offsetCycle == 0L || plan.offsetCycle == cycle.start) plan.offsetBytes else 0L
}
