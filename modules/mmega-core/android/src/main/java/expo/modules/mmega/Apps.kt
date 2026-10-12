package expo.modules.mmega

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import java.io.File
import java.io.FileOutputStream

/** Installed applications that can reach the network, with cached icons. */
object Apps {
  private fun pm(ctx: Context) = ctx.packageManager

  @Suppress("DEPRECATION")
  private fun installed(ctx: Context): List<PackageInfo> =
    if (Build.VERSION.SDK_INT >= 33) {
      pm(ctx).getInstalledPackages(PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
    } else {
      pm(ctx).getInstalledPackages(PackageManager.GET_PERMISSIONS)
    }

  fun list(ctx: Context): List<Map<String, Any?>> {
    val pm = pm(ctx)
    val launchable = HashSet<String>()
    try {
      val intent = android.content.Intent(android.content.Intent.ACTION_MAIN).addCategory(android.content.Intent.CATEGORY_LAUNCHER)
      @Suppress("DEPRECATION")
      pm.queryIntentActivities(intent, 0).forEach { launchable.add(it.activityInfo.packageName) }
    } catch (_: Throwable) {
    }
    val out = ArrayList<Map<String, Any?>>()
    for (p in installed(ctx)) {
      val ai = p.applicationInfo ?: continue
      val internet = p.requestedPermissions?.contains("android.permission.INTERNET") == true
      if (!internet) continue
      val system = (ai.flags and ApplicationInfo.FLAG_SYSTEM) != 0 && (ai.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0
      val label = try { pm.getApplicationLabel(ai).toString() } catch (_: Throwable) { p.packageName }
      out.add(
        mapOf(
          "pkg" to p.packageName,
          "label" to label,
          "uid" to ai.uid,
          "system" to system,
          "launchable" to launchable.contains(p.packageName),
          "self" to (p.packageName == ctx.packageName),
        )
      )
    }
    return out
  }

  private fun toBitmap(d: Drawable, size: Int): Bitmap {
    if (d is BitmapDrawable && d.bitmap != null) return Bitmap.createScaledBitmap(d.bitmap, size, size, true)
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    d.setBounds(0, 0, size, size)
    d.draw(c)
    return bmp
  }

  /** Renders app icons once to PNG files so the list can show them with an image cache. */
  fun icons(ctx: Context, pkgs: List<String>): Map<String, String?> {
    val dir = File(ctx.cacheDir, "appicons").apply { mkdirs() }
    val pm = pm(ctx)
    val out = HashMap<String, String?>()
    for (pkg in pkgs) {
      try {
        @Suppress("DEPRECATION")
        val info = pm.getPackageInfo(pkg, 0)
        @Suppress("DEPRECATION")
        val version = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
        val f = File(dir, "${pkg}_$version.png")
        if (!f.exists()) {
          val d = pm.getApplicationIcon(pkg)
          val bmp = toBitmap(d, 112)
          FileOutputStream(f).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
        out[pkg] = Uri.fromFile(f).toString()
      } catch (_: Throwable) {
        out[pkg] = null
      }
    }
    return out
  }

  fun label(ctx: Context, pkg: String): String =
    try { pm(ctx).getApplicationLabel(pm(ctx).getApplicationInfo(pkg, 0)).toString() } catch (_: Throwable) { pkg }

  fun packagesForUid(ctx: Context, uid: Int): List<String> = try { pm(ctx).getPackagesForUid(uid)?.toList() ?: emptyList() } catch (_: Throwable) { emptyList() }
}
