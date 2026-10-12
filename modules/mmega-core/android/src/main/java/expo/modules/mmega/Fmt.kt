package expo.modules.mmega

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import java.util.Locale

object Fmt {
  private fun dec(v: Double, digits: Int) = String.format(Locale.FRANCE, "%.${digits}f", v)

  private const val K = 1024.0
  private const val M = K * K
  private const val G = M * K

  /** Binary units, like the operators' bundles (1 Go = 1024 Mo). */
  fun bytes(b: Long): String {
    val v = b.toDouble().coerceAtLeast(0.0)
    return when {
      v >= G -> "${dec(v / G, if (v >= 100 * G) 0 else if (v >= 10 * G) 1 else 2)} Go"
      v >= M -> "${dec(v / M, if (v >= 100 * M) 0 else 1)} Mo"
      v >= K -> "${dec(v / K, 0)} Ko"
      else -> "${v.toLong()} o"
    }
  }

  fun speed(bps: Double): String {
    val v = bps.coerceAtLeast(0.0)
    return when {
      v >= M -> "${dec(v / M, if (v >= 10 * M) 0 else 1)} Mo/s"
      v >= K -> "${dec(v / K, 0)} Ko/s"
      else -> "${v.toLong()} o/s"
    }
  }

  fun duration(ms: Long): String {
    val min = ms / 60_000
    return when {
      min < 60 -> "$min min"
      min < 48 * 60 -> "${min / 60} h ${(min % 60).toString().padStart(2, '0')}"
      else -> "${min / 1440} j"
    }
  }
}

/** Draws the current speed as a status-bar icon (white on transparent, tinted by the system). */
object SpeedIcon {
  private const val SIZE = 96
  private val big = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    textAlign = Paint.Align.CENTER
  }
  private val small = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    textAlign = Paint.Align.CENTER
    textSize = 38f
  }

  fun render(bps: Double): Bitmap {
    val v = bps.coerceAtLeast(0.0)
    val (num, unit) = when {
      v >= 10 * 1048576.0 -> String.format(Locale.US, "%.0f", v / 1048576.0) to "MB/s"
      v >= 1000 * 1024.0 -> String.format(Locale.US, "%.1f", v / 1048576.0) to "MB/s"
      v >= 1024.0 -> String.format(Locale.US, "%.0f", v / 1024.0) to "KB/s"
      else -> "0" to "KB/s"
    }
    val bmp = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    big.textSize = when (num.length) {
      1, 2 -> 62f
      3 -> 56f
      else -> 46f
    }
    // Squeeze long numbers horizontally so they always fit the square.
    val w = big.measureText(num)
    big.textScaleX = if (w > SIZE - 2) (SIZE - 2) / w else 1f
    c.drawText(num, SIZE / 2f, 56f, big)
    c.drawText(unit, SIZE / 2f, 92f, small)
    return bmp
  }
}
