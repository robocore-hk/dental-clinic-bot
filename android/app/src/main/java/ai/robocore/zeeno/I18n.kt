package ai.robocore.zeeno

import com.robotemi.sdk.SttLanguage
import com.robotemi.sdk.TtsRequest

/** Patient-facing copy in English, Spanish, Simplified Chinese and Traditional Chinese. */
object I18n {
    val LANGS = listOf("en", "es", "zh-Hans", "zh-Hant")
    var lang = "en"

    fun label(l: String) = when (l) { "es" -> "Español"; "zh-Hans" -> "简体中文"; "zh-Hant" -> "繁體中文"; else -> "English" }
    fun short(l: String) = when (l) { "es" -> "ES"; "zh-Hans" -> "简"; "zh-Hant" -> "繁"; else -> "EN" }
    fun tts(l: String = lang) = when (l) {
        "es" -> TtsRequest.Language.ES_ES
        "zh-Hans" -> TtsRequest.Language.ZH_CN
        "zh-Hant" -> TtsRequest.Language.ZH_TW
        else -> TtsRequest.Language.EN_US
    }
    fun stt(l: String = lang) = when (l) {
        "es" -> SttLanguage.ES_ES
        "zh-Hans" -> SttLanguage.ZH_CN
        "zh-Hant" -> SttLanguage.ZH_TW
        else -> SttLanguage.EN_US
    }

    private fun s(en: String, es: String, zh: String, zht: String) = arrayOf(en, es, zh, zht)
    private val T = mapOf(
        "greet" to s("Hello. I am Zeeno. I can help you tell reception you are here.", "Hola. Soy Zeeno. Puedo avisar a recepción de que está aquí.", "您好。我是 Zeeno。我可以帮您通知前台已经到达。", "您好。我是 Zeeno。我可以幫您通知前台已經到達。"),
        "choose_lang" to s("Choose your language", "Elija su idioma", "请选择语言", "請選擇語言"),
        "intent_title" to s("What brings you in today?", "¿Qué le trae hoy?", "今天您来做什么？", "今天您來做什麼？"),
        "intent_appt" to s("I have an appointment", "Tengo una cita", "我有预约", "我有預約"),
        "intent_with" to s("I am with someone", "Acompaño a alguien", "我是陪同", "我是陪同"),
        "intent_enquiry" to s("I need an appointment", "Necesito una cita", "我需要预约", "我需要預約"),
        "with_body" to s("You are welcome to wait with them. I will not announce medical details in the waiting room.", "Puede esperar con esa persona. No anunciaré datos médicos en la sala de espera.", "您可以陪同一起等候。我不会在候诊区宣读医疗信息。", "您可以陪同一起等候。我不會在候診區宣讀醫療信息。"),
        "home_title" to s("How can we help?", "¿Cómo podemos ayudar?", "我们能帮您做什么？", "我們能幫您做什麼？"),
        "tile_appt" to s("I have an appointment", "Tengo una cita", "我有预约", "我有預約"),
        "tile_appt_sub" to s("Tell reception you have arrived", "Avisar a recepción de su llegada", "通知前台您已到达", "通知前台您已到達"),
        "tile_need" to s("I need an appointment", "Necesito una cita", "我需要预约", "我需要預約"),
        "tile_need_sub" to s("Send a request. It is not a confirmation.", "Enviar una solicitud. No es una confirmación.", "发送请求。这不是确认。", "發送請求。這不是確認。"),
        "tile_about" to s("About my dental visit", "Sobre mi visita", "关于这次就诊", "關於這次就診"),
        "tile_about_sub" to s("First visit, treatments and questions", "Primera visita, tratamientos y preguntas", "初诊、治疗说明和常见问题", "初診、治療說明和常見問題"),
        "tile_comfort" to s("Help me feel comfortable", "Ayúdeme a estar tranquilo", "帮我放松一些", "幫我放鬆一些"),
        "tile_comfort_sub" to s("A quiet pause, or something for children", "Una pausa tranquila, o algo para niños", "安静地停一下，或儿童活动", "安靜地停一下，或兒童活動"),
        "tile_dir" to s("Directions", "Cómo llegar", "怎么走", "怎麼走"),
        "tile_dir_sub" to s("Reception, waiting area or an approved door", "Recepción, espera o una puerta autorizada", "前台、候诊区或已允许的门口", "前台、候診區或已允許的門口"),
        "tile_contact" to s("Contact reception", "Contactar recepción", "联系前台", "聯絡前台"),
        "tile_contact_sub" to s("Ask the team to come over", "Pedir que venga el equipo", "请工作人员过来", "請工作人員過來"),
        "feedback_link" to s("How was your visit?", "¿Cómo fue su visita?", "这次就诊怎么样？", "這次就診怎麼樣？"),
        "back" to s("Back", "Atrás", "返回", "返回"),
        "home" to s("Home", "Inicio", "主页", "主頁"),
        "contact" to s("Contact reception", "Recepción", "联系前台", "聯絡前台"),
        "settings" to s("Staff settings", "Ajustes del equipo", "工作人员设置", "工作人員設定"),
        "pin" to s("Staff PIN", "PIN del equipo", "工作人员密码", "工作人員密碼"),
        "wrong_pin" to s("That PIN is not correct.", "Ese PIN no es correcto.", "密码不正确。", "密碼不正確。"),
        "exit" to s("Exit", "Salir", "退出", "離開"),
        "cancel" to s("Cancel", "Cancelar", "取消", "取消"),
        "next" to s("Continue", "Continuar", "继续", "繼續"),
        "send" to s("Send to reception", "Enviar a recepción", "发给前台", "發給前台"),
        "done" to s("Done", "Listo", "完成", "完成"),
        "confirm" to s("Please confirm", "Confirme, por favor", "请确认", "請確認"),
        "edit" to s("Change", "Cambiar", "修改", "修改"),
        "speak" to s("Speak", "Hablar", "说话", "說話"),
        "clear" to s("Clear", "Borrar", "清除", "清除"),
        "arrival_title" to s("I have arrived", "He llegado", "我已到达", "我已到達"),
        "arrival_lead" to s("This tells reception you are here. It does not complete check-in in a booking system.", "Esto avisa a recepción de que está aquí. No completa el registro en un sistema de citas.", "这会通知前台您已到达。它不会在预约系统里完成签到。", "這會通知前台您已到達。它不會在預約系統裡完成簽到。"),
        "ref" to s("Booking reference", "Referencia de la cita", "预约编号", "預約編號"),
        "name" to s("Name", "Nombre", "姓名", "姓名"),
        "time" to s("Appointment time", "Hora de la cita", "预约时间", "預約時間"),
        "or" to s("or", "o", "或", "或"),
        "fallback" to s("No match? Ask reception to help", "¿No coincide? Pida ayuda en recepción", "对不上？请前台协助", "對不上？請前台協助"),
        "need_details" to s("Enter a booking reference, or your name and appointment time.", "Escriba la referencia, o su nombre y la hora.", "请填写预约编号，或姓名和预约时间。", "請填寫預約編號，或姓名和預約時間。"),
        "not_checkin" to s("Reception has your arrival notice and will confirm the visit. You are not checked in by an outside booking system.", "Recepción tiene su aviso de llegada y confirmará la visita. Un sistema externo no le ha registrado.", "前台已收到到达通知，并将确认这次就诊。外部预约系统并没有完成签到。", "前台已收到到達通知，並將確認這次就診。外部預約系統並沒有完成簽到。"),
        "reached" to s("This is in the reception inbox.", "Esto está en la bandeja de recepción.", "前台收件箱里已经有这条消息。", "前台收件箱裡已經有這條消息。"),
        "not_confirmed" to s("We could not confirm that this reached the team. Please speak with reception.", "No pudimos confirmar que llegó al equipo. Hable con recepción.", "无法确认工作人员已收到。请直接向前台说明。", "無法確認工作人員已收到。請直接向前台說明。"),
        "not_connected" to s("This robot is not connected to the clinic inbox, so nothing was delivered. Please speak with reception.", "Este robot no está conectado con la bandeja de la clínica, así que no se entregó nada. Hable con recepción.", "这台机器人没有连上诊所收件箱，所以没有送达。请直接向前台说明。", "這台機器人沒有連上診所收件箱，所以沒有送達。請直接向前台說明。"),
        "walkin_title" to s("Request an appointment", "Solicitar una cita", "预约请求", "預約請求"),
        "walkin_lead" to s("Reception will read this request. It is not a confirmed appointment.", "Recepción leerá esta solicitud. No es una cita confirmada.", "前台会查看这个请求。这不是已确认的预约。", "前台會查看這個請求。這不是已確認的預約。"),
        "service" to s("What would you like to discuss?", "¿Qué le gustaría comentar?", "您希望咨询什么？", "您希望諮詢什麼？"),
        "date" to s("Preferred day", "Día preferido", "方便的日期", "方便的日期"),
        "phone" to s("Phone", "Teléfono", "电话", "電話"),
        "email" to s("Email", "Correo", "邮箱", "電郵"),
        "contact_need" to s("Add a phone number or email so reception can reply.", "Añada un teléfono o un correo para que recepción responda.", "请留下电话或邮箱，方便前台回复。", "請留下電話或電郵，方便前台回覆。"),
        "other" to s("Something else", "Otra cosa", "其他", "其他"),
        "today" to s("Today", "Hoy", "今天", "今天"),
        "tomorrow" to s("Tomorrow", "Mañana", "明天", "明天"),
        "this_week" to s("This week", "Esta semana", "本周", "本週"),
        "about_orient" to s("First visit", "Primera visita", "第一次来", "第一次來"),
        "about_explain" to s("Treatment explanations", "Explicaciones", "治疗说明", "治療說明"),
        "about_faq" to s("Clinic questions", "Preguntas de la clínica", "诊所常见问题", "診所常見問題"),
        "about_oral" to s("Oral care", "Cuidado oral", "口腔护理", "口腔護理"),
        "not_advice" to s("This explains a usual process. It is not a recommendation for you.", "Esto explica un proceso habitual. No es una recomendación para usted.", "这里说明通常流程，不是对您个人的建议。", "這裡說明通常流程，不是對您個人的建議。"),
        "source" to s("Source", "Fuente", "来源", "來源"),
        "version" to s("Version", "Versión", "版本", "版本"),
        "reviewer" to s("Reviewer", "Revisor", "审阅", "審閱"),
        "video_placeholder" to s("A clinic video can be attached here. None is approved yet.", "Aquí puede ir un vídeo de la clínica. Aún no hay uno aprobado.", "这里可以播放诊所视频。目前还没有已审核的视频。", "這裡可以播放診所視頻。目前還沒有已審核的視頻。"),
        "faq_prompt" to s("Choose a topic, or ask a short question.", "Elija un tema o haga una pregunta breve.", "请选择一个主题，或提出一个简短问题。", "請選擇一個主題，或提出一個簡短問題。"),
        "no_answer" to s("I can only answer from the clinic’s approved guide, and I could not find that. I do not give personal dental advice.", "Solo respondo con la guía aprobada por la clínica y no encontré eso. No doy consejos dentales personales.", "我只能根据诊所已审核的内容回答，没有找到对应说明。我不会提供个人牙科建议。", "我只能根據診所已審核的內容回答，沒有找到對應說明。我不會提供個人牙科建議。"),
        "staff_help" to s("Ask reception", "Pedir ayuda en recepción", "请前台协助", "請前台協助"),
        "nervous" to s("I feel nervous", "Me siento nervioso", "我有些紧张", "我有些緊張"),
        "breathe" to s("A short pause", "Una pausa breve", "短暂停一下", "短暫停一下"),
        "breathe_in" to s("Breathe in", "Inspire", "吸气", "吸氣"),
        "breathe_out" to s("Breathe out", "Espire", "呼气", "呼氣"),
        "not_painless" to s("This is only a pause. It does not make a procedure painless.", "Esto es solo una pausa. No hace que un procedimiento sea indoloro.", "这只是停一下。它不能让治疗变得无痛。", "這只是停一下。它不能讓治療變得無痛。"),
        "notify_private" to s("Tell reception privately", "Avisar a recepción en privado", "私下通知前台", "私下通知前台"),
        "private_sent" to s("A private note is in the reception inbox. It will not be read out here.", "Hay una nota privada en la bandeja de recepción. No se leerá aquí.", "一条私下备注已在前台收件箱。不会在这里宣读。", "一條私下備註已在前台收件箱。不會在這裡宣讀。"),
        "kids" to s("For children", "Para niños", "给孩子", "給孩子"),
        "quiet" to s("Quiet", "Silencio", "安静", "安靜"),
        "brush_game" to s("Brushing order", "Orden del cepillado", "刷牙顺序", "刷牙順序"),
        "tools_game" to s("Meet the tools", "Conocer los instrumentos", "认识工具", "認識工具"),
        "story" to s("A short story", "Un cuento breve", "一个小故事", "一個小故事"),
        "brush_help" to s("Tap the steps in order. We do not ask for a child’s name.", "Toque los pasos en orden. No pedimos el nombre del niño.", "按顺序点选步骤。我们不会询问孩子的姓名。", "按順序點選步驟。我們不會詢問孩子的姓名。"),
        "good" to s("That is the order.", "Ese es el orden.", "顺序对了。", "順序對了。"),
        "again" to s("Not yet. Try the next step in the sequence.", "Todavía no. Pruebe el siguiente paso de la secuencia.", "还不是这一步。请按顺序再试。", "還不是這一步。請按順序再試。"),
        "directions_title" to s("Where should we go?", "¿Adónde vamos?", "要去哪里？", "要去哪裡？"),
        "escort" to s("Please follow me", "Sígame, por favor", "请跟我来", "請跟我來"),
        "stay" to s("Directions only", "Solo indicaciones", "只看说明", "只看說明"),
        "staff_needed" to s("A treatment room needs the team to confirm it is ready. I will not go in before that.", "Una sala de tratamiento necesita que el equipo confirme que está lista. No entraré antes.", "治疗室需要工作人员确认已准备好。在那之前我不会进去。", "治療室需要工作人員確認已準備好。在那之前我不會進去。"),
        "waiting_staff" to s("Waiting for the team to confirm the room.", "Esperando a que el equipo confirme la sala.", "正在等工作人员确认房间。", "正在等工作人員確認房間。"),
        "room_ready" to s("The team says the room is ready.", "El equipo dice que la sala está lista.", "工作人员说房间已准备好。", "工作人員說房間已準備好。"),
        "room_not" to s("The room is not ready. Please wait or contact reception.", "La sala no está lista. Espere o contacte a recepción.", "房间还没准备好。请稍候或联系前台。", "房間還沒準備好。請稍候或聯絡前台。"),
        "not_on_map" to s("This place is approved, but it is not on the robot map yet. Use the directions, or ask reception.", "Este lugar está aprobado, pero aún no está en el mapa del robot. Use las indicaciones o pregunte en recepción.", "这个地点已允许，但还没有标在机器人地图上。请看文字说明，或问前台。", "這個地點已允許，但還沒有標在機器人地圖上。請看文字說明，或問前台。"),
        "on_way" to s("On the way.", "En camino.", "正在前往。", "正在前往。"),
        "arrived_place" to s("We are here.", "Ya estamos.", "到了。", "到了。"),
        "nav_failed" to s("I could not get there. Please ask reception.", "No pude llegar. Pregunte en recepción.", "我无法到达。请问前台。", "我無法到達。請問前台。"),
        "reason_appt" to s("Appointment help", "Ayuda con la cita", "预约协助", "預約協助"),
        "reason_access" to s("Accessibility assistance", "Asistencia de accesibilidad", "无障碍协助", "無障礙協助"),
        "reason_unwell" to s("I feel unwell", "Me encuentro mal", "我感到不舒服", "我感到不舒服"),
        "reason_question" to s("Another question", "Otra pregunta", "其他问题", "其他問題"),
        "not_emergency" to s("This sends a message to the clinic team. It is not an emergency system. If you need urgent medical help, tell a person or call the local emergency number.", "Esto envía un mensaje al equipo. No es un sistema de urgencias. Si necesita ayuda médica urgente, dígaselo a una persona o llame al número de emergencias local.", "这会给诊所团队发一条消息。它不是急救系统。如果需要紧急医疗帮助，请告诉现场的人，或拨打当地急救电话。", "這會給診所團隊發一條消息。它不是急救系統。如果需要緊急醫療幫助，請告訴現場的人，或撥打當地急救電話。"),
        "ease" to s("How was the visit?", "¿Cómo fue la visita?", "这次就诊感觉如何？", "這次就診感覺如何？"),
        "ease_good" to s("Comfortable", "Cómoda", "轻松", "輕鬆"),
        "ease_ok" to s("Okay", "Normal", "还好", "還好"),
        "ease_hard" to s("Difficult", "Difícil", "不容易", "不容易"),
        "help_q" to s("Could you find the help you needed?", "¿Encontró la ayuda que necesitaba?", "您找到需要的帮助了吗？", "您找到需要的幫助了嗎？"),
        "yes" to s("Yes", "Sí", "是", "是"),
        "partly" to s("Partly", "En parte", "部分", "部分"),
        "no" to s("No", "No", "没有", "沒有"),
        "comment" to s("Anything the team should know?", "¿Algo que el equipo deba saber?", "还有什么要告诉团队？", "還有什麼要告訴團隊？"),
        "contact_me" to s("Please contact me", "Por favor, contácteme", "请联系我", "請聯絡我"),
        "feedback_private" to s("This goes to the clinic team. It is not shown in the waiting room.", "Esto va al equipo de la clínica. No se muestra en la sala de espera.", "这会交给诊所团队。不会显示在候诊区。", "這會交給診所團隊。不會顯示在候診區。"),
        "feedback_need" to s("Choose an answer, or ask the team to contact you.", "Elija una respuesta, o pida que el equipo le contacte.", "请选择一项，或留下联系方式。", "請選擇一項，或留下聯絡方式。"),
        "aftercare_pick" to s("Choose the instruction version", "Elija la versión de las indicaciones", "选择护理说明版本", "選擇護理說明版本"),
        "aftercare_patient" to s("After your visit", "Después de su visita", "就诊之后", "就診之後"),
        "takeaway" to s("Take a copy", "Llévese una copia", "带走一份", "帶走一份"),
        "qr_hint" to s("Scan this with your phone. It does not include your name.", "Escanéelo con su teléfono. No incluye su nombre.", "用手机扫描。其中没有您的姓名。", "用手機掃描。其中沒有您的姓名。"),
        "qr_offline" to s("The take-away page needs this robot to be connected. You can still read the instructions here.", "La página para llevar requiere que el robot esté conectado. Aún puede leer las instrucciones aquí.", "带走页面需要机器人已连接。您仍可以在这里阅读说明。", "帶走頁面需要機器人已連接。您仍可以在這裡閱讀說明。"),
        "show_patient" to s("Show to the patient", "Mostrar al paciente", "给患者看", "給患者看"),
        "paired" to s("Paired", "Vinculado", "已配对", "已配對"),
        "unpaired" to s("Not paired. Using the bundled sample clinic.", "Sin vincular. Se usa la clínica de ejemplo incluida.", "尚未配对。正在使用内置的示例诊所。", "尚未配對。正在使用內置的示例診所。"),
        "pair_hint" to s("Enter the 6-digit code from the dashboard.", "Escriba el código de 6 dígitos del panel.", "请输入仪表板中的 6 位配对码。", "請輸入儀表板中的 6 位配對碼。"),
        "kiosk" to s("Kiosk mode", "Modo quiosco", "自助模式", "自助模式"),
        "speed" to s("Speed", "Velocidad", "速度", "速度"),
        "slow" to s("Slow", "Lenta", "慢", "慢"),
        "medium" to s("Medium", "Media", "中", "中"),
        "fast" to s("Fast", "Rápida", "快", "快"),
        "go_home" to s("Back to the charger", "Volver al cargador", "返回充电座", "返回充電座"),
        "reload" to s("Reload clinic content", "Recargar contenido", "重新载入内容", "重新載入內容"),
        "unpair" to s("Unpair", "Desvincular", "取消配对", "取消配對"),
        "server" to s("Server address", "Dirección del servidor", "服务器地址", "伺服器地址"),
        "on" to s("On", "Sí", "开", "開"),
        "off" to s("Off", "No", "关", "關"),
        "listening" to s("Listening…", "Escuchando…", "正在听…", "正在聽…"),
        "page" to s("Page", "Página", "页", "頁"),
        "clinic_phone" to s("Clinic phone", "Teléfono de la clínica", "诊所电话", "診所電話"),
    )

    fun t(key: String): String {
        val i = LANGS.indexOf(lang).coerceAtLeast(0)
        return T[key]?.get(i) ?: key
    }
}
