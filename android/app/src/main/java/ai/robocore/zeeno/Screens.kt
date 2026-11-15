package ai.robocore.zeeno

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import org.json.JSONObject

class WelcomeScreen(a: MainActivity, private var greet: Boolean = true) : Screen(a) {
    override val mode = "welcome"
    private var step = 0
    fun reset(speak: Boolean) { step = 0; greet = speak }
    override fun build(): View {
        val root = FrameLayout(a).apply { setBackgroundColor(C.MIST) }
        root.addView(a.wordmark(), flp(U.d(420), WRAP, Gravity.TOP or Gravity.START, 64, 36, 0, 0))
        root.addView(a.iconBtn(R.drawable.ic_close, true, 84).apply { tap { a.quit() } }, flp(WRAP, WRAP, Gravity.TOP or Gravity.END, 0, 36, 56, 0))
        val body = a.stack(true, 22) {}
        if (step == 0) {
            body.addView(a.tv(I18n.t("choose_lang"), 64, 650, C.NAVY, 2))
            body.addView(a.tv(App.config.clinic.welcome.get().ifBlank { I18n.t("greet") }, 28, 400, C.BODY, 4))
            val grid = a.stack(true, 16) {}
            App.settings.languages.chunked(2).forEach { rowLangs ->
                val line = a.row()
                rowLangs.forEach { l -> line.addView(a.bigBtn(I18n.label(l)).apply { tap { App.temi.speaker.stop(); if (I18n.lang != l) I18n.lang = l; step = 1; a.replaceTop() } }, LinearLayout.LayoutParams(0, U.d(150), 1f).apply { marginEnd = U.d(16) }) }
                grid.addView(line)
            }
            body.addView(grid)
        } else {
            body.addView(a.tv(I18n.t("intent_title"), 56, 650, C.NAVY, 2))
            body.addView(a.bigBtn(I18n.t("intent_appt")).apply { tap { a.startJourney(ArrivalScreen(a)) } })
            body.addView(a.bigBtn(I18n.t("intent_with")).apply { tap { a.startJourney(NoteScreen(a, I18n.t("with_body"))) } })
            body.addView(a.bigBtn(I18n.t("intent_enquiry"), "", true).apply { tap { a.startJourney(WalkInScreen(a)) } })
            body.addView(a.textBtn(I18n.t("choose_lang"), false).apply { tap { step = 0; refresh() } })
        }
        root.addView(body, flp(MATCH, WRAP, Gravity.CENTER_VERTICAL, 80, 0, 80, 0))
        root.addView(a.textBtn(I18n.t("contact"), false).apply { tap { a.push(ContactScreen(a)) } }, flp(WRAP, WRAP, Gravity.BOTTOM or Gravity.START, 64, 0, 0, 36))
        return root
    }
    private fun refresh() { rebuild(); if (a.top === this) a.replaceTop() }
    override fun onShow() {
        if (step == 0 && greet && App.presence.shouldGreet()) {
            App.presence.markGreeted(); greet = false
            val line = App.config.clinic.welcome.get().ifBlank { I18n.t("greet") }
            App.temi.speaker.say(line)
        }
    }
    override fun onBack() { if (step == 1) { step = 0; refresh() } else a.quit() }
}

class HomeScreen(a: MainActivity) : Screen(a) {
    override val mode = "home"
    override fun onBack() { a.quit() }
    override fun build(): View {
        val root = FrameLayout(a)
        val bar = a.row()
        bar.addView(a.wordmark(), LinearLayout.LayoutParams(U.d(360), U.d(78)))
        bar.addView(View(a), a.lp(0, 1, weight = 1f))
        bar.addView(a.langPills())
        bar.addView(a.iconBtn(R.drawable.ic_settings, false, 80).apply { tap { a.askPin { a.push(SettingsScreen(a)) } } }, a.lp(l = 12))
        bar.addView(a.iconBtn(R.drawable.ic_close, true, 80).apply { tap { a.quit() } }, a.lp(l = 12))
        root.addView(bar, flp(MATCH, WRAP, Gravity.TOP, 48, 28, 48, 0))
        root.addView(a.tv(I18n.t("home_title"), 48, 650, C.NAVY, 1), flp(MATCH, WRAP, Gravity.TOP, 56, 130, 56, 0))
        val tiles = listOf(
            Triple(I18n.t("tile_appt"), I18n.t("tile_appt_sub"), { a.push(ArrivalScreen(a)) }),
            Triple(I18n.t("tile_need"), I18n.t("tile_need_sub"), { a.push(WalkInScreen(a)) }),
            Triple(I18n.t("tile_about"), I18n.t("tile_about_sub"), { a.push(AboutScreen(a)) }),
            Triple(I18n.t("tile_comfort"), I18n.t("tile_comfort_sub"), { a.push(ComfortScreen(a)) }),
            Triple(I18n.t("tile_dir"), I18n.t("tile_dir_sub"), { a.push(DirectionsScreen(a)) }),
            Triple(I18n.t("tile_contact"), I18n.t("tile_contact_sub"), { a.push(ContactScreen(a)) }),
        )
        val grid = a.stack(true, 16) {}
        tiles.chunked(3).forEachIndexed { ri, rowTiles ->
            val line = a.row()
            rowTiles.forEachIndexed { i, (t, sub, go) ->
                val dark = ri == 1 && i == 2
                line.addView(a.bigBtn(t, sub, dark).apply { tap { go() } }, LinearLayout.LayoutParams(0, U.d(250), 1f).apply { marginEnd = U.d(16) })
            }
            grid.addView(line)
        }
        root.addView(grid, flp(MATCH, WRAP, Gravity.TOP, 48, 210, 48, 0))
        val foot = a.row()
        foot.addView(a.tv(I18n.t("feedback_link"), 24, 600, C.BLUE, 1).apply { tap { a.push(FeedbackScreen(a)) } })
        foot.addView(View(a), a.lp(0, 1, weight = 1f))
        foot.addView(a.tv(App.config.clinic.name, 22, 500, C.MUTED, 1))
        root.addView(foot, flp(MATCH, WRAP, Gravity.BOTTOM, 56, 0, 56, 28))
        return root
    }
}

class NoteScreen(a: MainActivity, private val text: String) : Screen(a) {
    override val mode = "note"
    override fun build() = a.page(I18n.t("intent_with")) {
        it.addView(a.tv(text, 36, 500, C.NAVY, 6))
        it.addView(a.textBtn(I18n.t("home"), true).apply { tap { a.home() } })
    }
}

class ArrivalScreen(a: MainActivity) : Screen(a) {
    override val mode = "arrival"
    override val sensitive = true
    private var ref = ""; private var name = ""; private var time = ""; private var phase = 0
    private var result: Delivery? = null
    private var focus = "ref"
    override fun build(): View = a.page(I18n.t("arrival_title"), I18n.t("tile_appt")) { col ->
        col.addView(a.tv(I18n.t("arrival_lead"), 26, 400, C.BODY, 4))
        if (phase == 0) {
            fun box(key: String, label: String, value: String) = a.fieldLabel(label, value).apply {
                background = if (focus == key) rounded(0, 0) else null
                tap { focus = key; refresh() }
            }
            col.addView(box("ref", I18n.t("ref"), ref))
            col.addView(a.tv(I18n.t("or"), 22, 500, C.MUTED))
            col.addView(box("name", I18n.t("name"), name))
            col.addView(box("time", I18n.t("time"), time))
            val set: (String) -> Unit = { v -> when (focus) { "name" -> name = v; "time" -> time = v; else -> ref = v }; refresh() }
            val get = { when (focus) { "name" -> name; "time" -> time; else -> ref } }
            col.addView(a.row().apply { addView(a.textBtn(I18n.t("speak"), false).apply { tap { a.listen { spoken -> when (focus) { "name" -> name = spoken; "time" -> time = spoken; else -> ref = spoken }; refresh() } } }) })
            col.addView(a.keys(get, set, focus == "time"))
            col.addView(a.row().apply {
                addView(a.textBtn(I18n.t("next"), true).apply { tap { if (valid()) { phase = 1; refresh() } else a.toast(I18n.t("need_details")) } })
                addView(a.textBtn(I18n.t("fallback"), false).apply { tap { a.push(ContactScreen(a, "appointment")) } }, a.lp(l = 12))
            })
        } else if (phase == 1) {
            col.addView(a.tv(I18n.t("confirm"), 32, 650, C.NAVY))
            col.addView(a.tv(listOf(ref, name, time).filter { it.isNotBlank() }.joinToString("\n"), 30, 500, C.INK, 6))
            col.addView(a.tv(I18n.t("arrival_lead"), 24, 400, C.BODY, 4))
            col.addView(a.row().apply {
                addView(a.textBtn(I18n.t("edit"), false).apply { tap { phase = 0; refresh() } })
                addView(a.textBtn(I18n.t("send"), true).apply { tap { send() } }, a.lp(l = 12))
            })
        } else {
            val d = result
            col.addView(a.statusCard(d?.ok == true, if (d?.ok == true) I18n.t("not_checkin") else (d?.detail ?: I18n.t("not_confirmed"))))
            col.addView(a.textBtn(I18n.t("fallback"), false).apply { tap { a.push(ContactScreen(a, "appointment")) } })
            col.addView(a.textBtn(I18n.t("done"), true).apply { tap { a.home() } })
        }
    }
    private fun valid() = ref.trim().length >= 2 || (name.trim().length >= 2 && time.trim().isNotBlank())
    private fun refresh() { rebuild(); if (a.top === this) a.replaceTop() }
    private fun send() {
        phase = 2; result = null; refresh()
        val body = JSONObject().put("kind", "arrival").put("reference", ref.trim()).put("patient_name", name.trim()).put("appointment_time", time.trim())
        App.bg {
            val d = App.repo.deliver("/api/robot/arrivals", body)
            App.agent.log("arrival", null, if (d.ok) "stored" else "failed")
            App.main { result = d; if (a.top === this) refresh() }
        }
    }
    override fun onHide() { if (phase == 2) { ref = ""; name = ""; time = "" } }
}

class WalkInScreen(a: MainActivity) : Screen(a) {
    override val mode = "walkin"
    override val sensitive = true
    private var service = ""; private var date = ""; private var person = ""; private var phone = ""; private var mail = ""
    private var phase = 0; private var result: Delivery? = null; private var focus = "service"
    override fun build(): View = a.page(I18n.t("walkin_title")) { col ->
        col.addView(a.tv(I18n.t("walkin_lead"), 26, 400, C.BODY, 4))
        if (phase == 0) {
            col.addView(a.tv(I18n.t("service"), 22, 650, C.BLUE))
            val services = App.config.of("explainer").map { it.title.get() } + I18n.t("other")
            val wrap = a.row(); var line = a.row()
            services.forEach { s ->
                line.addView(a.tv(s, 22, 600, if (service == s) C.WHITE else C.NAVY).apply {
                    background = rounded(if (service == s) C.BLUE else C.WHITE, 99, C.LINE, 2)
                    setPadding(U.d(18), U.d(12), U.d(18), U.d(12)); tap { service = s; focus = "person"; refresh() }
                }, a.lp(r = 8, b = 8))
            }
            wrap.addView(line); col.addView(wrap)
            col.addView(a.tv(I18n.t("date"), 22, 650, C.BLUE))
            col.addView(a.row().apply {
                listOf("today", "tomorrow", "this_week").forEach { k ->
                    val label = I18n.t(k)
                    addView(a.tv(label, 22, 600, if (date == label) C.WHITE else C.NAVY).apply {
                        background = rounded(if (date == label) C.NAVY else C.WHITE, 99, C.LINE, 2)
                        setPadding(U.d(18), U.d(12), U.d(18), U.d(12)); tap { date = label; refresh() }
                    }, a.lp(r = 8))
                }
            })
            fun box(key: String, label: String, value: String) = a.fieldLabel(label, value).apply { tap { focus = key; refresh() } }
            col.addView(box("person", I18n.t("name"), person))
            col.addView(box("phone", I18n.t("phone"), phone))
            col.addView(box("mail", I18n.t("email"), mail))
            val get = { when (focus) { "phone" -> phone; "mail" -> mail; else -> person } }
            col.addView(a.textBtn(I18n.t("speak"), false).apply { tap { a.listen { spoken -> when (focus) { "phone" -> phone = spoken.filter { it.isDigit() || it == '+' }; "mail" -> mail = spoken.replace(" ", ""); else -> person = spoken }; refresh() } } })
            col.addView(a.keys(get, { v -> when (focus) { "phone" -> phone = v; "mail" -> mail = v; else -> person = v }; refresh() }, focus == "phone"))
            col.addView(a.textBtn(I18n.t("next"), true).apply { tap {
                if (service.isBlank() || date.isBlank() || (phone.isBlank() && mail.isBlank())) a.toast(I18n.t("contact_need")) else { phase = 1; refresh() }
            } })
        } else if (phase == 1) {
            col.addView(a.tv("$service\n$date\n$person\n$phone $mail".trim(), 30, 500, C.NAVY, 8))
            col.addView(a.tv(I18n.t("walkin_lead"), 24, 400, C.BODY, 3))
            col.addView(a.row().apply {
                addView(a.textBtn(I18n.t("edit"), false).apply { tap { phase = 0; refresh() } })
                addView(a.textBtn(I18n.t("send"), true).apply { tap { send() } }, a.lp(l = 12))
            })
        } else {
            val d = result
            col.addView(a.statusCard(d?.ok == true, if (d?.ok == true) I18n.t("walkin_lead") else (d?.detail ?: I18n.t("not_confirmed"))))
            col.addView(a.textBtn(I18n.t("done"), true).apply { tap { a.home() } })
        }
    }
    private fun refresh() { rebuild(); if (a.top === this) a.replaceTop() }
    private fun send() {
        phase = 2; refresh()
        val body = JSONObject().put("kind", "walkin").put("service", service).put("preferred_date", date).put("contact_name", person).put("contact_phone", phone).put("contact_email", mail)
        App.bg {
            val d = App.repo.deliver("/api/robot/arrivals", body)
            App.agent.log("walkin", null, if (d.ok) "stored" else "failed")
            App.main { result = d; if (a.top === this) refresh() }
        }
    }
}

class AboutScreen(a: MainActivity) : Screen(a) {
    override val mode = "about"
    override fun build() = a.page(I18n.t("tile_about")) { col ->
        col.addView(a.bigBtn(I18n.t("about_orient"), I18n.t("not_advice")).apply { tap { a.push(ListScreen(a, "orientation", I18n.t("about_orient"))) } })
        col.addView(a.bigBtn(I18n.t("about_explain"), I18n.t("not_advice")).apply { tap { a.push(ListScreen(a, "explainer", I18n.t("about_explain"))) } })
        col.addView(a.bigBtn(I18n.t("about_faq")).apply { tap { a.push(FaqScreen(a)) } })
        col.addView(a.bigBtn(I18n.t("about_oral"), I18n.t("not_advice")).apply { tap { a.push(ListScreen(a, "oral", I18n.t("about_oral"))) } })
        val dentists = App.config.dentists
        if (dentists.isNotEmpty()) {
            col.addView(a.tv(dentists.joinToString("   ") { it.name + " · " + it.role }, 24, 500, C.BODY, 3))
        }
    }
}

class ListScreen(a: MainActivity, private val kind: String, private val title: String) : Screen(a) {
    override val mode = kind
    override fun build() = a.page(title) { col ->
        col.addView(a.tv(I18n.t("not_advice"), 24, 400, C.BODY, 3))
        App.config.of(kind).forEach { item ->
            col.addView(a.bigBtn(item.title.get(), item.version + " · " + item.reviewer).apply { tap { a.push(ReaderScreen(a, item)) } })
        }
    }
}

class ReaderScreen(a: MainActivity, private val item: ContentItem) : Screen(a) {
    override val mode = "reader"
    override fun build() = a.page(item.title.get(), item.kind) { col ->
        col.addView(a.tv(I18n.t("not_advice"), 22, 500, C.BLUE, 3))
        if (item.mediaKind == "diagram") col.addView(ToothSketch(a, item.category), LinearLayout.LayoutParams(MATCH, U.d(220)))
        if (item.mediaKind == "video" || item.mediaUrl.isNotBlank()) col.addView(a.tv(I18n.t("video_placeholder"), 22, 400, C.MUTED, 3))
        col.addView(a.tv(item.body.get(), 28, 400, C.INK, 30))
        col.addView(a.tv("${I18n.t("source")}: ${item.title.get()} · ${I18n.t("version")} ${item.version} · ${I18n.t("reviewer")} ${item.reviewer.ifBlank { App.config.clinic.reviewer }}", 20, 500, C.BODY, 3))
        App.agent.log("content", item.id, item.kind)
    }
    override fun onShow() { if (!App.temi.speaker.speaking) App.temi.speaker.say(item.title.get() + ". " + item.body.get().take(500)) }
}

class FaqScreen(a: MainActivity) : Screen(a) {
    override val mode = "faq"
    private var question = ""
    private var answer: ContentItem? = null
    private var miss = false
    private var serverText: String? = null
    private var serverTitle: String? = null
    private var serverMeta: String? = null
    override fun build() = a.page(I18n.t("about_faq")) { col ->
        col.addView(a.tv(I18n.t("faq_prompt"), 26, 400, C.BODY, 3))
        val chips = a.row()
        App.config.of("faq").forEach { item ->
            chips.addView(a.tv(item.title.get(), 22, 600, C.NAVY).apply {
                background = rounded(C.WHITE, 99, C.LINE, 2); setPadding(U.d(16), U.d(12), U.d(16), U.d(12))
                tap { show(item) }
            }, a.lp(r = 8, b = 8))
        }
        col.addView(chips)
        col.addView(a.fieldLabel(I18n.t("faq_prompt"), question).apply { tap { } })
        col.addView(a.row().apply {
            addView(a.textBtn(I18n.t("speak"), false).apply { tap { a.listen { question = it; ask() } } })
            addView(a.textBtn(I18n.t("next"), true).apply { tap { ask() } }, a.lp(l = 12))
        })
        col.addView(a.keys({ question }, { question = it; refresh() }))
        val text = serverText ?: answer?.body?.get()
        if (text != null) {
            col.addView(a.tv(text, 28, 400, C.INK, 20))
            val meta = serverMeta ?: answer?.let { "${I18n.t("source")}: ${it.title.get()} · ${I18n.t("version")} ${it.version} · ${it.reviewer}" }
            if (!meta.isNullOrBlank()) col.addView(a.tv(meta, 20, 500, C.BODY, 3))
        } else if (miss) col.addView(a.tv(I18n.t("no_answer"), 28, 500, C.NAVY, 6))
        if (miss || answer == null && serverText == null) col.addView(a.textBtn(I18n.t("staff_help"), true).apply { tap { a.push(ContactScreen(a, "question")) } })
    }
    private fun show(item: ContentItem) {
        answer = item; miss = false; serverText = null; serverMeta = "${I18n.t("source")}: ${item.title.get()} · ${I18n.t("version")} ${item.version} · ${item.reviewer}"
        App.agent.log("faq", item.id, item.category); refresh(); App.temi.speaker.say(item.body.get().take(500))
    }
    private fun ask() {
        val q = question.trim(); if (q.isBlank()) return
        val local = Faq.match(q, App.config.content)
        answer = local; miss = local == null; serverText = null
        if (local != null) App.agent.log("faq", local.id, local.category) else App.agent.log("faq", null, "none")
        refresh()
        if (App.prefs.paired) App.bg {
            val r = App.agent.ask(q, I18n.lang) ?: return@bg
            App.main {
                if (a.top !== this) return@main
                if (r.optBoolean("confident")) {
                    serverText = r.optString("answer"); serverTitle = r.optString("title")
                    serverMeta = "${I18n.t("source")}: ${r.optString("source")} · ${I18n.t("version")} ${r.optString("version")} · ${r.reviewerSafe()}"
                    miss = false
                } else { serverText = null; if (local == null) miss = true }
                refresh()
                App.temi.speaker.say((serverText ?: local?.body?.get() ?: I18n.t("no_answer")).take(500))
            }
        } else App.temi.speaker.say((local?.body?.get() ?: I18n.t("no_answer")).take(500))
    }
    private fun refresh() { rebuild(); if (a.top === this) a.replaceTop() }
    private fun JSONObject.reviewerSafe() = optString("reviewer")
}

class ComfortScreen(a: MainActivity) : Screen(a) {
    override val mode = "comfort"
    override fun build() = a.page(I18n.t("tile_comfort")) { col ->
        col.addView(a.bigBtn(I18n.t("nervous"), I18n.t("not_painless"), true).apply { tap { a.push(AnxietyScreen(a)) } })
        col.addView(a.bigBtn(I18n.t("kids"), I18n.t("brush_help")).apply { tap { a.push(ChildrenScreen(a)) } })
    }
}

class AnxietyScreen(a: MainActivity) : Screen(a) {
    override val mode = "anxiety"
    private var running = false
    private var sent: Delivery? = null
    override fun build() = a.page(I18n.t("nervous")) { col ->
        val script = App.config.of("anxiety").firstOrNull { it.slug == "how-to-tell" }
        val pause = App.config.of("anxiety").firstOrNull { it.slug == "pause" }
        col.addView(BreathView(a), LinearLayout.LayoutParams(U.d(280), U.d(280)).apply { gravity = Gravity.CENTER_HORIZONTAL })
        col.addView(a.tv(if (running) I18n.t("breathe_in") else I18n.t("breathe"), 28, 650, C.NAVY).apply { gravity = Gravity.CENTER_HORIZONTAL })
        col.addView(a.tv(I18n.t("not_painless"), 22, 400, C.BODY, 3))
        col.addView(a.textBtn(if (running) I18n.t("done") else I18n.t("breathe"), true).apply { tap { running = !running; refresh() } })
        if (script != null) col.addView(a.tv(script.body.get(), 26, 400, C.INK, 10))
        if (pause != null) col.addView(a.tv("${I18n.t("version")} ${pause.version} · ${pause.reviewer}", 18, 500, C.MUTED))
        val d = sent
        if (d != null) col.addView(a.statusCard(d.ok, if (d.ok) I18n.t("private_sent") else d.detail))
        else col.addView(a.textBtn(I18n.t("notify_private"), false).apply { tap { notifyTeam() } })
    }
    private fun notifyTeam() {
        App.bg {
            val d = App.repo.deliver("/api/robot/alerts", JSONObject().put("reason", "nervous").put("private", true).put("note", "private"))
            App.agent.log("alert", null, "nervous")
            App.main { sent = d; if (a.top === this) refresh() }
        }
    }
    private fun refresh() { rebuild(); if (a.top === this) a.replaceTop() }
    override fun onShow() { App.agent.log("content", null, "anxiety") }
}

class BreathView(context: android.content.Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = C.BLUE }
    private var start = android.os.SystemClock.uptimeMillis()
    override fun onDraw(c: Canvas) {
        val t = ((android.os.SystemClock.uptimeMillis() - start) % 8000) / 8000f
        val phase = if (t < 0.45f) t / 0.45f else (1f - (t - 0.45f) / 0.55f).coerceAtLeast(0f)
        val r = width * (0.28f + 0.22f * phase)
        paint.alpha = 50 + (phase * 90).toInt()
        c.drawCircle(width / 2f, height / 2f, r, paint)
        postInvalidateOnAnimation()
    }
}

class ChildrenScreen(a: MainActivity) : Screen(a) {
    override val mode = "children"
    private var tab = "brush"
    private var quiet = true
    private var step = 0
    private var story = 0
    private var tool = 0
    override fun build() = a.page(I18n.t("kids")) { col ->
        col.addView(a.tv(I18n.t("brush_help"), 22, 400, C.BODY, 3))
        col.addView(a.row().apply {
            addView(a.tv(I18n.t("quiet"), 22, 650, if (quiet) C.WHITE else C.NAVY).apply {
                background = rounded(if (quiet) C.NAVY else C.WHITE, 99, C.LINE, 2); setPadding(U.d(16), U.d(10), U.d(16), U.d(10))
                tap { quiet = !quiet; App.temi.speaker.stop(); refresh() }
            })
            listOf("brush" to I18n.t("brush_game"), "tools" to I18n.t("tools_game"), "story" to I18n.t("story")).forEach { (k, label) ->
                addView(a.tv(label, 22, 600, if (tab == k) C.WHITE else C.NAVY).apply {
                    background = rounded(if (tab == k) C.BLUE else C.WHITE, 99, C.LINE, 2); setPadding(U.d(16), U.d(10), U.d(16), U.d(10))
                    tap { tab = k; refresh() }
                }, a.lp(l = 8))
            }
        })
        when (tab) {
            "brush" -> brush(col)
            "tools" -> tools(col)
            else -> story(col)
        }
    }
    private fun brush(col: LinearLayout) {
        val steps = App.config.of("children").filter { it.category == "brush-step" }
        if (step >= steps.size) { col.addView(a.tv(I18n.t("good"), 36, 650, C.GREEN)); col.addView(a.textBtn(I18n.t("again"), false).apply { tap { step = 0; refresh() } }); return }
        col.addView(a.tv("${step + 1} / ${steps.size}", 22, 650, C.BLUE))
        steps.forEachIndexed { i, item ->
            col.addView(a.bigBtn(item.title.get(), if (i < step) "✓" else "").apply { tap {
                if (i == step) { step++; if (!quiet) App.temi.speaker.say(item.body.get()) } else if (!quiet) App.temi.speaker.say(I18n.t("again"))
                refresh()
            } })
        }
    }
    private fun tools(col: LinearLayout) {
        val items = App.config.of("children").filter { it.category == "tool" }
        val item = items.getOrNull(tool) ?: return
        col.addView(ToothSketch(a, "tool"), LinearLayout.LayoutParams(MATCH, U.d(180)))
        col.addView(a.tv(item.title.get(), 40, 650, C.NAVY))
        col.addView(a.tv(item.body.get(), 28, 400, C.INK, 6))
        col.addView(a.row().apply {
            addView(a.textBtn(I18n.t("back"), false).apply { tap { if (tool > 0) { tool--; refresh() } } })
            addView(a.textBtn(I18n.t("next"), true).apply { tap { if (tool < items.lastIndex) { tool++; refresh() } } }, a.lp(l = 12))
        })
        if (!quiet) App.temi.speaker.say(item.title.get() + ". " + item.body.get())
    }
    private fun story(col: LinearLayout) {
        val pages = App.config.of("children").filter { it.category == "story" }
        val page = pages.getOrNull(story) ?: return
        col.addView(a.tv(page.title.get(), 40, 650, C.NAVY, 2))
        col.addView(a.tv(page.body.get(), 30, 400, C.INK, 8))
        col.addView(a.tv("${I18n.t("page")} ${story + 1} / ${pages.size}", 20, 500, C.MUTED))
        col.addView(a.row().apply {
            addView(a.textBtn(I18n.t("back"), false).apply { tap { if (story > 0) { story--; refresh() } } })
            addView(a.textBtn(I18n.t("next"), true).apply { tap { if (story < pages.lastIndex) { story++; refresh() } } }, a.lp(l = 12))
        })
        if (!quiet) App.temi.speaker.say(page.body.get())
    }
    private fun refresh() { rebuild(); if (a.top === this) a.replaceTop() }
}

class DirectionsScreen(a: MainActivity) : Screen(a) {
    override val mode = "directions"
    private var picked: Destination? = null
    private var escortId: String? = null
    private var escortStatus = ""
    private var nav = ""
    override fun build() = a.page(I18n.t("directions_title")) { col ->
        val dests = App.config.destinations.sortedBy { it.sort }
        if (picked == null) {
            dests.forEach { d -> col.addView(a.bigBtn(d.label.get(), d.kind + if (d.requiresStaff) " · " + I18n.t("staff_needed") else "").apply { tap { picked = d; nav = ""; escortStatus = ""; refresh() } }) }
            if (dests.isEmpty()) col.addView(a.tv(I18n.t("not_on_map"), 26, 400, C.BODY, 4))
        } else {
            val d = picked!!
            col.addView(a.tv(d.label.get(), 40, 650, C.NAVY))
            col.addView(a.tv(d.note.get(), 28, 400, C.INK, 8))
            val onMap = !App.temi.ready || App.temi.hasLocation(d.location) || App.config.fromSeed
            if (!onMap && App.temi.ready) col.addView(a.tv(I18n.t("not_on_map"), 24, 500, C.DANGER, 4))
            if (d.requiresStaff && escortStatus != "approved") {
                col.addView(a.tv(I18n.t("staff_needed"), 24, 500, C.NAVY, 4))
                if (escortStatus == "pending") col.addView(a.tv(I18n.t("waiting_staff"), 26, 650, C.BLUE))
                else if (escortStatus == "declined") col.addView(a.statusCard(false, I18n.t("room_not")))
                if (escortId == null) col.addView(a.textBtn(I18n.t("send"), true).apply { tap { request(d) } })
            } else {
                if (d.requiresStaff) col.addView(a.tv(I18n.t("room_ready"), 26, 650, C.GREEN))
                if (nav.isNotBlank()) col.addView(a.tv(nav, 26, 500, C.NAVY))
                col.addView(a.row().apply {
                    addView(a.textBtn(I18n.t("stay"), false).apply { tap { App.temi.speaker.say(d.note.get()) } })
                    addView(a.textBtn(I18n.t("escort"), true).apply { tap { go(d) } }, a.lp(l = 12))
                })
            }
            col.addView(a.textBtn(I18n.t("back"), false).apply { tap { picked = null; escortId = null; refresh() } })
        }
    }
    private fun request(d: Destination) {
        App.bg {
            val dly = App.repo.deliver("/api/robot/escorts", JSONObject().put("destination_id", d.id))
            App.main {
                escortId = dly.id; escortStatus = if (dly.ok) "pending" else "failed"
                if (!dly.ok) a.toast(dly.detail)
                refresh(); if (dly.ok && dly.id != null) poll()
            }
        }
    }
    private fun poll() {
        val id = escortId ?: return
        App.bg {
            val r = runCatching { App.api.get("/api/robot/escorts/$id") }.getOrNull()
            App.main {
                if (a.top !== this || escortId != id) return@main
                escortStatus = r?.optString("status") ?: escortStatus
                refresh()
                if (escortStatus == "pending") App.later(2500) { poll() }
            }
        }
    }
    private fun go(d: Destination) {
        if (App.temi.ready && !App.temi.hasLocation(d.location)) { nav = I18n.t("not_on_map"); refresh(); return }
        nav = I18n.t("on_way"); refresh()
        App.temi.speaker.say(I18n.t("escort"))
        App.temi.onNav = nav@{ _, status, _ ->
            if (a.top !== this@DirectionsScreen) return@nav
            if (status == "complete") { nav = I18n.t("arrived_place"); App.temi.speaker.say(I18n.t("arrived_place")); refresh() }
            else if (status == "abort" || status == "reposing" || status.contains("calculat", true) && status.contains("fail", true)) { nav = I18n.t("nav_failed"); refresh() }
        }
        App.temi.goTo(d.location, App.settings.backwards, App.settings.speed)
        App.agent.log("escort", d.id, "go")
    }
    private fun refresh() { rebuild(); if (a.top === this) a.replaceTop() }
    override fun onHide() { App.temi.onNav = null }
}

class ContactScreen(a: MainActivity, private val preset: String? = null) : Screen(a) {
    override val mode = "contact"
    private var reason = preset ?: ""
    private var result: Delivery? = null
    override fun build() = a.page(I18n.t("contact")) { col ->
        col.addView(a.tv(I18n.t("not_emergency"), 24, 500, C.NAVY, 6))
        val reasons = listOf("appointment" to I18n.t("reason_appt"), "accessibility" to I18n.t("reason_access"), "unwell" to I18n.t("reason_unwell"), "question" to I18n.t("reason_question"))
        reasons.forEach { (k, label) ->
            col.addView(a.bigBtn(label, "", reason == k).apply { tap { reason = k; result = null; refresh() } })
        }
        val d = result
        if (d != null) col.addView(a.statusCard(d.ok, d.detail))
        col.addView(a.textBtn(I18n.t("send"), true).apply { tap { send() } })
    }
    private fun send() {
        if (reason.isBlank()) { a.toast(I18n.t("reason_question")); return }
        App.bg {
            val d = App.repo.deliver("/api/robot/alerts", JSONObject().put("reason", reason).put("private", reason == "unwell"))
            App.agent.log("alert", null, reason)
            App.main { result = d; if (a.top === this) refresh() }
        }
    }
    private fun refresh() { rebuild(); if (a.top === this) a.replaceTop() }
}

class FeedbackScreen(a: MainActivity) : Screen(a) {
    override val mode = "feedback"
    override val sensitive = true
    private var ease = ""; private var help = ""; private var comment = ""; private var contact = false; private var details = ""
    private var result: Delivery? = null
    override fun build() = a.page(I18n.t("feedback_link")) { col ->
        col.addView(a.tv(I18n.t("feedback_private"), 24, 400, C.BODY, 3))
        fun choices(title: String, options: List<Pair<String, String>>, current: String, set: (String) -> Unit) {
            col.addView(a.tv(title, 26, 650, C.NAVY))
            val line = a.row()
            options.forEach { (k, label) -> line.addView(a.tv(label, 22, 600, if (current == k) C.WHITE else C.NAVY).apply {
                background = rounded(if (current == k) C.BLUE else C.WHITE, 99, C.LINE, 2); setPadding(U.d(16), U.d(12), U.d(16), U.d(12))
                tap { set(k); refresh() }
            }, a.lp(r = 8)) }
            col.addView(line)
        }
        choices(I18n.t("ease"), listOf("good" to I18n.t("ease_good"), "ok" to I18n.t("ease_ok"), "hard" to I18n.t("ease_hard")), ease) { ease = it }
        choices(I18n.t("help_q"), listOf("yes" to I18n.t("yes"), "partly" to I18n.t("partly"), "no" to I18n.t("no")), help) { help = it }
        col.addView(a.fieldLabel(I18n.t("comment"), comment).apply { tap { } })
        col.addView(a.keys({ comment }, { comment = it; refresh() }))
        col.addView(a.bigBtn(I18n.t("contact_me"), if (contact) details else "", contact).apply { tap { contact = !contact; refresh() } })
        if (contact) {
            col.addView(a.fieldLabel(I18n.t("phone"), details))
            col.addView(a.keys({ details }, { details = it; refresh() }))
            col.addView(a.textBtn(I18n.t("speak"), false).apply { tap { a.listen { details = it; refresh() } } })
        }
        val d = result
        if (d != null) col.addView(a.statusCard(d.ok, if (d.ok) I18n.t("feedback_private") else d.detail))
        col.addView(a.textBtn(I18n.t("send"), true).apply { tap { send() } })
    }
    private fun send() {
        if (ease.isBlank() && help.isBlank() && !contact) { a.toast(I18n.t("feedback_need")); return }
        App.bg {
            val body = JSONObject().put("ease", ease).put("help", help).put("comment", comment).put("contact_me", contact).put("contact_details", if (contact) details else "")
            val d = App.repo.deliver("/api/robot/feedback", body)
            App.agent.log("feedback", null, ease.ifBlank { "note" })
            App.main { result = d; comment = ""; details = ""; if (a.top === this) refresh() }
        }
    }
    private fun refresh() { rebuild(); if (a.top === this) a.replaceTop() }
}

class SettingsScreen(a: MainActivity) : Screen(a) {
    override val mode = "settings"
    private var s = App.settings
    private var code = ""
    override fun build(): View = a.page(I18n.t("settings"), App.config.clinic.name) { col ->
        if (App.prefs.paired) {
            col.addView(a.tv("${I18n.t("paired")}: ${App.prefs.robotName}", 30, 650, C.NAVY))
            col.addView(a.row().apply {
                addView(a.textBtn(I18n.t("reload"), true).apply { tap { App.bg { val ok = runCatching { App.repo.refresh() }.isSuccess; App.main { a.toast(if (ok) I18n.t("done") else I18n.t("not_confirmed")) } } } })
                addView(a.textBtn(I18n.t("unpair"), false).apply { tap { App.repo.unpair(); s = App.settings; refresh() } }, a.lp(l = 12))
            })
        } else {
            col.addView(a.tv(I18n.t("unpaired"), 28, 500, C.BODY, 3))
            col.addView(a.tv(code.padEnd(6, '·').toList().joinToString(" "), 48, 700, C.NAVY))
            col.addView(a.keys({ code }, { v -> code = v.filter { it.isDigit() }.take(6); if (code.length == 6) pair(code); refresh() }, true))
            col.addView(a.tv(I18n.t("pair_hint"), 22, 400, C.MUTED, 2))
            col.addView(a.fieldLabel(I18n.t("server"), App.prefs.api))
        }
        col.addView(a.tv(I18n.t("kiosk"), 26, 650, C.NAVY))
        col.addView(a.row().apply {
            addView(a.textBtn(I18n.t("on"), s.kiosk).apply { tap { save(s.copy(kiosk = true)); a.applyKiosk() } })
            addView(a.textBtn(I18n.t("off"), !s.kiosk).apply { tap { save(s.copy(kiosk = false)); a.applyKiosk() } }, a.lp(l = 8))
        })
        col.addView(a.tv(I18n.t("speed"), 26, 650, C.NAVY))
        col.addView(a.row().apply {
            listOf("slow" to I18n.t("slow"), "medium" to I18n.t("medium"), "high" to I18n.t("fast")).forEach { (k, label) ->
                addView(a.textBtn(label, s.speed == k).apply { tap { save(s.copy(speed = k)) } }, a.lp(r = 8))
            }
        })
        col.addView(a.textBtn(I18n.t("aftercare_pick"), true).apply { tap { a.push(AftercareStaffScreen(a)) } })
        col.addView(a.row().apply {
            addView(a.textBtn(I18n.t("go_home"), false).apply { tap { App.temi.goHome(); a.toast(I18n.t("go_home")) } })
            addView(a.textBtn(I18n.t("exit"), false).apply { tap { a.quit() } }, a.lp(l = 12))
        })
        col.addView(a.tv("v${BuildConfig.VERSION_NAME} · ${App.temi.serial}", 18, 400, C.MUTED))
    }
    private fun pair(c: String) {
        code = ""
        App.bg { val r = runCatching { App.repo.pair(c, App.temi.serial) }; App.main { if (r.isSuccess) { s = App.settings; a.toast(I18n.t("paired")); refresh() } else a.toast(r.exceptionOrNull()?.message ?: I18n.t("not_confirmed")) } }
    }
    private fun save(n: Settings) { s = n; App.bg { runCatching { App.repo.saveSettings(n) } }; refresh() }
    private fun refresh() { rebuild(); if (a.top === this) a.replaceTop() }
}

class AftercareStaffScreen(a: MainActivity) : Screen(a) {
    override val mode = "aftercare-staff"
    override fun build() = a.page(I18n.t("aftercare_pick")) { col ->
        col.addView(a.tv(I18n.t("not_advice"), 22, 400, C.BODY, 3))
        val groups = App.config.of("aftercare").groupBy { it.slug }
        groups.forEach { (_, versions) ->
            versions.sortedBy { it.version }.forEach { item ->
                col.addView(a.bigBtn(item.title.get(), "${I18n.t("version")} ${item.version} · ${item.reviewer}").apply {
                    tap { a.push(AftercarePatientScreen(a, item)) }
                })
            }
        }
    }
}

class AftercarePatientScreen(a: MainActivity, private val item: ContentItem) : Screen(a) {
    override val mode = "aftercare"
    override val sensitive = true
    private var url: String? = null
    private var failed = false
    private var requested = false
    override fun build() = a.page(I18n.t("aftercare_patient"), item.title.get()) { col ->
        col.addView(a.tv(item.body.get(), 28, 400, C.INK, 24))
        col.addView(a.tv("${I18n.t("version")} ${item.version} · ${I18n.t("reviewer")} ${item.reviewer}", 20, 500, C.BODY, 2))
        col.addView(a.tv("${I18n.t("clinic_phone")} ${App.config.clinic.phone}", 26, 650, C.BLUE))
        val link = url
        if (link != null) {
            col.addView(a.tv(I18n.t("qr_hint"), 22, 400, C.BODY, 3))
            col.addView(ImageView(a).apply { setImageBitmap(qr(link, U.d(360))) }, LinearLayout.LayoutParams(U.d(360), U.d(360)))
        } else if (failed || !App.prefs.paired) col.addView(a.tv(I18n.t("qr_offline"), 24, 500, C.NAVY, 4))
        else col.addView(a.tv(I18n.t("takeaway"), 24, 500, C.MUTED))
        col.addView(a.textBtn(I18n.t("done"), true).apply { tap { a.home() } })
    }
    override fun onShow() {
        if (requested) return
        requested = true
        App.agent.log("aftercare", item.id, "show")
        App.temi.speaker.say(item.title.get())
        if (!App.prefs.paired) { failed = true; return }
        App.bg {
            val r = runCatching { App.api.post("/api/robot/aftercare/token", JSONObject().put("content_id", item.id).put("lang", I18n.lang)) }
            App.main {
                url = r.getOrNull()?.optString("url")?.takeIf { it.startsWith("http") }
                failed = url == null
                if (a.top === this) { rebuild(); a.replaceTop() }
            }
        }
    }
}

private class ToothSketch(context: android.content.Context, private val kind: String) : View(context) {
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = C.MIST; style = Paint.Style.FILL }
    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = C.BLUE; style = Paint.Style.STROKE; strokeWidth = 6f }
    override fun onDraw(c: Canvas) {
        val w = width.toFloat(); val h = height.toFloat()
        val path = Path()
        path.moveTo(w * .35f, h * .15f); path.cubicTo(w * .2f, h * .15f, w * .18f, h * .45f, w * .28f, h * .62f)
        path.lineTo(w * .32f, h * .9f); path.lineTo(w * .68f, h * .9f); path.lineTo(w * .72f, h * .62f)
        path.cubicTo(w * .82f, h * .45f, w * .8f, h * .15f, w * .65f, h * .15f); path.close()
        c.drawPath(path, fill); c.drawPath(path, line)
        if (kind.contains("root") || kind.contains("canal")) c.drawLine(w * .5f, h * .4f, w * .5f, h * .82f, line)
        if (kind.contains("crown")) c.drawOval(w * .3f, h * .12f, w * .7f, h * .48f, line)
    }
}

private fun qr(text: String, size: Int): Bitmap {
    val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, mapOf(EncodeHintType.MARGIN to 1))
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    for (x in 0 until size) for (y in 0 until size) bmp.setPixel(x, y, if (matrix.get(x, y)) C.NAVY else C.WHITE)
    return bmp
}
