# Carb Buddy LINE Bot 🍚💙
ผู้ช่วย AI สำหรับนักเรียนโรงเรียนเบาหวาน ช่วยสแกนภาพมื้ออาหาร ประเมินจำนวนคาร์บ (Carb Counting) และวิเคราะห์ผลเลือดเบื้องต้น 

## ฟีเจอร์หลัก
* 📸 สแกนภาพอาหารและแยกแยะเมนู
* 🔢 คำนวณคาร์โบไฮเดรต (1 ส่วน = 15 กรัม)
* 🩺 อ่านผลเลือดและผลสุขภาพที่เกี่ยวกับเบาหวาน (เช่น HbA1c)
* 🧠 ขับเคลื่อนด้วย Google Gemini 2.5 Flash และ LINE Messaging API

## การนำไปใช้งาน (Deployment)
จำเป็นต้องตั้งค่า Environment Variables ดังนี้:
* `LINE_ACCESS_TOKEN`
* `LINE_CHANNEL_SECRET`
* `GEMINI_API_KEY`
