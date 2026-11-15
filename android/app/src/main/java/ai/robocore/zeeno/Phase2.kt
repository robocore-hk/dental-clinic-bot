package ai.robocore.zeeno

import android.widget.ImageView
import android.widget.LinearLayout
import org.json.JSONObject

private fun statusLabel(code: String) = when (code) {
    "please_wait" -> I18n.t("please_wait")
    "ready" -> I18n.t("ready")
    "checked_in" -> I18n.t("checked_in")
    else -> code
}

class VisitStatusScreen(a: MainActivity, private val knownId: String) : Screen(a) {
    override val mode = "visit"
    override val sensitive = true
    private var id = knownId
    private var code = ""
    private var typed = ""
    private var status = ""
    private var wait: Int? = null
    private var missing = false
    private var gen = 0
    private var watching = false
    override fun build() = a.page(I18n.t("see_status"), I18n.t("tile_appt")) { col ->
        col.addView(a.tv(I18n.t("status_private"), 24, 400, C.BODY, 3))
        if (id.isBlank() && status.isBlank()) {
            col.addView(a.fieldLabel(I18n.t("enter_code"), typed))
            col.addView(a.keys({ typed }, { typed = it.take(8).uppercase(); refresh() }, false))
            col.addView(a.textBtn(I18n.t("next"), true).apply { tap { lookup() } })
            if (missing) col.addView(a.tv(I18n.t("code_missing"), 24, 500, C.DANGER, 3))
        } else {
            col.addView(a.tv(I18n.t("your_number"), 22, 650, C.BLUE))
            col.addView(a.tv(code.ifBlank { "…" }, 72, 700, C.NAVY))
            if (status.isNotBlank()) col.addView(a.tv(statusLabel(status), 36, 650, C.NAVY))
            col.addView(a.tv(if (wait == null) I18n.t("no_estimate") else I18n.t("wait_min").replace("%s", wait.toString()), 24, 500, C.BODY, 3))
        }
    }
    private fun lookup() {
        if (!App.prefs.paired) { a.toast(I18n.t("not_connected")); return }
        App.bg {
            val r = runCatching { App.api.get("/api/robot/queue-lookup?code=" + java.net.URLEncoder.encode(typed.trim(), "UTF-8")) }
            App.main {
                val j = r.getOrNull()
                if (j == null) { missing = true; refresh() } else { id = j.optString("id"); apply(j); missing = false; refresh(); watch() }
            }
        }
    }
    private fun apply(j: JSONObject) {
        code = j.optString("code"); status = j.optString("status")
        wait = if (j.isNull("wait_minutes")) null else j.optInt("wait_minutes")
    }
    private fun watch() {
        if (watching) return
        watching = true
        val g = ++gen
        fun tick() {
            App.bg {
                val r = runCatching { App.api.get("/api/robot/queue/$id") }.getOrNull()
                App.main {
                    if (g != gen || a.top !== this) return@main
                    if (r != null) apply(r)
                    refresh()
                    App.later(4000) { if (g == gen && a.top === this) tick() }
                }
            }
        }
        tick()
    }
    override fun onShow() { if (id.isNotBlank()) watch() }
    override fun onHide() { gen++; watching = false }
    private fun refresh() { rebuild(); if (a.top === this) a.replaceTop() }
}

class FormStaffScreen(a: MainActivity) : Screen(a) {
    override val mode = "forms"
    private var url: String? = null
    private var failed = false
    override fun build() = a.page(I18n.t("medical_form")) { col ->
        col.addView(a.tv(I18n.t("form_quiet"), 24, 400, C.BODY, 4))
        val link = url
        if (link != null) {
            col.addView(a.tv(I18n.t("qr_hint"), 22, 400, C.BODY, 3))
            col.addView(ImageView(a).apply { setImageBitmap(qr(link, U.d(360))) }, LinearLayout.LayoutParams(U.d(360), U.d(360)))
            col.addView(a.statusCard(true, I18n.t("reached")))
        } else if (failed) col.addView(a.statusCard(false, I18n.t("not_confirmed")))
        App.config.forms.forEach { form ->
            col.addView(a.bigBtn(form.title.get(), "${I18n.t("version")} ${form.version} · ${form.reviewer}").apply { tap { issue(form.id) } })
        }
        if (App.config.forms.isEmpty()) col.addView(a.tv(I18n.t("not_confirmed"), 24, 400, C.BODY, 3))
    }
    private fun issue(id: String) {
        if (!App.prefs.paired) { a.toast(I18n.t("not_connected")); return }
        failed = false; url = null
        App.bg {
            val r = runCatching { App.api.post("/api/robot/forms", JSONObject().put("template_id", id).put("lang", I18n.lang)) }
            App.main {
                url = r.getOrNull()?.optString("url")?.takeIf { it.startsWith("http") && r.getOrNull()?.optBoolean("reached_staff") == true }
                failed = url == null
                if (a.top === this) refresh()
            }
        }
    }
    private fun refresh() { rebuild(); if (a.top === this) a.replaceTop() }
}

class ConsentStaffScreen(a: MainActivity) : Screen(a) {
    override val mode = "consent-staff"
    override fun build() = a.page(I18n.t("consent_title")) { col ->
        col.addView(a.tv(I18n.t("consent_disclaimer"), 24, 500, C.NAVY, 6))
        App.config.of("consent").forEach { item ->
            col.addView(a.bigBtn(item.title.get(), "${I18n.t("version")} ${item.version} · ${item.reviewer}").apply { tap { a.push(ConsentPatientScreen(a, item)) } })
        }
    }
}

class ConsentPatientScreen(a: MainActivity, private val item: ContentItem) : Screen(a) {
    override val mode = "consent"
    override val sensitive = true
    private var questions = ""
    private var result: Delivery? = null
    override fun build() = a.page(item.title.get(), I18n.t("consent_title")) { col ->
        col.addView(a.tv(I18n.t("consent_disclaimer"), 24, 650, C.BLUE, 6))
        col.addView(a.tv(item.body.get(), 26, 400, C.INK, 20))
        col.addView(a.tv("${I18n.t("version")} ${item.version} · ${item.reviewer}", 20, 500, C.BODY, 2))
        val d = result
        if (d != null) col.addView(a.statusCard(d.ok, if (d.ok) I18n.t("reached") else d.detail))
        else {
            col.addView(a.fieldLabel(I18n.t("consent_q"), questions))
            col.addView(a.keys({ questions }, { questions = it; refresh() }))
            col.addView(a.textBtn(I18n.t("speak"), false).apply { tap { a.listen { questions = it; refresh() } } })
            col.addView(a.textBtn(I18n.t("send"), true).apply { tap { send() } })
        }
    }
    private fun send() {
        if (questions.isBlank()) { a.toast(I18n.t("consent_q")); return }
        if (!App.prefs.paired) { a.toast(I18n.t("not_connected")); return }
        App.bg {
            val d = App.repo.deliver("/api/robot/consent-questions", JSONObject().put("content_id", item.id).put("questions", questions))
            App.agent.log("consent", item.id, "questions")
            App.main { result = d; questions = ""; if (a.top === this) refresh() }
        }
    }
    private fun refresh() { rebuild(); if (a.top === this) a.replaceTop() }
}

class VideoCallScreen(a: MainActivity) : Screen(a) {
    override val mode = "video"
    private var state = "prompt"
    override fun build() = a.page(I18n.t("video_offer")) { col ->
        col.addView(a.tv(I18n.t("video_private"), 26, 500, C.NAVY, 5))
        col.addView(a.tv(I18n.t("not_emergency"), 22, 400, C.BODY, 4))
        val (id, name) = target()
        when (state) {
            "dialing" -> col.addView(a.tv(I18n.t("video_dialing"), 30, 650, C.NAVY, 4))
            "connected" -> col.addView(a.tv(I18n.t("video_connected"), 30, 650, C.GREEN, 3))
            "failed", "ended" -> col.addView(a.statusCard(false, I18n.t("video_failed")))
            else -> {
                if (id.isBlank()) col.addView(a.tv(I18n.t("video_unset"), 26, 500, C.BODY, 3))
                else col.addView(a.textBtn(I18n.t("video_start"), true).apply { tap { start(id, name) } })
            }
        }
    }
    private fun target(): Pair<String, String> {
        val s = App.settings
        if (s.videoUserId.isNotBlank()) return s.videoUserId to s.videoName.ifBlank { "Reception" }
        return App.config.clinic.videoUserId to App.config.clinic.videoName.ifBlank { "Reception" }
    }
    private fun start(id: String, name: String) {
        val ok = App.temi.call(id, name)
        state = if (ok) "dialing" else "failed"
        refresh()
    }
    override fun onShow() {
        App.temi.onCall = { ev ->
            state = when (ev) {
                "STARTED" -> "connected"
                "DECLINED", "NOT_ANSWERED", "BUSY", "CANT_JOIN" -> "failed"
                "ENDED" -> if (state == "connected") "ended" else "failed"
                "INITIALIZED" -> "dialing"
                else -> state
            }
            if (a.top === this) refresh()
        }
    }
    override fun onHide() { if (App.temi.onCall != null) App.temi.onCall = null }
    private fun refresh() { rebuild(); if (a.top === this) a.replaceTop() }
}

class FollowUpScreen(a: MainActivity) : Screen(a) {
    override val mode = "followup"
    override val sensitive = true
    private var service = ""
    private var date = ""
    private var person = ""
    private var phone = ""
    private var focus = "person"
    private var result: Delivery? = null
    override fun build() = a.page(I18n.t("follow_title")) { col ->
        col.addView(a.tv(I18n.t("follow_lead"), 26, 400, C.BODY, 4))
        val booking = App.config.clinic.bookingUrl
        if (booking.startsWith("http")) {
            col.addView(a.tv(I18n.t("booking_qr"), 22, 500, C.NAVY, 3))
            col.addView(ImageView(a).apply { setImageBitmap(qr(booking, U.d(280))) }, LinearLayout.LayoutParams(U.d(280), U.d(280)))
        } else col.addView(a.tv(I18n.t("no_booking"), 22, 400, C.BODY, 3))
        val d = result
        if (d != null) col.addView(a.statusCard(d.ok, if (d.ok) I18n.t("follow_lead") else d.detail))
        else {
            col.addView(a.fieldLabel(I18n.t("service"), service).apply { tap { focus = "service"; refresh() } })
            col.addView(a.fieldLabel(I18n.t("date"), date).apply { tap { focus = "date"; refresh() } })
            col.addView(a.fieldLabel(I18n.t("name"), person).apply { tap { focus = "person"; refresh() } })
            col.addView(a.fieldLabel(I18n.t("phone"), phone).apply { tap { focus = "phone"; refresh() } })
            val get = { when (focus) { "service" -> service; "date" -> date; "phone" -> phone; else -> person } }
            col.addView(a.keys(get, { v -> when (focus) { "service" -> service = v; "date" -> date = v; "phone" -> phone = v; else -> person = v }; refresh() }, focus == "phone"))
            col.addView(a.textBtn(I18n.t("send"), true).apply { tap { send() } })
        }
    }
    private fun send() {
        if (service.isBlank() || (phone.isBlank() && person.isBlank())) { a.toast(I18n.t("contact_need")); return }
        App.bg {
            val body = JSONObject().put("kind", "followup").put("service", service).put("preferred_date", date).put("contact_name", person).put("contact_phone", phone)
            val d = App.repo.deliver("/api/robot/arrivals", body)
            App.agent.log("followup", null, if (d.ok) "stored" else "failed")
            App.main { result = d; service = ""; person = ""; phone = ""; if (a.top === this) refresh() }
        }
    }
    private fun refresh() { rebuild(); if (a.top === this) a.replaceTop() }
}
