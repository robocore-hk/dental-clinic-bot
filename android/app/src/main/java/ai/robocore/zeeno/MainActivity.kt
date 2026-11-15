package ai.robocore.zeeno

import android.os.Bundle
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

abstract class Screen(val a: MainActivity) {
    private var view: View? = null
    private var builtLang = ""
    abstract val mode: String
    open val sensitive = false
    protected abstract fun build(): View
    fun view(): View { if (view == null || builtLang != I18n.lang) { view = build(); builtLang = I18n.lang }; return view!! }
    fun rebuild() { view = null }
    open fun onShow() {}
    open fun onHide() {}
    open fun onBack() { a.pop() }
}

class MainActivity : AppCompatActivity() {
    private lateinit var stage: FrameLayout
    lateinit var overlay: FrameLayout; private set
    private val stack = ArrayList<Screen>()
    val top: Screen? get() = stack.lastOrNull()
    var asrTarget: ((String) -> Unit)? = null
    private val idleClear = Runnable { clearSession(false) }
    private val idleHome = Runnable { App.temi.goHome() }
    private val configL: (Config) -> Unit = { applyKiosk(); top?.let { it.rebuild(); if (stack.lastOrNull() === it) showTop() } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        U.init(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val root = FrameLayout(this).apply { setBackgroundColor(C.MIST) }
        stage = FrameLayout(this); root.addView(stage, FrameLayout.LayoutParams(MATCH, MATCH))
        overlay = FrameLayout(this); root.addView(overlay, FrameLayout.LayoutParams(MATCH, MATCH))
        setContentView(root)
        immersive()
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (closeOverlay()) return; top?.onBack() ?: quit() }
        })
        App.temi.onReady = { App.temi.requestPermissions(); applyKiosk(); App.bg { App.temi.loadLocationPoses() } }
        App.temi.onAsr = { text -> asrTarget?.invoke(text) }
        App.agent.onAftercare = { id -> showAftercare(id) }
        App.repo.listeners += configL
        App.agent.start()
        if (App.temi.ready) App.temi.onReady?.invoke()
        push(WelcomeScreen(this))
        armIdle()
    }
    override fun onDestroy() { App.repo.listeners -= configL; App.cancel(idleClear); App.cancel(idleHome); super.onDestroy() }
    override fun onResume() { super.onResume(); immersive() }
    override fun onWindowFocusChanged(hasFocus: Boolean) { super.onWindowFocusChanged(hasFocus); if (hasFocus) immersive() }
    override fun dispatchTouchEvent(ev: MotionEvent): Boolean { if (ev.action == MotionEvent.ACTION_DOWN) armIdle(); return super.dispatchTouchEvent(ev) }

    private fun immersive() {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let { it.hide(WindowInsets.Type.systemBars()); it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE }
        }
    }
    fun applyKiosk() { if (App.temi.ready) App.temi.applyKiosk(App.settings.kiosk) }
    private fun armIdle() {
        App.cancel(idleClear); App.cancel(idleHome)
        App.later(App.settings.idleClearSeconds * 1000L, idleClear)
        if (App.settings.idleHomeMinutes > 0) App.later(App.settings.idleHomeMinutes * 60_000L, idleHome)
    }
    /** Drop anything a patient typed and return to language selection. */
    fun clearSession(speak: Boolean) {
        App.temi.speaker.stop(); asrTarget = null
        I18n.lang = App.settings.defaultLang.takeIf { it in App.settings.languages } ?: "en"
        while (stack.size > 1) { stack.removeLastOrNull()?.onHide() }
        val root = stack.firstOrNull()
        if (root !is WelcomeScreen) { root?.onHide(); stack.clear(); push(WelcomeScreen(this, speak)) }
        else { root.rebuild(); root.reset(speak); showTop() }
    }

    private fun showTop() {
        val s = top ?: return
        stage.removeAllViews()
        val v = s.view(); (v.parent as? FrameLayout)?.removeView(v)
        stage.addView(v, FrameLayout.LayoutParams(MATCH, MATCH)); v.fadeIn()
        App.agent.mode = s.mode
        s.onShow()
    }
    fun replaceTop() { top?.rebuild(); showTop() }
    fun push(s: Screen) { top?.onHide(); stack += s; showTop() }
    fun pop() { if (stack.size <= 1) { quit(); return }; top?.onHide(); stack.removeLastOrNull(); showTop() }
    fun home() { App.temi.speaker.stop(); asrTarget = null; top?.onHide(); while (stack.size > 1) stack.removeLastOrNull(); if (top !is HomeScreen) { stack.clear(); stack += HomeScreen(this) }; showTop() }
    /** Home is the root. An optional screen sits on top, so Back returns home and Back on home quits. */
    fun startJourney(next: Screen?) {
        App.temi.speaker.stop()
        top?.onHide(); stack.clear(); stack += HomeScreen(this); if (next != null) stack += next; showTop()
    }
    fun quit() { App.temi.speaker.stop(); App.temi.stop(); finishAndRemoveTask() }
    fun setLang(l: String) {
        if (l !in App.settings.languages || l == I18n.lang) return
        I18n.lang = l; App.temi.speaker.stop(); val s = top ?: return; s.onHide(); s.rebuild(); showTop()
    }
    fun showAftercare(contentId: String) {
        val item = App.config.content.firstOrNull { it.id == contentId && it.kind == "aftercare" } ?: return
        push(AftercarePatientScreen(this, item))
    }

    fun toast(text: String, ms: Long = 3200) {
        val t = tv(text, 26, 500, C.WHITE).apply { background = rounded(C.NAVY, 99); setPadding(U.d(36), U.d(18), U.d(36), U.d(18)) }
        overlay.addView(t, flp(WRAP, WRAP, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL, 0, 0, 0, 48)); t.fadeIn()
        App.later(ms) { t.animate().alpha(0f).setDuration(200).withEndAction { overlay.removeView(t) }.start() }
    }
    private var sheet: View? = null
    fun showSheet(content: View, width: Int = U.d(880)) {
        closeOverlay()
        val back = FrameLayout(this).apply { setBackgroundColor(0x99000F3A.toInt()); isClickable = true; tap { closeOverlay() } }
        val card = FrameLayout(this).apply { background = rounded(C.WHITE, 36); isClickable = true; setPadding(U.d(40), U.d(36), U.d(40), U.d(36)); addView(content) }
        back.addView(card, FrameLayout.LayoutParams(width, WRAP, Gravity.CENTER))
        overlay.addView(back, FrameLayout.LayoutParams(MATCH, MATCH)); sheet = back
    }
    fun closeOverlay(): Boolean { val s = sheet ?: return false; overlay.removeView(s); sheet = null; return true }

    fun askPin(onOk: () -> Unit) {
        val dots = tv("", 48, 700, C.NAVY).apply { gravity = Gravity.CENTER }
        var entry = ""
        fun press(d: String) {
            if (d == "⌫") { entry = entry.dropLast(1); dots.text = "•".repeat(entry.length); return }
            entry += d; dots.text = "•".repeat(entry.length)
            if (entry.length >= App.settings.pin.length) {
                if (entry == App.settings.pin) { closeOverlay(); onOk() } else { dots.wiggle(); entry = ""; App.later(250) { dots.text = "" }; toast(I18n.t("wrong_pin")) }
            }
        }
        val grid = stack(true, 12, Gravity.CENTER_HORIZONTAL) {}
        listOf(listOf("1","2","3"), listOf("4","5","6"), listOf("7","8","9"), listOf("⌫","0","")).forEach { r ->
            val line = row(gravity = Gravity.CENTER)
            r.forEach { d ->
                val v = if (d.isEmpty()) View(this) else tv(d, 36, 650).apply { gravity = Gravity.CENTER; background = rounded(C.MIST, 18); tap { press(d) } }
                line.addView(v, LinearLayout.LayoutParams(U.d(140), U.d(100)).apply { marginEnd = U.d(12); bottomMargin = U.d(12) })
            }
            grid.addView(line)
        }
        showSheet(stack(true, 16, Gravity.CENTER_HORIZONTAL) { addView(tv(I18n.t("pin"), 36, 650, C.NAVY)); addView(dots); addView(grid) }, U.d(640))
    }

    fun chrome(title: String, kicker: String = "", showHome: Boolean = true): LinearLayout = row().apply {
        addView(iconBtn(R.drawable.ic_arrow_back, false, 84).apply { tap { this@MainActivity.top?.onBack() } })
        addView(stack(true, 4) { if (kicker.isNotBlank()) addView(tv(kicker, 18, 650, C.BLUE, 1)); addView(tv(title, 40, 650, C.NAVY, 2)) }, lp(0, WRAP, l = 18, weight = 1f))
        addView(langPills())
        addView(textBtn(I18n.t("contact"), false).apply { tap { if (this@MainActivity.top !is ContactScreen) push(ContactScreen(this@MainActivity)) } }, lp(l = 12))
        if (showHome) addView(iconBtn(R.drawable.ic_home, true, 84).apply { tap { home() } }, lp(l = 12))
    }
    fun langPills(): LinearLayout = row().apply {
        val langs = App.settings.languages.ifEmpty { listOf("en") }
        langs.forEach { l ->
            val on = l == I18n.lang
            addView(tv(I18n.short(l), 22, 650, if (on) C.WHITE else C.NAVY).apply {
                gravity = Gravity.CENTER
                background = if (on) rounded(C.BLUE, 99) else rounded(C.WHITE, 99, C.LINE, 2)
                tap { setLang(l) }
            }, LinearLayout.LayoutParams(U.d(84), U.d(64)).apply { marginEnd = U.d(8) })
        }
    }
    fun textBtn(label: String, filled: Boolean): TextView = tv(label, 24, 650, if (filled) C.WHITE else C.NAVY).apply {
        gravity = Gravity.CENTER; background = rounded(if (filled) C.BLUE else C.WHITE, 99, if (filled) C.BLUE else C.LINE, 2)
        setPadding(U.d(28), U.d(16), U.d(28), U.d(16))
    }
    fun page(title: String, kicker: String = "", body: (LinearLayout) -> Unit): View {
        val root = FrameLayout(this)
        root.addView(chrome(title, kicker), flp(MATCH, WRAP, Gravity.TOP, 48, 28, 48, 0))
        val scroll = android.widget.ScrollView(this).apply { isVerticalScrollBarEnabled = false }
        val col = stack(true, 18) {}; body(col)
        scroll.addView(col, FrameLayout.LayoutParams(MATCH, WRAP))
        root.addView(scroll, flp(MATCH, MATCH, Gravity.TOP, 48, 150, 48, 24))
        return root
    }
    fun fieldLabel(label: String, value: String): LinearLayout = stack(true, 6) {
        addView(tv(label, 20, 650, C.BLUE, 1))
        addView(tv(value.ifBlank { "—" }, 32, 600, C.NAVY, 2).apply { background = rounded(C.WHITE, 18, C.LINE, 2); setPadding(U.d(20), U.d(16), U.d(20), U.d(16)) })
    }
    fun listen(set: (String) -> Unit) { asrTarget = set; toast(I18n.t("listening")); App.temi.listen(I18n.lang) }
    fun wordmark(): ImageView = ImageView(this).apply {
        setImageResource(R.drawable.zeeno_wordmark); adjustViewBounds = true; scaleType = ImageView.ScaleType.FIT_START
    }
}
