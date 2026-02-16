import requests
import time

# ------------------- الإعدادات -------------------
BOT_TOKEN = "8319256664:AAEaXwZu9-cv4XQtypUaCmlP2dpvu-uXnR4"           # توكن البوت من BotFather

# متغير لتحديد آخر تحديث تمت معالجته
last_update_id = 0

print("✅ البوت يعمل وينتظر الرسائل... (سيرد على أي شخص يرسل S46441)")

while True:
    try:
        # جلب التحديثات باستخدام long polling (timeout 30 ثانية)
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/getUpdates"
        params = {
            "offset": last_update_id + 1,
            "timeout": 30,
            "allowed_updates": ["message"]
        }
        response = requests.get(url, params=params, timeout=35)
        data = response.json()

        if data.get("ok"):
            for update in data["result"]:
                last_update_id = update["update_id"]
                message = update.get("message")

                if message and message.get("text"):
                    chat_id = message["chat"]["id"]
                    text = message["text"]

                    # إذا كانت الرسالة هي "S46441" بالضبط، نرد على نفس الدردشة
                    if text == "S46441":
                        send_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
                        payload = {
                            "chat_id": chat_id,
                            "text": "sniper 46441"
                        }
                        requests.post(send_url, json=payload)

    except requests.exceptions.Timeout:
        # انتهت المهلة بشكل طبيعي (لا توجد رسائل جديدة)
        continue
    except Exception as e:
        # أي خطأ آخر (انقطاع الإنترنت، مشكلة في API، إلخ)
        print(f"⚠️ خطأ: {e} - إعادة المحاولة بعد 5 ثوان")
        time.sleep(5)
