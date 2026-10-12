package expo.modules.mmega

import android.os.SystemClock
import org.json.JSONObject
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Collections
import java.util.concurrent.atomic.AtomicLong
import kotlin.random.Random

/**
 * Speed test against Cloudflare's public speed endpoints: idle latency and jitter,
 * multi-connection download and upload, and latency under load (bufferbloat).
 */
class SpeedTest(private val emit: (Map<String, Any?>) -> Unit) {
  @Volatile var cancelled = false
  private val open = Collections.synchronizedSet(HashSet<HttpURLConnection>())
  private val dataUsed = AtomicLong(0)

  companion object {
    private const val BASE = "https://speed.cloudflare.com"
  }

  fun cancel() {
    cancelled = true
    synchronized(open) { open.forEach { try { it.disconnect() } catch (_: Throwable) {} } }
  }

  private fun connect(url: String, method: String = "GET"): HttpURLConnection {
    val c = URL(url).openConnection() as HttpURLConnection
    c.requestMethod = method
    c.connectTimeout = 8000
    c.readTimeout = 10000
    c.useCaches = false
    c.setRequestProperty("User-Agent", "MMega/1.0 (Android)")
    c.setRequestProperty("Accept-Encoding", "identity")
    open.add(c)
    return c
  }

  private fun drain(input: InputStream, counter: AtomicLong? = null, deadline: Long = Long.MAX_VALUE) {
    val buf = ByteArray(64 * 1024)
    while (!cancelled) {
      val n = input.read(buf)
      if (n < 0) break
      counter?.addAndGet(n.toLong())
      dataUsed.addAndGet(n.toLong())
      if (SystemClock.elapsedRealtime() > deadline) break
    }
  }

  private fun meta(): Map<String, Any?> = try {
    val c = connect("$BASE/meta")
    val body = c.inputStream.bufferedReader().use { it.readText() }
    open.remove(c)
    dataUsed.addAndGet(body.length.toLong() + 400)
    val o = JSONObject(body)
    mapOf(
      "ip" to o.optString("clientIp"),
      "isp" to o.optString("asOrganization"),
      "city" to o.optString("city"),
      "country" to o.optString("country"),
      "colo" to o.optString("colo"),
    )
  } catch (_: Throwable) {
    emptyMap()
  }

  /** One small request on a kept-alive connection: time to first byte ≈ round trip. */
  private fun pingOnce(): Double? = try {
    val start = SystemClock.elapsedRealtimeNanos()
    val c = connect("$BASE/__down?bytes=0")
    c.inputStream.use { drain(it) }
    val ms = (SystemClock.elapsedRealtimeNanos() - start) / 1e6
    open.remove(c)
    dataUsed.addAndGet(600)
    ms
  } catch (_: Throwable) {
    null
  }

  private fun latency(count: Int, phase: String): Pair<Double, Double> {
    val samples = ArrayList<Double>()
    pingOnce() // warm-up: DNS + TLS handshake
    for (i in 0 until count) {
      if (cancelled) break
      pingOnce()?.let { samples.add(it) }
      emit(mapOf("phase" to phase, "progress" to (i + 1).toDouble() / count, "ping" to (samples.minOrNull() ?: 0.0)))
    }
    if (samples.isEmpty()) return 0.0 to 0.0
    val sorted = samples.sorted()
    val ping = sorted[sorted.size / 4] // lower quartile, robust to spikes
    var jitter = 0.0
    for (i in 1 until samples.size) jitter += Math.abs(samples[i] - samples[i - 1])
    jitter /= (samples.size - 1).coerceAtLeast(1)
    return ping to jitter
  }

  private fun transfer(phase: String, streams: Int, seconds: Double, chunk: Long, capBytes: Long, upload: Boolean): Double {
    val counter = AtomicLong(0)
    val start = SystemClock.elapsedRealtime()
    val deadline = start + (seconds * 1000).toLong()
    val loaded = Collections.synchronizedList(ArrayList<Double>())
    val payload = if (upload) Random.nextBytes(256 * 1024) else ByteArray(0)
    val workers = (0 until streams).map {
      Thread {
        while (!cancelled && SystemClock.elapsedRealtime() < deadline && counter.get() < capBytes) {
          try {
            if (upload) {
              val c = connect("$BASE/__up", "POST")
              c.doOutput = true
              c.setFixedLengthStreamingMode(chunk)
              c.setRequestProperty("Content-Type", "application/octet-stream")
              c.outputStream.use { out ->
                var sent = 0L
                while (sent < chunk && !cancelled) {
                  val n = minOf(payload.size.toLong(), chunk - sent).toInt()
                  out.write(payload, 0, n)
                  sent += n
                  counter.addAndGet(n.toLong())
                  dataUsed.addAndGet(n.toLong())
                  if (SystemClock.elapsedRealtime() > deadline) break
                }
              }
              if (SystemClock.elapsedRealtime() <= deadline && !cancelled) try { c.inputStream.use { drain(it) } } catch (_: Throwable) {}
              open.remove(c)
              c.disconnect()
            } else {
              val c = connect("$BASE/__down?bytes=$chunk")
              c.inputStream.use { drain(it, counter, deadline) }
              open.remove(c)
              c.disconnect()
            }
          } catch (_: Throwable) {
            if (cancelled) break
            Thread.sleep(150)
          }
        }
      }.apply { isDaemon = true; start() }
    }
    // Latency under load, measured while the pipe is full.
    val loadPinger = Thread {
      Thread.sleep(1200)
      while (!cancelled && SystemClock.elapsedRealtime() < deadline - 300) {
        pingOnce()?.let { loaded.add(it) }
        Thread.sleep(350)
      }
    }.apply { isDaemon = true; start() }

    val window = ArrayDeque<Pair<Long, Long>>()
    var warmBytes = -1L
    var warmAt = 0L
    val warmup = 1500L
    var peak = 0.0
    while (!cancelled) {
      Thread.sleep(150)
      val now = SystemClock.elapsedRealtime()
      val bytes = counter.get()
      window.addLast(now to bytes)
      while (window.size > 2 && now - window.first().first > 1000) window.removeFirst()
      val (t0, b0) = window.first()
      val instant = if (now > t0) (bytes - b0) * 8.0 / ((now - t0) / 1000.0) / 1e6 else 0.0
      if (warmBytes < 0 && now - start >= warmup) {
        warmBytes = bytes
        warmAt = now
      }
      peak = maxOf(peak, instant)
      val elapsed = (now - start).toDouble() / (deadline - start)
      val byCap = bytes.toDouble() / capBytes
      emit(mapOf("phase" to phase, "mbps" to instant, "progress" to minOf(1.0, maxOf(elapsed, byCap)), "bytes" to dataUsed.get().toDouble()))
      if (now >= deadline || bytes >= capBytes) break
    }
    workers.forEach { try { it.join(1500) } catch (_: Throwable) {} }
    try { loadPinger.join(800) } catch (_: Throwable) {}
    val end = SystemClock.elapsedRealtime()
    val bytes = counter.get()
    val mbps = if (warmBytes >= 0 && end - warmAt > 300) (bytes - warmBytes) * 8.0 / ((end - warmAt) / 1000.0) / 1e6
    else if (end > start) bytes * 8.0 / ((end - start) / 1000.0) / 1e6 else 0.0
    if (loaded.isNotEmpty()) loadedPing.add(loaded.sorted()[loaded.size / 2])
    return if (mbps.isFinite()) mbps else 0.0
  }

  private val loadedPing = ArrayList<Double>()

  /** Runs the whole test. `light` limits it to about 15 MB of data. */
  fun run(light: Boolean): Map<String, Any?> {
    val info = meta()
    emit(mapOf("phase" to "meta", "progress" to 1.0) + info)
    if (cancelled) return mapOf("cancelled" to true)
    val (ping, jitter) = latency(if (light) 8 else 14, "ping")
    if (cancelled) return mapOf("cancelled" to true)
    val download = transfer("download", if (light) 3 else 6, if (light) 6.0 else 10.0, if (light) 4_000_000 else 25_000_000, if (light) 12_000_000 else 400_000_000, false)
    if (cancelled) return mapOf("cancelled" to true)
    val upload = transfer("upload", if (light) 2 else 4, if (light) 5.0 else 8.0, if (light) 1_000_000 else 8_000_000, if (light) 4_000_000 else 150_000_000, true)
    if (cancelled) return mapOf("cancelled" to true)
    val result = mapOf(
      "ping" to ping,
      "jitter" to jitter,
      "download" to download,
      "upload" to upload,
      "loadedPing" to (loadedPing.maxOrNull() ?: 0.0),
      "dataUsed" to dataUsed.get().toDouble(),
    ) + info
    emit(mapOf("phase" to "done", "progress" to 1.0) + result)
    return result
  }
}
