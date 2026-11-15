package ai.robocore.zeeno

import android.graphics.Bitmap
import android.util.Base64
import android.util.Log
import com.robotemi.sdk.Robot
import com.robotemi.sdk.TtsRequest
import com.robotemi.sdk.SttRequest
import com.robotemi.sdk.listeners.OnBeWithMeStatusChangedListener
import com.robotemi.sdk.listeners.OnDetectionStateChangedListener
import com.robotemi.sdk.listeners.OnGoToLocationStatusChangedListener
import com.robotemi.sdk.listeners.OnRobotReadyListener
import com.robotemi.sdk.navigation.listener.OnCurrentPositionChangedListener
import com.robotemi.sdk.navigation.model.Position
import com.robotemi.sdk.navigation.model.SpeedLevel
import com.robotemi.sdk.permission.Permission
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import kotlin.math.hypot

data class Pose(val x: Float, val y: Float, val yaw: Float)

/** temi SDK 1.138.0: speech, navigation, map and kiosk. Video calls are Phase 2 and are not offered. */
class Temi {
    val robot: Robot = Robot.getInstance()
    @Volatile var ready = false; private set
    @Volatile var pose: Pose? = null; private set
    @Volatile var locationPoses: Map<String, Pose> = emptyMap(); private set
    @Volatile var mapId: String? = null; private set
    var onReady: (() -> Unit)? = null
    var onPose: ((Pose) -> Unit)? = null
    var onNav: ((location: String, status: String, description: String) -> Unit)? = null
    var onAsr: ((String) -> Unit)? = null

    fun attach() {
        robot.addOnRobotReadyListener(object : OnRobotReadyListener {
            override fun onRobotReady(isReady: Boolean) { ready = isReady; if (isReady) App.main { onReady?.invoke() } }
        })
        robot.addOnCurrentPositionChangedListener(object : OnCurrentPositionChangedListener {
            override fun onCurrentPositionChanged(position: Position) { val p = Pose(position.x, position.y, position.yaw); pose = p; App.main { onPose?.invoke(p) } }
        })
        robot.addOnGoToLocationStatusChangedListener(object : OnGoToLocationStatusChangedListener {
            override fun onGoToLocationStatusChanged(location: String, status: String, descriptionId: Int, description: String) { App.main { onNav?.invoke(location, status, description) } }
        })
        robot.addOnBeWithMeStatusChangedListener(object : OnBeWithMeStatusChangedListener { override fun onBeWithMeStatusChanged(status: String) {} })
        robot.addOnDetectionStateChangedListener(object : OnDetectionStateChangedListener {
            override fun onDetectionStateChanged(state: Int) { App.presence.onDetection(state) }
        })
        robot.addAsrListener(object : Robot.AsrListener {
            override fun onAsrResult(asrResult: String, sttLanguage: com.robotemi.sdk.SttLanguage) {
                runCatching { robot.finishConversation() }
                App.main { onAsr?.invoke(asrResult) }
            }
        })
        robot.addTtsListener(object : Robot.TtsListener { override fun onTtsStatusChanged(ttsRequest: TtsRequest) { speaker.onStatus(ttsRequest) } })
        ready = runCatching { robot.isReady }.getOrDefault(false)
    }

    val serial: String get() = runCatching { robot.serialNumber }.getOrNull()?.takeIf { it.isNotBlank() } ?: "unknown"
    fun battery() = runCatching { robot.batteryData }.getOrNull()
    fun locations(): List<String> = runCatching { robot.locations }.getOrDefault(emptyList()).map { it.lowercase() }
    fun hasLocation(name: String) = name.isNotBlank() && (locationPoses.containsKey(name.lowercase()) || locations().contains(name.lowercase()))
    fun granted(p: Permission) = runCatching { robot.checkSelfPermission(p) == Permission.GRANTED }.getOrDefault(false)
    fun requestPermissions() {
        val missing = listOf(Permission.MAP, Permission.SETTINGS).filter { !granted(it) }
        if (missing.isNotEmpty()) runCatching { robot.requestPermissions(missing, 11) }
    }
    fun applyKiosk(on: Boolean) = runCatching {
        if (on) {
            if (!robot.isSelectedKioskApp()) robot.requestToBeKioskApp()
            if (granted(Permission.SETTINGS) && !robot.isKioskModeOn()) robot.setKioskModeOn(true)
            robot.hideTopBar()
            robot.toggleNavigationBillboard(true)
        } else robot.showTopBar()
    }.onFailure { Log.w(TAG, "kiosk", it) }

    private fun speed(s: String) = when (s) { "high" -> SpeedLevel.HIGH; "medium" -> SpeedLevel.MEDIUM; else -> SpeedLevel.SLOW }
    fun goTo(location: String, backwards: Boolean, speed: String) = runCatching { robot.goTo(location.lowercase(), backwards = backwards, noBypass = null, speedLevel = speed(speed)) }
    fun goHome() = runCatching { robot.goTo("home base") }
    fun stop() = runCatching { robot.stopMovement() }

    val speaker = Speaker()
    inner class Speaker {
        private var pending = ArrayDeque<String>()
        private var current: java.util.UUID? = null
        private var onDone: (() -> Unit)? = null
        @Volatile var speaking = false; private set
        fun say(text: String, l: String = I18n.lang, done: (() -> Unit)? = null) {
            stop(false); onDone = done
            val parts = text.replace(Regex("\\s+"), " ").trim().split(Regex("(?<=[.!?。！？；;])\\s*")).filter { it.isNotBlank() }
            pending = ArrayDeque(parts.ifEmpty { listOf(text) })
            if (pending.isEmpty()) { done?.invoke(); return }
            speaking = true; next(l)
        }
        private fun next(l: String) {
            val s = pending.removeFirstOrNull() ?: run { finish(); return }
            val r = TtsRequest.create(s, false, I18n.tts(l), false, false)
            current = r.id
            runCatching { robot.speak(r) }.onFailure { finish() }
        }
        fun onStatus(r: TtsRequest) {
            if (r.id != current) return
            when (r.status) {
                TtsRequest.Status.COMPLETED -> App.main { if (r.id == current) next(I18n.lang) }
                TtsRequest.Status.ERROR, TtsRequest.Status.NOT_ALLOWED, TtsRequest.Status.CANCELED -> App.main { if (r.id == current) finish() }
                else -> {}
            }
        }
        private fun finish() { current = null; pending.clear(); speaking = false; val d = onDone; onDone = null; d?.invoke() }
        fun stop(notify: Boolean = false) {
            val had = current != null; current = null; pending.clear()
            if (had) runCatching { robot.cancelAllTtsRequests() }
            speaking = false
            if (!notify) onDone = null else { val d = onDone; onDone = null; d?.invoke() }
        }
    }
    fun listen(lang: String) = runCatching { robot.wakeup(SttRequest(listOf(I18n.stt(lang)), 12, false)) }
    fun stopListening() = runCatching { robot.finishConversation() }

    @androidx.annotation.WorkerThread
    fun loadLocationPoses() {
        if (!granted(Permission.MAP)) return
        val m = runCatching { robot.getMapData() }.getOrNull() ?: return
        mapId = m.mapId
        locationPoses = m.locations.orEmpty().mapNotNull { l -> l.layerPoses?.firstOrNull()?.let { l.layerId.lowercase() to Pose(it.x, it.y, it.theta) } }.toMap()
    }
    fun addLocationAt(name: String, x: Float, y: Float, yaw: Float): Int {
        if (!granted(Permission.MAP)) { requestPermissions(); return 403 }
        return runCatching {
            val layer = com.robotemi.sdk.map.Layer.upsertLayer(name.trim().lowercase(), 4, listOf(com.robotemi.sdk.map.LayerPose(x, y, yaw)), null) ?: return 400
            robot.upsertMapLayer(layer)
        }.getOrElse { 0 }
    }
    fun deleteLocation(name: String) = runCatching { robot.deleteLocation(name.lowercase()) }.getOrDefault(false)

    @androidx.annotation.WorkerThread
    fun mapSnapshot(): Pair<JSONObject?, String> {
        if (!granted(Permission.MAP)) return null to "permission_missing"
        val m = runCatching { robot.getMapData() }.getOrNull() ?: return null to "map_unavailable"
        val img = m.mapImage; val info = m.mapInfo
        val cols = img.cols; val rows = img.rows; val data = img.data
        if (cols <= 0 || rows <= 0 || data.size < cols * rows) return null to "map_empty"
        val px = IntArray(cols * rows) { i ->
            val v = data[i]
            when { v < 0 -> 0xFFE7EEF2.toInt(); v < 25 -> 0xFFFFFFFF.toInt(); else -> ((v.coerceAtMost(100) * 255 / 100) shl 24) or 0x000F3A }
        }
        val full = Bitmap.createBitmap(px, cols, rows, Bitmap.Config.ARGB_8888)
        val scale = if (cols * rows > 4_000_000) 2 else 1
        val bmp = if (scale == 1) full else Bitmap.createScaledBitmap(full, cols / scale, rows / scale, true).also { full.recycle() }
        val out = ByteArrayOutputStream(); bmp.compress(Bitmap.CompressFormat.PNG, 100, out); bmp.recycle()
        val res = info.resolution.takeIf { it > 0f } ?: 0.05f
        val locs = JSONArray(); var straight = 0; var flipped = 0
        fun free(c: Int, r: Int): Boolean {
            for (dr in -2..2) for (dc in -2..2) { val cc = c + dc; val rr = r + dr; if (cc in 0 until cols && rr in 0 until rows && data[rr * cols + cc] in 0..24) return true }
            return false
        }
        val poses = HashMap<String, Pose>()
        for (l in m.locations.orEmpty()) {
            val p = l.layerPoses?.firstOrNull() ?: continue
            poses[l.layerId.lowercase()] = Pose(p.x, p.y, p.theta)
            locs.put(JSONObject().put("name", l.layerId).put("x", p.x.toDouble()).put("y", p.y.toDouble()).put("yaw", p.theta.toDouble()))
            val c = ((p.x - info.originX) / res).toInt(); val r = ((p.y - info.originY) / res).toInt()
            if (free(c, r)) straight++; if (free(c, rows - 1 - r)) flipped++
        }
        locationPoses = poses; mapId = m.mapId
        val j = JSONObject().put("mapId", m.mapId).put("mapName", m.mapName).put("width", cols / scale).put("height", rows / scale)
            .put("resolution", (res * scale).toDouble()).put("originX", info.originX.toDouble()).put("originY", info.originY.toDouble())
            .put("flipY", flipped > straight).put("png", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)).put("locations", locs)
        val cur = pose ?: runCatching { robot.getPosition() }.getOrNull()?.let { Pose(it.x, it.y, it.yaw) }
        cur?.let { j.put("pose", JSONObject().put("x", it.x.toDouble()).put("y", it.y.toDouble()).put("yaw", it.yaw.toDouble())) }
        return j to "ok"
    }
    fun distanceTo(location: String): Double? {
        val p = pose ?: return null; val l = locationPoses[location.lowercase()] ?: return null
        return hypot((p.x - l.x).toDouble(), (p.y - l.y).toDouble())
    }
    companion object { const val TAG = "ZeenoTemi" }
}
