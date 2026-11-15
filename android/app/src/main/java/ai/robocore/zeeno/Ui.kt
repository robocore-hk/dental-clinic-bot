package ai.robocore.zeeno

import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.res.ResourcesCompat
import kotlin.math.roundToInt

const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT

object C {
    const val BLUE = 0xFF1F1FFF.toInt()
    const val SILVER = 0xFFB3C1C9.toInt()
    const val NAVY = 0xFF000F3A.toInt()
    const val INK = 0xFF101010.toInt()
    const val INK2 = 0xFF1A1E23.toInt()
    const val MIST = 0xFFF4F7F9.toInt()
    const val LINE = 0xFFDFE3E6.toInt()
    const val WHITE = 0xFFFFFFFF.toInt()
    const val GREEN = 0xFF467C45.toInt()
    const val MUTED = 0xFF7A7A7A.toInt()
    const val BODY = 0xFF54595F.toInt()
    const val DANGER = 0xFF9B3A3A.toInt()
}

object U {
    var s = 1f
    lateinit var display: Typeface
    lateinit var displayBold: Typeface
    lateinit var body: Typeface
    lateinit var bodyMed: Typeface
    lateinit var cjk: Typeface
    lateinit var cjkT: Typeface
    fun init(a: android.app.Activity) {
        s = a.resources.displayMetrics.widthPixels / 1920f
        display = ResourcesCompat.getFont(a, R.font.space_grotesk_semibold) ?: Typeface.DEFAULT_BOLD
        displayBold = ResourcesCompat.getFont(a, R.font.space_grotesk_bold) ?: display
        body = ResourcesCompat.getFont(a, R.font.dm_sans_regular) ?: Typeface.DEFAULT
        bodyMed = ResourcesCompat.getFont(a, R.font.dm_sans_medium) ?: body
        cjk = ResourcesCompat.getFont(a, R.font.noto_sans_sc) ?: body
        cjkT = ResourcesCompat.getFont(a, R.font.noto_sans_tc) ?: cjk
    }
    fun d(px: Int) = (px * s).roundToInt().coerceAtLeast(1)
    fun f(px: Int) = px * s
    fun face(weight: Int): Typeface = when (I18n.lang) {
        "zh-Hant" -> cjkT
        "zh-Hans" -> cjk
        else -> if (weight >= 650) displayBold else if (weight >= 560) display else if (weight >= 500) bodyMed else body
    }
}

fun rounded(color: Int, r: Int, stroke: Int = 0, sw: Int = 0) = GradientDrawable().apply {
    shape = GradientDrawable.RECTANGLE
    cornerRadius = U.f(r)
    setColor(color)
    if (sw > 0) setStroke(U.d(sw), stroke)
}

fun View.tap(block: () -> Unit) {
    isClickable = true
    setOnClickListener {
        animate().scaleX(0.98f).scaleY(0.98f).setDuration(60).withEndAction {
            animate().scaleX(1f).scaleY(1f).setDuration(80).start(); block()
        }.start()
    }
}
fun View.shown(on: Boolean) { visibility = if (on) View.VISIBLE else View.GONE }
fun View.fadeIn() { alpha = 0f; animate().alpha(1f).setDuration(180).start() }
fun View.wiggle() {
    animate().translationX(U.f(14)).setDuration(40).withEndAction {
        animate().translationX(-U.f(14)).setDuration(50).withEndAction { animate().translationX(0f).setDuration(40).start() }.start()
    }.start()
}

fun MainActivity.lp(w: Int = WRAP, h: Int = WRAP, l: Int = 0, t: Int = 0, r: Int = 0, b: Int = 0, weight: Float = 0f) =
    LinearLayout.LayoutParams(w, h, weight).apply { setMargins(U.d(l), U.d(t), U.d(r), U.d(b)) }

fun flp(w: Int, h: Int, g: Int, l: Int = 0, t: Int = 0, r: Int = 0, b: Int = 0) =
    android.widget.FrameLayout.LayoutParams(w, h, g).apply { setMargins(U.d(l), U.d(t), U.d(r), U.d(b)) }

fun MainActivity.tv(text: String, size: Int, weight: Int = 500, color: Int = C.INK, lines: Int = 12): TextView =
    TextView(this).apply {
        this.text = text; textSize = U.f(size); setTextColor(color); typeface = U.face(weight)
        maxLines = lines; setLineSpacing(0f, 1.15f)
    }

fun MainActivity.col(gap: Int = 0, gravity: Int = Gravity.START): LinearLayout =
    LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; this.gravity = gravity; showDividers = LinearLayout.SHOW_DIVIDER_MIDDLE; dividerDrawable = android.graphics.drawable.ColorDrawable(0).apply { /* gap via padding */ }; if (gap > 0) dividerPadding = 0 }

fun MainActivity.row(gap: Int = 0, gravity: Int = Gravity.CENTER_VERTICAL): LinearLayout =
    LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; this.gravity = gravity }

fun MainActivity.gapBox(v: View, gap: Int, vertical: Boolean): View = v

fun MainActivity.stack(vertical: Boolean, gap: Int, gravity: Int = if (vertical) Gravity.START else Gravity.CENTER_VERTICAL, block: LinearLayout.() -> Unit): LinearLayout {
    val box = if (vertical) col(gravity = gravity) else row(gravity = gravity)
    box.block()
    if (gap > 0) {
        for (i in 0 until box.childCount) {
            val c = box.getChildAt(i)
            val p = c.layoutParams as? LinearLayout.LayoutParams ?: continue
            if (i > 0) { if (vertical) p.topMargin = U.d(gap) else p.marginStart = U.d(gap) }
            c.layoutParams = p
        }
    }
    return box
}

fun MainActivity.iconBtn(res: Int, dark: Boolean, size: Int = 88): View {
    val v = ImageView(this).apply {
        setImageResource(res); scaleType = ImageView.ScaleType.CENTER_INSIDE
        background = rounded(if (dark) C.NAVY else C.WHITE, 99, if (dark) C.NAVY else C.LINE, 2)
        setPadding(U.d(22), U.d(22), U.d(22), U.d(22))
    }
    v.layoutParams = LinearLayout.LayoutParams(U.d(size), U.d(size))
    return v
}

fun MainActivity.bigBtn(title: String, sub: String = "", dark: Boolean = false): LinearLayout {
    val box = stack(true, 6) {
        addView(tv(title, 34, 650, if (dark) C.WHITE else C.NAVY, 2))
        if (sub.isNotBlank()) addView(tv(sub, 22, 400, if (dark) C.SILVER else C.BODY, 3))
    }
    box.background = rounded(if (dark) C.NAVY else C.WHITE, 28, if (dark) C.NAVY else C.LINE, 2)
    box.setPadding(U.d(28), U.d(26), U.d(28), U.d(26))
    return box
}

fun MainActivity.statusCard(ok: Boolean, text: String): LinearLayout {
    val box = stack(true, 8) {
        addView(tv(if (ok) I18n.t("reached") else I18n.t("not_confirmed"), 28, 650, if (ok) C.GREEN else C.DANGER, 3))
        addView(tv(text, 24, 400, C.INK, 6))
    }
    box.background = rounded(C.WHITE, 24, if (ok) C.GREEN else C.DANGER, 3)
    box.setPadding(U.d(28), U.d(24), U.d(28), U.d(24))
    return box
}

/** On-screen keyboard so the patient does not depend on the Android IME. */
fun MainActivity.keys(get: () -> String, set: (String) -> Unit, numeric: Boolean = false): LinearLayout {
    val box = stack(true, 10, Gravity.CENTER_HORIZONTAL) {}
    val rows = if (numeric) listOf(listOf("1","2","3"), listOf("4","5","6"), listOf("7","8","9"), listOf("⌫","0","OK"))
    else {
        val accent = if (I18n.lang == "es") listOf("á","é","í","ó","ú","ñ","ü") else emptyList()
        listOf(listOf("1","2","3","4","5","6","7","8","9","0"),
            listOf("q","w","e","r","t","y","u","i","o","p"),
            listOf("a","s","d","f","g","h","j","k","l"),
            listOf("z","x","c","v","b","n","m","⌫"),
            accent + listOf("@",".","-"," "))
    }
    fun press(k: String) {
        if (k == "OK") return
        val cur = get()
        set(if (k == "⌫") cur.dropLast(1) else if (k == " ") cur + " " else cur + k)
    }
    rows.forEach { r ->
        val line = row(gravity = Gravity.CENTER)
        r.forEach { k ->
            val key = tv(if (k == " ") "␣" else k, if (numeric) 36 else 26, 600, C.NAVY).apply {
                gravity = Gravity.CENTER
                background = rounded(C.WHITE, 16, C.LINE, 2)
                if (k != "OK") tap { press(k) }
            }
            val w = if (numeric) U.d(150) else U.d(if (k == " ") 160 else 78)
            line.addView(key, LinearLayout.LayoutParams(w, U.d(if (numeric) 100 else 72)).apply { marginEnd = U.d(8); bottomMargin = U.d(8) })
        }
        box.addView(line)
    }
    return box
}
