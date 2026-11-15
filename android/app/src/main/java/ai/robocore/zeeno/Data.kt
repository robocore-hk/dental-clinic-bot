package ai.robocore.zeeno

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class Prefs(ctx: Context) {
    private val p: SharedPreferences = ctx.getSharedPreferences("zeeno", Context.MODE_PRIVATE)
    var api: String get() = (p.getString("api", null) ?: BuildConfig.DEFAULT_API).trimEnd('/'); set(v) = p.edit().putString("api", v.trimEnd('/')).apply()
    var token: String? get() = p.getString("token", null); set(v) = p.edit().putString("token", v).apply()
    var robotName: String get() = p.getString("robotName", "") ?: ""; set(v) = p.edit().putString("robotName", v).apply()
    var config: String? get() = p.getString("config", null); set(v) = p.edit().putString("config", v).apply()
    var localSettings: String? get() = p.getString("localSettings", null); set(v) = p.edit().putString("localSettings", v).apply()
    val paired get() = !token.isNullOrBlank()
}

class ApiException(val status: Int, message: String) : Exception(message)

class Api(private val prefs: Prefs) {
    private fun open(path: String, method: String, ctype: String?): HttpURLConnection {
        val c = URL(prefs.api + path).openConnection() as HttpURLConnection
        c.requestMethod = method; c.connectTimeout = 10_000; c.readTimeout = 30_000
        prefs.token?.let { c.setRequestProperty("Authorization", "Bearer $it") }
        if (ctype != null) { c.doOutput = true; c.setRequestProperty("Content-Type", ctype) }
        return c
    }
    private fun read(c: HttpURLConnection): JSONObject {
        val code = c.responseCode
        val txt = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        c.disconnect()
        val j = runCatching { JSONObject(txt) }.getOrElse { JSONObject() }
        if (code !in 200..299) throw ApiException(code, j.optString("message", j.optString("error", "HTTP $code")))
        return j
    }
    fun get(path: String) = read(open(path, "GET", null))
    fun send(method: String, path: String, body: JSONObject): JSONObject {
        val c = open(path, method, "application/json; charset=utf-8")
        c.outputStream.use { it.write(body.toString().toByteArray()) }
        return read(c)
    }
    fun post(path: String, body: JSONObject) = send("POST", path, body)
}

data class Delivery(val ok: Boolean, val detail: String, val id: String? = null, val raw: JSONObject? = null)

class Repo(private val ctx: Context, private val prefs: Prefs, private val api: Api) {
    @Volatile var config: Config = load(); private set
    val listeners = mutableListOf<(Config) -> Unit>()
    private fun localSettings() = Settings.from(prefs.localSettings?.let { runCatching { JSONObject(it) }.getOrNull() })
    private fun seed(): Config = Config.fromSeed(JSONObject(ctx.assets.open("seed.json").bufferedReader().use { it.readText() }), localSettings())
    private fun load(): Config {
        if (prefs.paired) prefs.config?.let { s -> runCatching { return Config.fromServer(JSONObject(s)) } }
        return seed()
    }
    private fun publish(c: Config) { config = c; App.main { listeners.toList().forEach { it(c) } } }

    fun refresh(): Boolean {
        if (!prefs.paired) return false
        val j = api.get("/api/robot/config")
        val changed = j.optString("version") != config.version || config.fromSeed
        prefs.config = j.toString(); prefs.robotName = j.optJSONObject("robot")?.optString("name") ?: ""
        publish(Config.fromServer(j))
        return changed
    }
    fun saveSettings(s: Settings) {
        if (prefs.paired) {
            api.send("PUT", "/api/robot/settings", s.toJson())
            prefs.config?.let { runCatching { prefs.config = JSONObject(it).put("settings", s.toJson()).toString() } }
        } else prefs.localSettings = s.toJson().toString()
        publish(config.copy(settings = s))
    }
    fun pair(code: String, serial: String) {
        val r = api.post("/api/robot/pair", JSONObject().put("code", code).put("serial", serial))
        prefs.token = r.getString("token"); prefs.robotName = r.optString("name"); refresh()
    }
    fun unpair() { prefs.token = null; prefs.config = null; publish(seed()) }

    /** Writes a staff inbox row. ok is true only when the server stored it. */
    fun deliver(path: String, body: JSONObject, okValue: String = "stored"): Delivery {
        if (!prefs.paired) return Delivery(false, I18n.t("not_connected"))
        return try {
            val r = api.post(path, body)
            if (r.optString("delivery") == "stored" && r.optBoolean("reached_staff")) Delivery(true, I18n.t("reached"), r.optString("id").ifBlank { null }, r)
            else Delivery(false, I18n.t("not_confirmed"), null, r)
        } catch (_: Exception) { Delivery(false, I18n.t("not_confirmed")) }
    }
}
