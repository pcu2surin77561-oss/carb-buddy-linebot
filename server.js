// --- ไฟล์ server.js ---
// ระบบ Webhook สำหรับ LINE OA: โรงเรียนเบาหวาน
// วิเคราะห์ผลสุขภาพ + สแกนอาหาร AI + แสดงหน้าเว็บลงทะเบียน + คลังความรู้เบาหวาน

const express = require('express');
const { middleware, Client } = require('@line/bot-sdk');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const path = require('path');

// นำเข้าฟังก์ชันจาก sheetHelper.js
const { getPatientHealthReport, getRegisteredUser, registerNewUser, saveFoodLog } = require('./sheetHelper');

// =====================================
// 1. ตั้งค่า Keys และ Tokens
// =====================================
const config = {
    channelAccessToken: process.env.LINE_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
};
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const lineClient = new Client(config);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const app = express();

// =====================================
// 2. Thai Food Nutrition Database
// =====================================
const thaiFoodDB = {
    "ผัดกะเพรา": {kcal:580, carb:65, sugar:7, fat:24, sodium:1400},
    "ข้าวมันไก่": {kcal:700, carb:80, sugar:4, fat:28, sodium:1200},
    "ผัดไทย": {kcal:650, carb:85, sugar:18, fat:22, sodium:1100},
    "ส้มตำ": {kcal:120, carb:20, sugar:10, fat:2, sodium:900},
    "ต้มยำ": {kcal:90, carb:5, sugar:3, fat:4, sodium:700},
    "แกงเขียวหวาน": {kcal:450, carb:15, sugar:6, fat:32, sodium:950},
    "แกงแดง": {kcal:420, carb:12, sugar:6, fat:28, sodium:900},
    "ไข่เจียว": {kcal:300, carb:2, sugar:1, fat:25, sodium:500},
    "หมูทอด": {kcal:400, carb:5, sugar:2, fat:30, sodium:800},
    "ข้าวขาหมู": {kcal:750, carb:75, sugar:5, fat:40, sodium:1300},
    "ข้าวหมูแดง": {kcal:720, carb:85, sugar:15, fat:30, sodium:1100},
    "ข้าวหน้าเป็ด": {kcal:720, carb:80, sugar:12, fat:34, sodium:1100},
    "ผัดซีอิ๊ว": {kcal:680, carb:85, sugar:10, fat:24, sodium:1200},
    "ราดหน้า": {kcal:620, carb:80, sugar:8, fat:20, sodium:1100},
    "ข้าวผัด": {kcal:600, carb:75, sugar:5, fat:22, sodium:1000},
    "ผัดพริกแกง": {kcal:520, carb:60, sugar:5, fat:28, sodium:900},
    "ผัดผักรวม": {kcal:220, carb:15, sugar:4, fat:10, sodium:500},
    "ผัดคะน้าหมูกรอบ": {kcal:540, carb:20, sugar:4, fat:32, sodium:900},
    "ผัดถั่วงอก": {kcal:200, carb:10, sugar:3, fat:8, sodium:450},
    "ผัดวุ้นเส้น": {kcal:420, carb:55, sugar:6, fat:14, sodium:850},
    "ลาบหมู": {kcal:250, carb:10, sugar:2, fat:12, sodium:800},
    "น้ำตกหมู": {kcal:300, carb:12, sugar:2, fat:16, sodium:850},
    "ยำวุ้นเส้น": {kcal:350, carb:45, sugar:6, fat:12, sodium:900},
    "ยำมาม่า": {kcal:420, carb:55, sugar:7, fat:16, sodium:1100},
    "ยำหมูยอ": {kcal:280, carb:15, sugar:3, fat:12, sodium:800},
    "ยำทะเล": {kcal:300, carb:10, sugar:4, fat:10, sodium:900},
    "ยำไข่ดาว": {kcal:420, carb:10, sugar:4, fat:28, sodium:900},
    "ยำปลาดุกฟู": {kcal:480, carb:35, sugar:6, fat:26, sodium:950},
    "ยำถั่วพลู": {kcal:420, carb:25, sugar:5, fat:24, sodium:850},
    "พล่ากุ้ง": {kcal:300, carb:15, sugar:4, fat:12, sodium:850},
    "แกงจืดเต้าหู้": {kcal:120, carb:8, sugar:2, fat:4, sodium:600},
    "แกงจืดสาหร่าย": {kcal:100, carb:6, sugar:1, fat:3, sodium:550},
    "แกงเลียง": {kcal:150, carb:15, sugar:3, fat:4, sodium:600},
    "แกงส้ม": {kcal:200, carb:20, sugar:6, fat:5, sodium:850},
    "แกงป่า": {kcal:220, carb:12, sugar:3, fat:8, sodium:800},
    "แกงมัสมั่น": {kcal:600, carb:35, sugar:10, fat:38, sodium:900},
    "แกงพะแนง": {kcal:520, carb:20, sugar:8, fat:34, sodium:950},
    "แกงไตปลา": {kcal:300, carb:15, sugar:4, fat:12, sodium:1200},
    "แกงเห็ด": {kcal:150, carb:10, sugar:3, fat:5, sodium:600},
    "แกงหน่อไม้": {kcal:180, carb:15, sugar:3, fat:6, sodium:700},
    "ต้มจืดหมูสับ": {kcal:150, carb:5, sugar:2, fat:7, sodium:700},
    "ต้มโคล้ง": {kcal:180, carb:8, sugar:2, fat:8, sodium:850},
    "ต้มข่าไก่": {kcal:350, carb:15, sugar:4, fat:22, sodium:900},
    "ต้มเลือดหมู": {kcal:220, carb:5, sugar:2, fat:10, sodium:900},
    "ต้มจับฉ่าย": {kcal:200, carb:15, sugar:4, fat:8, sodium:900},
    "ต้มแซ่บ": {kcal:250, carb:10, sugar:3, fat:10, sodium:950},
    "ต้มยำกุ้ง": {kcal:200, carb:10, sugar:4, fat:6, sodium:900},
    "ต้มยำปลา": {kcal:180, carb:8, sugar:3, fat:5, sodium:850},
    "ต้มยำทะเล": {kcal:220, carb:10, sugar:4, fat:7, sodium:950},
    "ต้มจืดไข่น้ำ": {kcal:180, carb:5, sugar:2, fat:10, sodium:700},
    "ไก่ทอด": {kcal:480, carb:15, sugar:2, fat:32, sodium:900},
    "หมูแดดเดียว": {kcal:420, carb:10, sugar:3, fat:28, sodium:900},
    "เนื้อแดดเดียว": {kcal:430, carb:8, sugar:2, fat:26, sodium:850},
    "ไก่ย่าง": {kcal:400, carb:5, sugar:2, fat:24, sodium:850},
    "หมูย่าง": {kcal:420, carb:8, sugar:3, fat:26, sodium:850},
    "ปลาย่าง": {kcal:300, carb:0, sugar:1, fat:12, sodium:600},
    "ปลาทอด": {kcal:420, carb:10, sugar:1, fat:28, sodium:700},
    "ปลานึ่งมะนาว": {kcal:260, carb:5, sugar:3, fat:10, sodium:850},
    "ปลาราดพริก": {kcal:380, carb:25, sugar:12, fat:20, sodium:900},
    "ปลาสามรส": {kcal:450, carb:35, margin:18, fat:24, sodium:950},
    "ข้าวหมูทอด": {kcal:650, carb:70, sugar:3, fat:32, sodium:950},
    "ข้าวไก่ทอด": {kcal:680, carb:75, sugar:3, fat:34, sodium:1000},
    "ข้าวไข่เจียว": {kcal:550, carb:65, sugar:2, fat:26, sodium:800},
    "ข้าวผัดกุ้ง": {kcal:620, carb:75, sugar:5, fat:20, sodium:1000},
    "ข้าวผัดปู": {kcal:620, carb:75, sugar:4, fat:20, sodium:1000},
    "ข้าวผัดหมู": {kcal:650, carb:75, sugar:5, fat:22, sodium:1000},
    "ข้าวคลุกกะปิ": {kcal:650, carb:80, sugar:12, fat:20, sodium:1200},
    "ข้าวยำ": {kcal:350, carb:60, sugar:8, fat:10, sodium:700},
    "ข้าวต้มหมู": {kcal:250, carb:35, sugar:2, fat:6, sodium:700},
    "โจ๊กหมู": {kcal:300, carb:40, sugar:2, fat:8, sodium:700},
    "ก๋วยเตี๋ยวหมู": {kcal:350, carb:45, sugar:4, fat:10, sodium:900},
    "ก๋วยเตี๋ยวเนื้อ": {kcal:400, carb:45, sugar:4, fat:14, sodium:950},
    "ก๋วยเตี๋ยวไก่": {kcal:380, carb:45, sugar:4, fat:12, sodium:900},
    "ก๋วยเตี๋ยวเรือ": {kcal:450, carb:50, sugar:5, fat:16, sodium:1100},
    "ก๋วยเตี๋ยวต้มยำ": {kcal:420, carb:50, sugar:6, fat:14, sodium:1100},
    "ก๋วยเตี๋ยวเย็นตาโฟ": {kcal:420, carb:55, sugar:7, fat:14, sodium:1100},
    "บะหมี่หมูแดง": {kcal:450, carb:55, sugar:10, fat:16, sodium:1000},
    "บะหมี่เกี๊ยว": {kcal:420, carb:50, sugar:8, fat:14, sodium:950},
    "เส้นใหญ่ผัดซีอิ๊ว": {kcal:700, carb:85, sugar:10, fat:26, sodium:1200},
    "เส้นหมี่ผัด": {kcal:480, carb:65, sugar:7, fat:16, sodium:950},
    "ขนมจีนน้ำยา": {kcal:500, carb:65, sugar:5, fat:18, sodium:1000},
    "ขนมจีนน้ำเงี้ยว": {kcal:450, carb:60, sugar:6, fat:16, sodium:950},
    "ขนมจีนน้ำพริก": {kcal:420, carb:70, sugar:12, fat:14, sodium:900},
    "ขนมจีนน้ำยาใต้": {kcal:520, carb:65, sugar:5, fat:20, sodium:1100},
    "ขนมจีนน้ำยาป่า": {kcal:480, carb:60, sugar:4, fat:16, sodium:1000},
    "ขนมจีนน้ำยากะทิ": {kcal:550, carb:65, sugar:6, fat:24, sodium:1000},
    "ข้าวซอยไก่": {kcal:650, carb:70, sugar:7, fat:34, sodium:1100},
    "ข้าวซอยเนื้อ": {kcal:700, carb:70, sugar:7, fat:36, sodium:1100},
    "ข้าวซอยหมู": {kcal:680, carb:70, sugar:7, fat:35, sodium:1100},
    "ข้าวซอยทะเล": {kcal:620, carb:65, sugar:6, fat:30, sodium:1000},
    "ผัดหอยลาย": {kcal:300, carb:15, sugar:4, fat:12, sodium:900},
    "หอยทอด": {kcal:600, carb:55, sugar:3, fat:38, sodium:950},
    "ออส่วน": {kcal:520, carb:45, sugar:2, fat:32, sodium:900},
    "ปูผัดผงกะหรี่": {kcal:520, carb:25, sugar:6, fat:28, sodium:900},
    "กุ้งผัดพริกเกลือ": {kcal:420, carb:10, sugar:3, fat:22, sodium:800},
    "กุ้งอบวุ้นเส้น": {kcal:450, carb:50, sugar:5, fat:18, sodium:900},
    "หมึกผัดไข่เค็ม": {kcal:420, carb:15, sugar:3, fat:20, sodium:950},
    "ปลาหมึกผัดพริกเผา": {kcal:400, carb:20, sugar:7, fat:16, sodium:900},
    "ปลากะพงทอดน้ำปลา": {kcal:480, carb:10, sugar:2, fat:28, sodium:1000},
    "ปลากะพงนึ่งซีอิ๊ว": {kcal:320, carb:5, sugar:3, fat:12, sodium:900}
};

function detectThaiFoods(text) {
    let foundFoods = [];
    for (const food in thaiFoodDB) {
        if (text.includes(food)) {
            foundFoods.push(food);
        }
    }
    return foundFoods;
}

// =====================================
// 🔥 3. ฟังก์ชัน Auto-Discovery รุ่นของ AI
// =====================================
let availableGeminiModels = [];

async function discoverGeminiModels() {
    console.log("🔍 กำลังตรวจสอบรายชื่อโมเดล Gemini ที่ API Key ของคุณรองรับ...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        const data = await response.json();

        if (data.error) {
            console.error("❌ API Key Error:", data.error.message);
            return;
        }

        if (data.models) {
            availableGeminiModels = data.models
                .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name.replace('models/', ''));
            
            console.log("✅ โมเดลที่พร้อมใช้งาน:", availableGeminiModels.join(', '));
        }
    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาดในการตรวจสอบโมเดล:", error.message);
    }
}
discoverGeminiModels();

// =====================================
// 🔥 4. ฟังก์ชัน AI แบบฉลาด (สลับรุ่นอัตโนมัติจากรุ่นที่มีอยู่)
// =====================================
async function callGeminiWithFallback(prompt, imageParts = []) {
    let modelsToTry = availableGeminiModels.length > 0 
        ? [...availableGeminiModels] 
        : ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro-vision", "gemini-pro"];

    if (imageParts.length > 0) {
        modelsToTry = modelsToTry.filter(m => 
            m.includes('flash') || m.includes('vision') || m === 'gemini-1.5-pro'
        );
    }

    const priority = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro-vision", "gemini-pro"];
    modelsToTry.sort((a, b) => {
        let indexA = priority.findIndex(p => a.includes(p));
        let indexB = priority.findIndex(p => b.includes(p));
        indexA = indexA === -1 ? 99 : indexA;
        indexB = indexB === -1 ? 99 : indexB;
        return indexA - indexB;
    });

    if (modelsToTry.length === 0) {
        modelsToTry = ["gemini-pro"];
    }

    const safetySettings = [
        {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        }
    ];

    let lastError;

    for (const modelName of modelsToTry) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName, safetySettings });
            const requestContent = imageParts.length > 0 ? [prompt, ...imageParts] : prompt;
            const result = await model.generateContent(requestContent);
            console.log(`✅ ประมวลผลสำเร็จด้วยโมเดล: ${modelName}`);
            return result.response.text(); 
        } catch (error) {
            console.warn(`⚠️ โมเดล ${modelName} ไม่พร้อมใช้งาน: ${error.message} (กำลังสลับโมเดลถัดไป...)`);
            lastError = error;
        }
    }

    throw new Error(`ไม่สามารถเชื่อมต่อ AI ได้เลย ล่าสุด Error: ${lastError.message}`);
}

// =====================================
// 5. Route สำหรับแสดงหน้าเว็บลงทะเบียน (index.html)
// =====================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// =====================================
// 🌟 6. Route สำหรับ UptimeRobot / Cron-job เอาไว้ปลุกเซิร์ฟเวอร์
// =====================================
app.get('/ping', (req, res) => {
    res.status(200).send("Carb Buddy LINE Bot is awake and running!");
});

// =====================================
// 7. Endpoint /webhook สำหรับ LINE
// =====================================
app.post('/webhook', middleware(config), (req, res) => {
    res.status(200).send('OK');

    Promise
        .all(req.body.events.map(handleEvent))
        .catch((err) => {
            console.error("เกิดข้อผิดพลาดในการรัน Background Event:", err);
        });
});

// =====================================
// 8. ตั้งค่า Middleware ให้อ่าน JSON ได้ (สำหรับ API ของ LIFF)
// =====================================
app.use(express.json());

// =====================================
// 9. API สำหรับรับข้อมูลลงทะเบียนจาก LIFF (แบบปลอดภัย)
// =====================================
app.post('/api/register', async (req, res) => {
    try {
        const {
            userId, cid, birthday, gender, weight, height, 
            activityMultiplier, dietMultiplier, carbPerMeal
        } = req.body;

        if (!userId || !cid) {
            return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
        }

        const result = await registerNewUser(
            userId, cid, birthday, gender, weight, height, 
            activityMultiplier, dietMultiplier, carbPerMeal
        );

        if (result === "success") {
            await lineClient.pushMessage(userId, { type: 'text', text: `✅ ลงทะเบียนสำเร็จ!\n\n📌 แนะนำให้ทานคาร์บมื้อละ: ${carbPerMeal} คาร์บ\n(พิมพ์ "ดูสมุดพก" เพื่อดูผลการวิเคราะห์เต็มรูปแบบครับ)` });
        } else if (result === "updated") {
            await lineClient.pushMessage(userId, { type: 'text', text: `🔄 อัปเดตข้อมูลสุขภาพสำเร็จ!\n\n📌 โควตาคาร์บใหม่ของคุณคือ: ${carbPerMeal} คาร์บ/มื้อ\n(คาร์บ 1 ส่วน = ข้าวสวย 1 ทัพพี) 🍚` });
        }

        res.json({ status: "ok", result: result });
    } catch (error) {
        console.error("Register API Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
});

// =====================================
// 10. API สำหรับดึงข้อมูลเก่าไปโชว์ที่หน้าเว็บ LIFF (index.html)
// =====================================
app.get('/api/getUser', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    
    const userInfo = await getRegisteredUser(userId);
    if (userInfo) {
        res.json(userInfo); 
    } else {
        res.status(404).json({ error: "User not found" });
    }
});

// =====================================
// 11. ฟังก์ชันจัดการ Event ของ LINE
// =====================================
async function handleEvent(event) {
    // 🌟 ดักรับทั้ง message และ postback
    if (event.type !== 'message' && event.type !== 'postback') return Promise.resolve(null);
    const userId = event.source.userId;

    // -----------------------------------------
    // 🌟 11.1 จัดการ Postback (เมื่อผู้ใช้กดปุ่ม Quick Reply)
    // -----------------------------------------
    if (event.type === 'postback') {
        const data = new URLSearchParams(event.postback.data);
        
        if (data.get('action') === 'logfood') {
            const userInfo = await getRegisteredUser(userId);
            if (!userInfo) {
                return lineClient.pushMessage(userId, { type: 'text', text: '⚠️ กรุณาลงทะเบียนก่อนบันทึกอาหารนะครับ' });
            }

            const portion = parseFloat(data.get('p'));
            const estimatedCarb = parseFloat(data.get('c'));
            const actualCarb = parseFloat((estimatedCarb * portion).toFixed(1));
            
            // ✅ ดึงค่าชื่ออาหารจาก Payload 
            const foodName = data.get('f') || 'AI_Analyzed';
            
            const now = new Date();
            const dateStr = now.toLocaleDateString('th-TH', {timeZone: 'Asia/Bangkok'});
            const timeStr = now.toLocaleTimeString('th-TH', {timeZone: 'Asia/Bangkok'});

            let statusStr = "ไม่ได้กิน";
            if(portion === 1) statusStr = "กินหมด";
            if(portion > 0 && portion < 1) statusStr = "กินบางส่วน";

            // บันทึกลง Google Sheet (ส่ง image: '-' ไปเลย)
            await saveFoodLog({
                date: dateStr,
                time: timeStr,
                userId: userId,
                cid: userInfo.cid,
                food: foodName, 
                carb: estimatedCarb,
                portion: portion,
                actual_carb: actualCarb,
                status: statusStr,
                image: '-', // ❌ ไม่เก็บรูปภาพแล้ว
                note: 'บันทึกผ่าน Quick Reply'
            });

            // ตอบกลับผู้ใช้งาน
            if (portion === 0) {
                return lineClient.pushMessage(userId, { type: 'text', text: `❌ ยกเลิกการบันทึกอาหารมื้อนี้ครับ (ถ่ายเฉยๆไม่ได้ทาน)` });
            } else {
                return lineClient.pushMessage(userId, { 
                    type: 'text', 
                    text: `✅ บันทึกอาหารสำเร็จ!\n\n📊 มื้อนี้คุณได้รับคาร์บไป: ${actualCarb} ทัพพี\n🎯 (โควตาของคุณคือ: ${userInfo.carbPerMeal} ทัพพี/มื้อ)\nพยายามคุมให้อยู่ในเกณฑ์นะครับ สู้ๆ ✌️` 
                });
            }
        }
        return Promise.resolve(null);
    }

    // -----------------------------------------
    // 11.2 จัดการข้อความ (Text)
    // -----------------------------------------
    if (event.message.type === 'text') {
        const text = event.message.text;

        if (text.startsWith('ลงทะเบียน ')) {
            const parts = text.split(' ');
            if (parts.length < 9) {
                return lineClient.pushMessage(userId, { type: 'text', text: '⚠️ ข้อมูลไม่ครบถ้วน แนะนำให้ทำรายการผ่านเมนูลงทะเบียนครับ' });
            }
            const result = await registerNewUser(
                userId, parts[1].trim(), parts[2].trim(), parts[3].trim(), 
                parts[4].trim(), parts[5].trim(), parts[6].trim(), parts[7].trim(), parts[8].trim()
            );
            
            if (result === "success") {
                return lineClient.pushMessage(userId, { type: 'text', text: `✅ ลงทะเบียนสำเร็จ!\nระบบได้ประเมินสุขภาพและโควตาอาหารให้คุณเรียบร้อยแล้ว\n\n📌 แนะนำให้ทานคาร์บมื้อละ: ${parts[8].trim()} คาร์บ\n(พิมพ์ "ดูสมุดพก" เพื่อดูผลการวิเคราะห์เต็มรูปแบบครับ)` });
            } else if (result === "updated") {
                return lineClient.pushMessage(userId, { type: 'text', text: `🔄 อัปเดตข้อมูลสุขภาพสำเร็จ!\n\n📌 โควตาคาร์บใหม่ของคุณคือ: ${parts[8].trim()} คาร์บ/มื้อ\n(คาร์บ 1 ส่วน = ข้าวสวย 1 ทัพพี) 🍚` });
            } else {
                return lineClient.pushMessage(userId, { type: 'text', text: '🛠️ เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่ภายหลัง' });
            }
        }

        if (text === 'อ่านผลสุขภาพ / ผลแลป') {
            return lineClient.pushMessage(userId, { type: 'text', text: '📄 โปรดถ่ายรูปใบรายงานผลตรวจเลือด ส่งมาที่นี่ได้เลยครับ/ค่ะ ผู้ช่วย AI จะช่วยแปลผลให้เข้าใจง่ายๆ ครับ 🩺' });
        }

        if (text === 'สแกนอาหารด้วย AI') {
            return lineClient.pushMessage(userId, { type: 'text', text: '📸 กรุณาส่งรูปภาพมื้ออาหารที่ชัดเจนมาได้เลยครับ/ค่ะ AI จะช่วยประเมินการนับคาร์บ (Carb Counting) และผลกระทบต่อน้ำตาลในเลือดให้ครับ 🍲' });
        }

        if (text === 'คลังความรู้เบาหวาน') {
            const lessonFlex = {
              type: "flex",
              altText: "คลังความรู้โรคเบาหวาน 6 บทเรียน",
              contents: {
                "type": "carousel",
                "contents": [
                  {
                    "type": "bubble", "size": "mega",
                    "header": { "type": "box", "layout": "vertical", "backgroundColor": "#E04855", "paddingAll": "lg", "contents": [{ "type": "text", "text": "บทเรียนที่ 1", "color": "#ffffff", "size": "sm", "weight": "bold" }, { "type": "text", "text": "🩸 เบาหวานคืออะไร?", "color": "#ffffff", "size": "xl", "weight": "bold", "margin": "sm" }] },
                    "body": { "type": "box", "layout": "vertical", "paddingAll": "lg", "contents": [{ "type": "text", "text": "ภาวะที่ร่างกายมี \"น้ำตาลในเลือดสูง\" เพราะผลิตอินซูลินไม่พอ หรือดื้ออินซูลิน ทำให้น้ำตาลตกค้าง", "wrap": true, "size": "sm", "color": "#333333" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": "🚨 3 สัญญาณเตือน", "weight": "bold", "size": "md", "margin": "md", "color": "#E04855" }, { "type": "text", "text": "1. ปัสสาวะบ่อย หิวน้ำบ่อย\n2. อ่อนเพลีย น้ำหนักลด\n3. แผลหายช้า ชาปลายมือเท้า", "size": "sm", "wrap": true, "margin": "sm" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": "📊 เกณฑ์การวินิจฉัย", "weight": "bold", "size": "md", "margin": "md", "color": "#007BFF" }, { "type": "text", "text": "• น้ำตาลอดอาหาร (FBS) ≥ 126\n• น้ำตาลสะสม (HbA1c) ≥ 6.5%", "wrap": true, "size": "sm", "margin": "sm" }] }
                  },
                  {
                    "type": "bubble", "size": "mega",
                    "header": { "type": "box", "layout": "vertical", "backgroundColor": "#28A745", "paddingAll": "lg", "contents": [{ "type": "text", "text": "บทเรียนที่ 2", "color": "#ffffff", "size": "sm", "weight": "bold" }, { "type": "text", "text": "🍚 การนับคาร์บ", "color": "#ffffff", "size": "xl", "weight": "bold", "margin": "sm" }] },
                    "body": { "type": "box", "layout": "vertical", "paddingAll": "lg", "contents": [{ "type": "text", "text": "\"คาร์บ\" คือหมวด ข้าว แป้ง น้ำตาล ผลไม้ ที่กินแล้วเปลี่ยนเป็นน้ำตาล", "wrap": true, "size": "sm", "color": "#333333" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": "💡 1 คาร์บ = 15 กรัม", "weight": "bold", "size": "md", "margin": "md", "color": "#28A745" }, { "type": "text", "text": "• หญิง: 3-4 คาร์บ / มื้อ\n• ชาย: 4-5 คาร์บ / มื้อ", "size": "sm", "wrap": true, "margin": "sm" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": "🍱 เทียบปริมาณ \"1 คาร์บ\"", "weight": "bold", "size": "md", "margin": "md", "color": "#E67E22" }, { "type": "text", "text": "✅ ข้าวสวย 1 ทัพพี\n✅ ข้าวเหนียว ครึ่ง ทัพพี\n✅ ขนมปัง 1 แผ่น\n✅ กล้วยน้ำว้า 1 ผล", "wrap": true, "size": "sm", "margin": "sm" }, { "type": "text", "text": "*แนะนำทานข้าวกล้อง กากใยสูง ช่วยชะลอน้ำตาลได้ดีกว่า*", "wrap": true, "size": "xs", "color": "#888888", "margin": "md" }] }
                  },
                  {
                    "type": "bubble", "size": "mega",
                    "header": { "type": "box", "layout": "vertical", "backgroundColor": "#FD7E14", "paddingAll": "lg", "contents": [{ "type": "text", "text": "บทเรียนที่ 3", "color": "#ffffff", "size": "sm", "weight": "bold" }, { "type": "text", "text": "🏃‍♂️ ขยับกายสลายน้ำตาล", "color": "#ffffff", "size": "xl", "weight": "bold", "margin": "sm" }] },
                    "body": { "type": "box", "layout": "vertical", "paddingAll": "lg", "contents": [{ "type": "text", "text": "การออกกำลังกายช่วยลดภาวะดื้ออินซูลิน ทำให้ร่างกายดึงน้ำตาลไปใช้ได้ดีขึ้น", "wrap": true, "size": "sm", "color": "#333333" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": "⏱️ คำแนะนำ", "weight": "bold", "size": "md", "margin": "md", "color": "#FD7E14" }, { "type": "text", "text": "ออกกำลังกายระดับปานกลาง อย่างน้อย 150 นาที/สัปดาห์ (วันละ 30 นาที 5 วัน/สัปดาห์)", "wrap": true, "size": "sm", "margin": "sm" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": "⚠️ ข้อควรระวัง", "weight": "bold", "size": "md", "margin": "md", "color": "#E04855" }, { "type": "text", "text": "• สวมรองเท้าหุ้มส้นเสมอ\n• พกลูกอมติดตัวเผื่อน้ำตาลตก\n• งดออกกำลังกายหากมีแผลที่เท้า", "wrap": true, "size": "sm", "margin": "sm" }] }
                  },
                  {
                    "type": "bubble", "size": "mega",
                    "header": { "type": "box", "layout": "vertical", "backgroundColor": "#17A2B8", "paddingAll": "lg", "contents": [{ "type": "text", "text": "บทเรียนที่ 4", "color": "#ffffff", "size": "sm", "weight": "bold" }, { "type": "text", "text": "🦶 การดูแลเท้า", "color": "#ffffff", "size": "xl", "weight": "bold", "margin": "sm" }] },
                    "body": { "type": "box", "layout": "vertical", "paddingAll": "lg", "contents": [{ "type": "text", "text": "ผู้ป่วยเบาหวานมักมีอาการชาปลายเท้า ทำให้เกิดแผลได้ง่ายโดยไม่รู้ตัว", "wrap": true, "size": "sm", "color": "#333333" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": "✨ วิธีดูแลเท้าทุกวัน", "weight": "bold", "size": "sm", "margin": "md", "color": "#17A2B8" }, { "type": "text", "text": "1. สำรวจรอยแตก บวม แดง\n2. ล้างเท้าด้วยสบู่อ่อน เช็ดให้แห้ง\n3. ทาโลชั่น (เว้นซอกนิ้ว)\n4. ตัดเล็บตรง ไม่สั้นเกินไป", "wrap": true, "size": "sm" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": "👟 การเลือกรองเท้า", "weight": "bold", "size": "sm", "margin": "md", "color": "#17A2B8" }, { "type": "text", "text": "ใส่รองเท้าหุ้มส้นที่พอดี สวมถุงเท้า ห้ามเดินเท้าเปล่าเด็ดขาด", "wrap": true, "size": "sm" }] }
                  },
                  {
                    "type": "bubble", "size": "mega",
                    "header": { "type": "box", "layout": "vertical", "backgroundColor": "#6610F2", "paddingAll": "lg", "contents": [{ "type": "text", "text": "บทเรียนที่ 5", "color": "#ffffff", "size": "sm", "weight": "bold" }, { "type": "text", "text": "💊 ยาและน้ำตาลตก", "color": "#ffffff", "size": "xl", "weight": "bold", "margin": "sm" }] },
                    "body": { "type": "box", "layout": "vertical", "paddingAll": "lg", "contents": [{ "type": "text", "text": "กินยาและฉีดยาตามแพทย์สั่ง ห้ามปรับยาหรือหยุดยาเอง", "wrap": true, "size": "sm", "color": "#333333" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": "😨 ภาวะน้ำตาลต่ำ", "weight": "bold", "size": "sm", "margin": "md", "color": "#6610F2" }, { "type": "text", "text": "อาการ: ใจสั่น เหงื่อออก หน้ามืด หิวจัด มือสั่น กระวนกระวาย", "wrap": true, "size": "sm" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": "🍬 กฎ 15-15 แก้น้ำตาลตก", "weight": "bold", "size": "sm", "margin": "md", "color": "#E67E22" }, { "type": "text", "text": "1. กินคาร์บ 15g (ลูกอม 3 เม็ด หรือน้ำหวานครึ่งแก้ว)\n2. รอ 15 นาที อาการควรดีขึ้น\n3. ถ้าไม่ดีขึ้นให้ทำซ้ำข้อ 1 แล้วไปหาหมอ", "wrap": true, "size": "sm" }] }
                  },
                  {
                    "type": "bubble", "size": "mega",
                    "header": { "type": "box", "layout": "vertical", "backgroundColor": "#6C757D", "paddingAll": "lg", "contents": [{ "type": "text", "text": "บทเรียนที่ 6", "color": "#ffffff", "size": "sm", "weight": "bold" }, { "type": "text", "text": "🛡️ ป้องกันไตเสื่อม", "color": "#ffffff", "size": "xl", "weight": "bold", "margin": "sm" }] },
                    "body": { "type": "box", "layout": "vertical", "paddingAll": "lg", "contents": [{ "type": "text", "text": "เบาหวานลงไต ป้องกันได้! ยืดอายุการทำงานของไตง่ายๆ", "wrap": true, "size": "sm", "color": "#333333" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": "1️⃣ คุมคู่อันตราย", "weight": "bold", "size": "sm", "margin": "md", "color": "#6C757D" }, { "type": "text", "text": "น้ำตาลสะสม (HbA1c < 7%) และความดัน (< 130/80)", "wrap": true, "size": "sm" }, { "type": "text", "text": "2️⃣ ลดเค็ม ยืดอายุไต", "weight": "bold", "size": "sm", "margin": "md", "color": "#6C757D" }, { "type": "text", "text": "โซเดียมไม่เกิน 2,000 มก./วัน งดซดน้ำซุป", "wrap": true, "size": "sm" }, { "type": "text", "text": "3️⃣ ระวังการใช้ยา", "weight": "bold", "size": "sm", "margin": "md", "color": "#6C757D" }, { "type": "text", "text": "เลี่ยงยาแก้ปวดกระดูก (NSAIDs) และยาสมุนไพร", "wrap": true, "size": "sm" }, { "type": "text", "text": "4️⃣ ตรวจเช็กค่าไต (eGFR)", "weight": "bold", "size": "sm", "margin": "md", "color": "#6C757D" }, { "type": "text", "text": "ตรวจเลือดและปัสสาวะอย่างสม่ำเสมอ", "wrap": true, "size": "sm" }] }
                  }
                ]
              }
            };
            return lineClient.pushMessage(userId, lessonFlex);
        }

        if (text === 'ดูสมุดพก') {
            const userInfo = await getRegisteredUser(userId);

            if (!userInfo) {
                return lineClient.pushMessage(userId, { type: 'text', text: '🔒 คุณยังไม่ได้ลงทะเบียนครับ กรุณากดปุ่ม "ลงทะเบียน" จากเมนูด้านล่างก่อนนะครับ' });
            }

            await lineClient.pushMessage(userId, { type: 'text', text: '⏳ ระบบกำลังตรวจสอบข้อมูลผลแล็บ และวิเคราะห์โควตาอาหารของคุณ กรุณารอสักครู่นะครับ...' });

            try {
                const healthData = await getPatientHealthReport(userInfo.cid, userInfo.birthday);

                let age = 0;
                let birthYearMatch = userInfo.birthday.match(/\d{4}/);
                if (birthYearMatch) {
                    let birthYear = parseInt(birthYearMatch[0]);
                    if (birthYear > 2400) birthYear -= 543;
                    age = new Date().getFullYear() - birthYear;
                }

                const w = parseFloat(userInfo.weight) || 60;
                const h = parseFloat(userInfo.height) || 160;
                const act = parseFloat(userInfo.activity) || 1.2;
                const diet = parseFloat(userInfo.dietType) || 0.5;

                let bmr = (userInfo.gender === 'ชาย') 
                    ? 66 + (13.7 * w) + (5 * h) - (6.8 * age) 
                    : 665 + (9.6 * w) + (1.8 * h) - (4.7 * age);
                
                let tdee = bmr * act;
                let targetKcal = tdee;
                let deficitText = "รักษาระดับพลังงานเพื่อสุขภาพที่สมดุล";
                let showDeficit = false;
                
                if (diet <= 0.2) { 
                    targetKcal = tdee - 500;
                    if (targetKcal < 1200) targetKcal = 1200; 
                    deficitText = "ลดพลังงานลง 500 กิโลแคลอรี เพื่อช่วยลดน้ำหนัก";
                    showDeficit = true;
                }

                let dailyCarbGrams = (targetKcal * diet) / 4;
                let dailyCarbExchange = dailyCarbGrams / 15;
                let carbPerMeal = Math.round(dailyCarbExchange / 3);
                if (carbPerMeal < 1) carbPerMeal = 1;

                const labSummary = healthData ? healthData.labTextSummary : "ไม่มีข้อมูลผลแล็บในระบบ\n(อาจยังไม่ได้ตรวจ หรือเจ้าหน้าที่ยังไม่ได้บันทึกข้อมูล)";
                const patientName = healthData ? healthData.patientInfo.name : "นักเรียน (ไม่ระบุชื่อ)";
                const patientDate = healthData ? healthData.patientInfo.date : "-";

                const prompt = `
                  คุณคือ "หมอ/ผู้ช่วย AI โรงเรียนเบาหวาน" ผู้เชี่ยวชาญด้านเบาหวานและโภชนาการ
                  ชื่อคนไข้: ${patientName}
                  
                  เป้าหมายโภชนาการที่ระบบคำนวณไว้: ทานคาร์บไม่เกินมื้อละ ${carbPerMeal} คาร์บ (1 คาร์บ = ข้าว 1 ทัพพี)
                  
                  ผลการตรวจเลือดล่าสุด:
                  ${labSummary}
                  
                  คำสั่ง: กรุณาสรุปข้อมูลและแบ่งเป็น 2 ส่วน
                  1. 🩺 สรุปผลสุขภาพ: อธิบายค่าผลแล็บที่สำคัญแบบเข้าใจง่าย ค่าไหนดี ค่าไหนต้องระวัง (ถ้าไม่มีผลแล็บ ให้ข้ามส่วนนี้ไป)
                  2. 💡 คำแนะนำโภชนาการ: แนะนำวิธีกินให้ตรงกับเป้าหมาย "ทานมื้อละ ${carbPerMeal} คาร์บ" ให้เป็นรูปธรรม
                  ตอบให้กระชับ เป็นมิตร ให้กำลังใจ และใช้ Emoji ประกอบให้อ่านง่าย
                `;

                const aiAnalysis = await callGeminiWithFallback(prompt);

                const flexMessage = {
                  type: "flex",
                  altText: "สมุดพกสุขภาพและเป้าหมายอาหารของคุณ",
                  contents: {
                    "type": "bubble",
                    "size": "giga",
                    "header": {
                      "type": "box", "layout": "vertical", "backgroundColor": "#00897B", "paddingAll": "20px",
                      "contents": [
                        { "type": "text", "text": "📘 สมุดพกและเป้าหมายสุขภาพ", "weight": "bold", "color": "#ffffff", "size": "xl" },
                        { "type": "text", "text": `ชื่อ: ${patientName}`, "color": "#e0f2f1", "size": "sm", "margin": "md" }
                      ]
                    },
                    "body": {
                      "type": "box", "layout": "vertical", "paddingAll": "20px",
                      "contents": [
                        {
                          "type": "box", "layout": "vertical", "margin": "md",
                          "contents": [
                            { "type": "box", "layout": "baseline", "contents": [
                                { "type": "text", "text": "BMR (kcal):", "color": "#17202A", "size": "sm", "flex": 2 },
                                { "type": "text", "text": `${Math.round(bmr).toLocaleString()}`, "color": "#D35400", "size": "sm", "weight": "bold", "flex": 1 }
                            ]},
                            { "type": "box", "layout": "baseline", "margin": "md", "contents": [
                                { "type": "text", "text": "พลังงานที่ใช้/วัน (TDEE):", "color": "#17202A", "size": "sm", "flex": 2 },
                                { "type": "text", "text": `${Math.round(tdee).toLocaleString()}`, "color": "#D35400", "size": "sm", "weight": "bold", "flex": 1 }
                            ]}
                          ],
                          "backgroundColor": "#F4F6F6", "paddingAll": "15px", "cornerRadius": "8px"
                        },
                        {
                          "type": "box", "layout": "vertical", "margin": "lg",
                          "contents": [
                            { "type": "text", "text": `พลังงานที่ควรได้รับ(กิโลแคลอรี/วัน): ${Math.round(targetKcal).toLocaleString()}`, "color": "#0000FF", "size": "md", "weight": "bold" },
                            { "type": "text", "text": showDeficit ? deficitText : " ", "color": "#FF0000", "size": "xs", "margin": "sm", "wrap": true },
                            { "type": "separator", "margin": "md", "color": "#0000FF" },
                            { "type": "text", "text": `ปริมาณคาร์บที่แนะนำต่อวัน: ${dailyCarbExchange.toFixed(1)}`, "color": "#0000FF", "size": "md", "weight": "bold", "margin": "md" },
                            { "type": "text", "text": "รวมคาร์บจากทุกประเภท ทั้งกลุ่มข้าวแป้ง ผัก ผลไม้ และนม", "color": "#FF0000", "size": "xs", "margin": "sm", "wrap": true },
                            { "type": "separator", "margin": "md", "color": "#FF0000" }
                          ]
                        },
                        {
                          "type": "box", "layout": "vertical", "margin": "lg",
                          "contents": [
                            { "type": "text", "text": "🎯 เป้าหมายโควตาอาหารของคุณ", "weight": "bold", "color": "#D35400", "size": "sm" },
                            { "type": "text", "text": `ทานได้ไม่เกิน: ${carbPerMeal} คาร์บ / มื้อ`, "size": "xl", "weight": "bold", "color": "#333333", "margin": "md" },
                            { "type": "text", "text": `(เทียบเท่า ข้าวสวย/แป้ง มื้อละ ${carbPerMeal} ทัพพี)`, "size": "sm", "color": "#666666", "wrap": true, "margin": "sm" }
                          ],
                          "backgroundColor": "#FDEBD0", "paddingAll": "20px", "cornerRadius": "10px"
                        },
                        { "type": "separator", "margin": "xl" },
                        {
                          "type": "box", "layout": "vertical", "margin": "lg",
                          "contents": [
                            { "type": "text", "text": "💡 วิเคราะห์ผลและคำแนะนำจาก AI:", "weight": "bold", "color": "#00897B", "size": "sm" },
                            { "type": "text", "text": `อัปเดตแล็บล่าสุด: ${patientDate}`, "size": "xxs", "color": "#aaaaaa", "margin": "sm" },
                            { "type": "text", "text": aiAnalysis, "wrap": true, "size": "sm", "margin": "md" }
                          ],
                          "backgroundColor": "#f4fcf8", "paddingAll": "15px", "cornerRadius": "10px"
                        }
                      ]
                    }
                  }
                };

                return lineClient.pushMessage(userId, flexMessage);

            } catch (error) {
                console.error("Error generating health report:", error);
                return lineClient.pushMessage(userId, { type: 'text', text: 'ขออภัยครับ เกิดข้อผิดพลาดในการดึงข้อมูลสมุดพก 🙏' });
            }
        }

        return Promise.resolve(null);
    }

    // -----------------------------------------
    // 9.2 จัดการรูปภาพ (Image Analysis)
    // -----------------------------------------
    if (event.message.type === 'image') {
        try {
            await lineClient.pushMessage(userId, { type: 'text', text: '⏳ ได้รับรูปภาพแล้วครับ กำลังให้ AI ช่วยวิเคราะห์ข้อมูลให้ กรุณารอสักครู่นะครับ...' });

            const stream = await lineClient.getMessageContent(event.message.id);
            const chunks = [];
            for await (const chunk of stream) { chunks.push(chunk); }
            const buffer = Buffer.concat(chunks);
            const base64Image = buffer.toString('base64');
            
            const userInfo = await getRegisteredUser(userId);
            let userCarbContext = "";
            if (userInfo && userInfo.carbPerMeal) {
                userCarbContext = `ข้อมูลเพิ่มเติม: นักเรียนท่านนี้มีโควตาคาร์บจำกัดอยู่ที่ "มื้อละ ${userInfo.carbPerMeal} คาร์บ" โปรดแนะนำเพิ่มเติมว่าอาหารในภาพนี้เกินโควตาหรือไม่`;
            }

            // 🌟 บังคับให้ AI เพิ่ม [TOTAL_CARB: x] เพื่อนำไปสร้างปุ่ม
            const prompt = `
                คุณคือ "ผู้ช่วย AI โรงเรียนเบาหวาน" ผู้เชี่ยวชาญด้านโภชนาการ
                หากเป็นภาพผลตรวจสุขภาพ: สรุปค่าที่สำคัญ(โดยเฉพาะเบาหวาน), บอกว่าปกติหรือไม่, ให้คำแนะนำ
                หากเป็นภาพอาหาร: 1. ระบุชื่ออาหาร 2. ประเมินปริมาณ (ทัพพี) 3. ประเมินจำนวนคาร์บ (1 คาร์บ = 15g) แยกเป็นส่วนๆ 4. ประเมินผลต่อน้ำตาลในเลือด
                ${userCarbContext}
                ตอบให้กระชับ เป็นมิตร ให้กำลังใจ
                รูปแบบตอบกลับอาหาร:
                🍲 เมนูที่พบ:
                🍚 ปริมาณที่ประเมินได้:
                🔢 จำนวนคาร์บโดยประมาณ:
                📈 ผลกระทบต่อน้ำตาลในเลือด:
                💡 คำแนะนำสำหรับนักเรียนเบาหวาน:

                **สำคัญมาก** หากเป็นภาพอาหาร ให้เพิ่มบรรทัดสุดท้ายของคำตอบเป็นตัวเลขคาร์บรวมในรูปแบบนี้เป๊ะๆ:
                [TOTAL_CARB: ตัวเลข]
                เช่น [TOTAL_CARB: 3.5]
            `;

            const imageParts = [{ inlineData: { data: base64Image, mimeType: "image/jpeg" } }];
            const text = await callGeminiWithFallback(prompt, imageParts);

            let finalText = text;
            let estimatedCarb = 0;

            const carbMatch = text.match(/\[TOTAL_CARB:\s*([0-9.]+)\]/i);
            if (carbMatch) {
                estimatedCarb = parseFloat(carbMatch[1]);
                finalText = finalText.replace(/\[TOTAL_CARB:\s*[0-9.]+\]/gi, '').trim();
            }

            const detectedFoods = detectThaiFoods(text);
            // ✅ ดึงชื่ออาหาร เพื่อฝังไปในปุ่ม (จำกัดความยาวเพื่อป้องกัน Error)
            const foodNameToSave = detectedFoods.length > 0 ? detectedFoods[0] : "AI Analyzed";

            if (detectedFoods.length > 0) {
                finalText += `\n\n📊 ข้อมูลโภชนาการมาตรฐาน (ต่อ 1 เสิร์ฟปกติ):`;
                detectedFoods.forEach(food => {
                    const data = thaiFoodDB[food];
                    const carbGrams = data.carb || 0;
                    const carbExchange = carbGrams > 0 ? (carbGrams / 15).toFixed(1) : "0";
                    finalText += `\n\n🍲 ${food}\nพลังงาน: ~${data.kcal} kcal\nคาร์โบไฮเดรต: ~${carbGrams} กรัม (คิดเป็น ${carbExchange} คาร์บ)\nน้ำตาล: ~${data.sugar} g\nไขมัน: ~${data.fat} g\nโซเดียม: ~${data.sodium} mg`;
                });
                
                finalText += `\n\n📌 หมายเหตุ: 1 คาร์บ = คาร์โบไฮเดรต 15 กรัม (เทียบเท่าข้าวสวย 1 ทัพพี)`;
            }

            if (estimatedCarb > 0) {
                // ✅ เข้ารหัสชื่ออาหารเพื่อซ่อนไปกับปุ่ม (ตัดความยาวไม่ให้ payload เกิน 300 ตัวอักษร)
                const safeFoodName = encodeURIComponent(foodNameToSave.substring(0, 50));
                
                const quickReply = {
                    items: [
                        {
                            type: "action",
                            action: {
                                type: "postback",
                                label: "😋 กินหมด 100%",
                                // ❌ เอา &img=... ออกแล้ว
                                data: `action=logfood&p=1&c=${estimatedCarb}&f=${safeFoodName}`,
                                displayText: "ฉันกินหมดจานเลยครับ/ค่ะ"
                            }
                        },
                        {
                            type: "action",
                            action: {
                                type: "postback",
                                label: "🌗 กินครึ่งเดียว 50%",
                                // ❌ เอา &img=... ออกแล้ว
                                data: `action=logfood&p=0.5&c=${estimatedCarb}&f=${safeFoodName}`,
                                displayText: "ฉันกินไปแค่ครึ่งเดียวครับ/ค่ะ"
                            }
                        },
                        {
                            type: "action",
                            action: {
                                type: "postback",
                                label: "❌ ถ่ายเฉยๆ",
                                // ❌ เอา &img=... ออกแล้ว
                                data: `action=logfood&p=0&c=${estimatedCarb}&f=${safeFoodName}`,
                                displayText: "แค่ถ่ายรูปมาถามเฉยๆ ไม่ได้กินครับ"
                            }
                        }
                    ]
                };

                return lineClient.pushMessage(userId, {
                    type: 'text',
                    text: finalText + `\n\n👇 กดปุ่มด้านล่างเพื่อบันทึกปริมาณที่คุณทานจริงได้เลยครับ`,
                    quickReply: quickReply
                });
            } else {
                return lineClient.pushMessage(userId, {
                    type: 'text',
                    text: finalText
                });
            }

        } catch (error) {
            console.error("Error processing image:", error);
            return lineClient.pushMessage(userId, {
                type: 'text',
                text: 'ขออภัยครับ/ค่ะ ระบบวิเคราะห์ภาพมีปัญหาชั่วคราว กรุณาลองส่งรูปใหม่อีกครั้งในภายหลังนะคะ 🛠️'
            });
        }
    }

    return Promise.resolve(null);
}

// =====================================
// 12. สตาร์ทเซิร์ฟเวอร์
// =====================================
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Webhook server listening on port ${port}`);
}); 
จะเพิ่มโค้ดนี้ตรงไหน เพื่อที่จะได้ส่งไปที่  Google sheet ตรง status: statusStr,
image_url: data.image || '-',
note: data.note || '-' 

function decodeFoodName(encodedStr) {
  try {
    return decodeURIComponent(encodedStr);
  } catch (e) {
    return "ไม่ทราบชื่ออาหาร";
  }
}
