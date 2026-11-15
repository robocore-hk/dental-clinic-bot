package ai.robocore.zeeno

import android.app.Application
import android.os.Handler
import android.os.Looper
import com.robotemi.sdk.listeners.OnDetectionStateChangedListener
import java.util.concurrent.Executors

/** Avoid greeting the same person who is still in front of the robot. */
class Presence {
    private var greeted = false
    private var lostAt = 0L
    private var state = OnDetectionStateChangedListener.IDLE
    fun onDetection(next: Int) {
        val now = System.currentTimeMillis()
        if (next == OnDetectionStateChangedListener.DETECTED) {
            val gap = if (lostAt > 0) now - lostAt else 0L
            if (state != OnDetectionStateChangedListener.DETECTED && gap > 45_000) greeted = false
            lostAt = 0
        } else if (state == OnDetectionStateChangedListener.DETECTED) lostAt = now
        state = next
    }
    fun shouldGreet() = !greeted
    fun markGreeted() { greeted = true }
}

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this); api = Api(prefs); repo = Repo(this, prefs, api)
        temi = Temi().also { it.attach() }
        agent = Agent()
        I18n.lang = repo.config.settings.defaultLang.takeIf { it in repo.config.settings.languages } ?: repo.config.settings.languages.first()
    }
    companion object {
        lateinit var prefs: Prefs; lateinit var api: Api; lateinit var repo: Repo; lateinit var temi: Temi; lateinit var agent: Agent
        val presence = Presence()
        private val handler = Handler(Looper.getMainLooper())
        private val io = Executors.newFixedThreadPool(3)
        fun main(r: () -> Unit) { if (Looper.myLooper() == Looper.getMainLooper()) r() else handler.post(r) }
        fun later(ms: Long, r: Runnable) = handler.postDelayed(r, ms)
        fun cancel(r: Runnable) = handler.removeCallbacks(r)
        fun bg(r: () -> Unit) { io.execute { runCatching(r).onFailure { android.util.Log.w("Zeeno", "bg", it) } } }
        val config get() = repo.config
        val settings get() = repo.config.settings
    }
}
