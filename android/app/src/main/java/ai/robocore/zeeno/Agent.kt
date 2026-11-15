package ai.robocore.zeeno

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/** Heartbeat, remote commands, usage events. Events never include patient names. */
class Agent {
    private val temi get() = App.temi
    @Volatile private var running = false
    @Volatile var mode = "welcome"
    var onAftercare: ((String) -> Unit)? = null
    private val events = JSONArray()
    private var lastPoseLoad = 0L

    fun log(type: String, ref: String? = null, value: String? = null) {
        synchronized(events) { if (events.length() < 200) events.put(JSONObject().put("type", type).put("ref", ref?.takeUnless { it.startsWith("seed_") }).put("value", value?.take(80)).put("at", System.currentTimeMillis())) }
    }
    private fun flush() {
        val batch = synchronized(events) { if (events.length() == 0) return; val b = JSONArray(events.toString()); while (events.length() > 0) events.remove(0); b }
        runCatching { App.api.post("/api/robot/events", JSONObject().put("events", batch)) }.onFailure { synchronized(events) { for (i in 0 until batch.length()) events.put(batch.get(i)) } }
    }
    fun ask(question: String, lang: String): JSONObject? {
        if (!App.prefs.paired) return null
        return runCatching { App.api.post("/api/robot/ask", JSONObject().put("question", question.take(400)).put("lang", lang)) }.getOrNull()
    }
    fun start() {
        if (running) return; running = true
        Thread({ loop() }, "zeeno-agent").apply { isDaemon = true; start() }
    }
    private fun loop() {
        while (running) {
            var wait = 15_000L
            try {
                if (System.currentTimeMillis() - lastPoseLoad > 300_000) { temi.loadLocationPoses(); lastPoseLoad = System.currentTimeMillis() }
                if (App.prefs.paired) {
                    val b = temi.battery()
                    val body = JSONObject().put("battery", b?.level).put("charging", b?.isCharging).put("mode", mode).put("app", BuildConfig.VERSION_NAME)
                        .put("mapId", temi.mapId).put("kiosk", App.settings.kiosk).put("locations", JSONArray(temi.locations()))
                    temi.pose?.let { body.put("pose", JSONObject().put("x", it.x.toDouble()).put("y", it.y.toDouble()).put("yaw", it.yaw.toDouble())) }
                    val r = App.api.post("/api/robot/heartbeat", body)
                    wait = r.optLong("interval", 15_000L).coerceIn(1_500L, 60_000L)
                    if (r.optString("version") != App.repo.config.version) runCatching { App.repo.refresh() }
                    val cmds = r.optJSONArray("commands") ?: JSONArray()
                    for (i in 0 until cmds.length()) cmds.optJSONObject(i)?.let { run(it) }
                    flush()
                    if (App.settings.idleHomeMinutes > 0 && mode == "welcome") { /* charger return is driven by the activity idle timer */ }
                }
            } catch (e: ApiException) {
                if (e.status == 401) App.main { App.repo.unpair() }
                Log.w(TAG, "sync ${e.status} ${e.message}")
            } catch (e: Exception) { Log.w(TAG, "sync", e) }
            try { Thread.sleep(wait) } catch (_: InterruptedException) { break }
        }
    }
    private fun done(id: String, ok: Boolean, reason: String? = null) =
        runCatching { App.api.post("/api/robot/commands/$id", JSONObject().put("ok", ok).put("reason", reason)) }
    private fun postMap(): String {
        val (snap, why) = temi.mapSnapshot(); if (snap == null) return why
        App.api.post("/api/robot/map", snap); return "ok"
    }
    private fun run(c: JSONObject) {
        val id = c.optString("id"); val p = c.optJSONObject("payload") ?: JSONObject()
        try {
            when (c.optString("type")) {
                "map_refresh" -> { val r = postMap(); done(id, r == "ok", r.takeIf { it != "ok" }) }
                "location_add" -> {
                    val code = temi.addLocationAt(p.optString("name"), p.optDouble("x").toFloat(), p.optDouble("y").toFloat(), p.optDouble("yaw", 0.0).toFloat())
                    Thread.sleep(800); postMap(); done(id, code == 200, if (code == 200) null else "add_failed_$code")
                }
                "location_delete" -> { val ok = temi.deleteLocation(p.optString("name")); Thread.sleep(500); postMap(); done(id, ok, if (ok) null else "not_deleted") }
                "goto" -> { App.main { temi.goTo(p.optString("location"), false, App.settings.speed) }; done(id, true) }
                "stop" -> { App.main { temi.stop(); temi.speaker.stop() }; done(id, true) }
                "home" -> { App.main { temi.goHome() }; done(id, true) }
                "speak" -> { val t = p.optString("text"); App.main { temi.speaker.say(t) }; done(id, true) }
                "sync" -> { App.repo.refresh(); done(id, true) }
                "aftercare_show" -> { val cid = p.optString("contentId"); App.main { onAftercare?.invoke(cid) }; done(id, cid.isNotBlank(), if (cid.isBlank()) "missing" else null) }
                else -> done(id, false, "unknown_command")
            }
        } catch (e: Exception) { done(id, false, e.message?.take(80) ?: "error") }
    }
    companion object { const val TAG = "ZeenoAgent" }
}
