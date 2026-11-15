package ai.robocore.zeeno

import org.json.JSONArray
import org.json.JSONObject

private fun JSONObject.s(k: String) = optString(k, "").let { if (it == "null") "" else it }
private fun JSONObject.loc(key: String): Map<String, String> {
    val o = optJSONObject(key)
    if (o != null) return I18n.LANGS.associateWith { o.optString(it, "") }
    return I18n.LANGS.associateWith { lang ->
        val col = lang.replace("-", "_").lowercase().let { if (it == "zh_hans") "zh_hans" else if (it == "zh_hant") "zh_hant" else it }
        optString("${key}_$col", optString("${key}_$lang", ""))
    }
}
private fun JSONArray?.objs() = if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

data class Loc(val map: Map<String, String>) {
    fun get(lang: String = I18n.lang) = map[lang]?.takeIf { it.isNotBlank() } ?: map["en"].orEmpty()
    companion object { fun from(o: JSONObject, key: String) = Loc(o.loc(key)) }
}

data class ContentItem(
    val id: String, val kind: String, val slug: String, val category: String, val sort: Int,
    val version: String, val reviewer: String, val approved: Boolean, val mediaKind: String, val mediaUrl: String,
    val title: Loc, val body: Loc,
) {
    companion object {
        fun from(o: JSONObject) = ContentItem(
            o.s("id"), o.s("kind"), o.s("slug"), o.s("category"), o.optInt("sort_order"),
            o.s("version_label").ifBlank { "1.0" }, o.s("reviewer"),
            o.optInt("approved", 1) == 1 || o.optBoolean("approved", true),
            o.s("media_kind").ifBlank { "text" }, o.s("media_url"), Loc.from(o, "title"), Loc.from(o, "body"),
        )
    }
}

data class Dentist(val id: String, val name: String, val role: String, val bio: Loc, val languages: List<String>, val specialties: String, val photo: String) {
    companion object {
        fun from(o: JSONObject) = Dentist(o.s("id"), o.s("name"), o.s("role"), Loc.from(o, "bio"),
            o.optJSONArray("languages")?.let { a -> (0 until a.length()).map { a.optString(it) } } ?: emptyList(),
            o.s("specialties"), o.s("photo_url"))
    }
}

data class Destination(val id: String, val location: String, val kind: String, val requiresStaff: Boolean, val sort: Int, val label: Loc, val note: Loc) {
    companion object {
        fun from(o: JSONObject) = Destination(o.s("id"), o.s("location_name").trim().lowercase(), o.s("kind").ifBlank { "waiting" },
            o.optInt("requires_staff", 0) == 1 || o.optBoolean("requires_staff", false), o.optInt("sort_order"), Loc.from(o, "label"), Loc.from(o, "note"))
    }
}

data class Clinic(val name: String, val address: String, val phone: String, val email: String, val welcome: Loc, val hours: Loc, val reviewer: String, val bookingUrl: String = "", val videoUserId: String = "", val videoName: String = "") {
    companion object {
        fun from(o: JSONObject?) = if (o == null) Clinic("Zeeno", "", "", "", Loc(emptyMap()), Loc(emptyMap()), "")
        else Clinic(o.s("name"), o.s("address"), o.s("phone"), o.s("email"), Loc.from(o, "welcome"), Loc.from(o, "hours"), o.s("reviewer"), o.s("booking_url"), o.s("video_user_id"), o.s("video_name"))
    }
}

data class FormField(val id: String, val type: String, val required: Boolean, val label: Loc)
data class ClinicForm(val id: String, val slug: String, val version: String, val reviewer: String, val title: Loc, val intro: Loc, val fields: List<FormField>) {
    companion object {
        fun from(o: JSONObject) = ClinicForm(
            o.s("id"), o.s("slug"), o.s("version_label").ifBlank { "1.0" }, o.s("reviewer"), Loc.from(o, "title"), Loc.from(o, "intro"),
            o.optJSONArray("fields")?.objs()?.map { f ->
                FormField(f.s("id"), f.s("type").ifBlank { "text" }, f.optBoolean("required", false) || f.optInt("required", 0) == 1, Loc.from(f, "label"))
            } ?: emptyList(),
        )
    }
}

data class Settings(
    val defaultLang: String = "en", val languages: List<String> = I18n.LANGS, val pin: String = "2408",
    val kiosk: Boolean = true, val speed: String = "slow", val backwards: Boolean = true,
    val greetCooldownMin: Int = 8, val idleClearSeconds: Int = 90, val idleHomeMinutes: Int = 0,
    val videoUserId: String = "", val videoName: String = "",
) {
    fun toJson() = JSONObject().put("defaultLang", defaultLang).put("languages", JSONArray(languages)).put("pin", pin)
        .put("kiosk", kiosk).put("speed", speed).put("backwards", backwards).put("greetCooldownMin", greetCooldownMin)
        .put("idleClearSeconds", idleClearSeconds).put("idleHomeMinutes", idleHomeMinutes)
        .put("videoUserId", videoUserId).put("videoName", videoName)
    companion object {
        fun from(o: JSONObject?): Settings {
            val d = Settings(); if (o == null) return d
            val langs = o.optJSONArray("languages")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it in I18n.LANGS } }?.takeIf { it.isNotEmpty() } ?: d.languages
            return Settings(
                o.optString("defaultLang", d.defaultLang).takeIf { it in I18n.LANGS } ?: "en", langs,
                o.optString("pin", d.pin).ifBlank { d.pin }, o.optBoolean("kiosk", true),
                o.optString("speed", d.speed), o.optBoolean("backwards", true),
                o.optInt("greetCooldownMin", d.greetCooldownMin), o.optInt("idleClearSeconds", d.idleClearSeconds), o.optInt("idleHomeMinutes", 0),
                o.optString("videoUserId", ""), o.optString("videoName", ""),
            )
        }
    }
}

data class Config(
    val robotName: String, val settings: Settings, val version: String, val clinic: Clinic,
    val dentists: List<Dentist>, val content: List<ContentItem>, val destinations: List<Destination>, val fromSeed: Boolean,
    val forms: List<ClinicForm> = emptyList(),
) {
    fun of(kind: String) = content.filter { it.kind == kind && it.approved }.sortedBy { it.sort }
    companion object {
        fun fromServer(o: JSONObject) = Config(
            o.optJSONObject("robot")?.optString("name") ?: "temi", Settings.from(o.optJSONObject("settings")), o.optString("version"),
            Clinic.from(o.optJSONObject("clinic")), o.optJSONArray("dentists").objs().map(Dentist::from),
            o.optJSONArray("content").objs().map(ContentItem::from).filter { it.approved },
            o.optJSONArray("destinations").objs().map(Destination::from), false,
            o.optJSONArray("forms").objs().map(ClinicForm::from),
        )
        fun fromSeed(o: JSONObject, settings: Settings): Config {
            fun id(j: JSONObject, p: String) { if (j.optString("id").isBlank()) j.put("id", p) }
            val content = o.optJSONArray("content").objs().map { j ->
                id(j, "seed_${j.optString("kind")}_${j.optString("slug")}_${j.optString("version_label")}")
                if (!j.has("approved")) j.put("approved", 1)
                ContentItem.from(j)
            }
            val dentists = o.optJSONArray("dentists").objs().mapIndexed { i, j -> id(j, "seed_d$i"); Dentist.from(j) }
            val dest = o.optJSONArray("destinations").objs().map { j -> id(j, "seed_" + j.optString("location_name")); Destination.from(j) }
            val forms = o.optJSONArray("forms").objs().map { j -> id(j, "seed_form_" + j.optString("slug")); ClinicForm.from(j) }
            return Config("temi", settings, "seed", Clinic.from(o.optJSONObject("clinic")), dentists, content, dest, true, forms)
        }
    }
}

/** Keyword match over approved clinic text. The same idea as the worker: no invented clinical advice. */
object Faq {
    private val stop = "the a an to of and or for is in on my me do you how what when where your this that with from are can el la los las que una por para con del".split(" ").toSet()
    private fun tokens(s: String): List<String> {
        val out = ArrayList<String>()
        Regex("[a-záéíóúüñ0-9]{3,}", RegexOption.IGNORE_CASE).findAll(s.lowercase()).forEach { if (it.value !in stop) out += it.value }
        val cjk = s.filter { it in '\u4e00'..'\u9fff' }
        cjk.forEachIndexed { i, ch -> out += ch.toString(); if (i > 0) out += "" + cjk[i - 1] + ch }
        return out
    }
    fun match(question: String, items: List<ContentItem>): ContentItem? {
        val q = tokens(question); if (q.isEmpty()) return null
        var best: ContentItem? = null; var score = 0
        for (item in items) {
            if (item.kind !in setOf("faq", "orientation", "explainer", "oral")) continue
            val title = I18n.LANGS.joinToString(" ") { item.title.get(it) }.lowercase()
            val body = I18n.LANGS.joinToString(" ") { item.body.get(it) }.lowercase() + " " + item.category
            var s = 0
            for (t in q) s += if (title.contains(t)) 3 else if (body.contains(t)) 1 else 0
            if (s > score) { score = s; best = item }
        }
        return if (score >= 3) best else null
    }
}
