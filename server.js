// --- ไฟล์ server.js ---
// ระบบ Webhook สำหรับ LINE OA เพื่อรับรูปภาพและให้ Gemini AI วิเคราะห์ผลสุขภาพและอาหาร (สำหรับนักเรียนโรงเรียนเบาหวาน - รองรับการนับคาร์บ)

const express = require('express');
const { middleware, Client } = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// นำเข้าฟังก์ชันดึงข้อมูลจากไฟล์ sheetHelper.js
const { getPatientHealthReport } = require('./sheetHelper');

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
// 2. Thai Food Nutrition Database (เพิ่มฟิลด์ carb เป็นหน่วยกรัม)
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
  "ปลาสามรส": {kcal:450, carb:35, sugar:18, fat:24, sodium:950},
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

// =====================================
// 3. ฟังก์ชันตรวจจับชื่ออาหาร
// =====================================
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
// 4. สร้าง Endpoint /webhook
// =====================================
app.post('/webhook', middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// =====================================
// 5. ฟังก์ชันจัดการ Event
// =====================================
async function handleEvent(event) {
  if (event.type !== 'message') return Promise.resolve(null);
  
  // เก็บ userId ไว้ใช้สำหรับฟังก์ชัน Push Message
  const userId = event.source.userId;

  // -----------------------------------------
  // 5.1 จัดการข้อความ (Text)
  // -----------------------------------------
  if (event.message.type === 'text') {
    const text = event.message.text;

    if (text === 'อ่านผลสุขภาพ / ผลแลป') {
        return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: '📄 โปรดถ่ายรูปใบรายงานผลตรวจเลือด ส่งมาที่นี่ได้เลยครับ/ค่ะ ผู้ช่วย AI จะช่วยแปลผลให้เข้าใจง่ายๆ ครับ 🩺'
        });
    }

    if (text === 'สแกนอาหารด้วย AI') {
        return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: '📸 กรุณาส่งรูปภาพมื้ออาหารที่ชัดเจนมาได้เลยครับ/ค่ะ AI จะช่วยประเมินการนับคาร์บ (Carb Counting) และผลกระทบต่อน้ำตาลในเลือดให้ครับ 🍲'
        });
    }

    // 🔥 ฟีเจอร์ใหม่: สมุดพกสุขภาพนักเรียน
    if (text === 'ดูสมุดพก') {
        // ตอบกลับทันทีด้วย Reply Token เพื่อไม่ให้ผู้ใช้รอนาน
        await lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: '⏳ ระบบกำลังดึงผลตรวจสุขภาพและให้ AI วิเคราะห์ข้อมูล กรุณารอสักครู่นะครับ...'
        });

        try {
            // ดึงข้อมูลจาก Google Sheets (ใช้เลขจำลองที่คุยกันไว้)
            const mockUserCid = "32161000039"; 
            const healthData = await getPatientHealthReport(mockUserCid);

            if (!healthData) {
                return lineClient.pushMessage(userId, { 
                    type: 'text', 
                    text: '❌ ไม่พบประวัติผลตรวจสุขภาพในระบบครับ โปรดตรวจสอบข้อมูลอีกครั้ง' 
                });
            }

            // ส่งข้อมูลให้ Gemini ช่วยแปลผล
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const prompt = `
              คุณคือ "ผู้ช่วย AI โรงเรียนเบาหวาน" ผู้เชี่ยวชาญด้านเบาหวาน
              นี่คือผลตรวจสุขภาพล่าสุดของนักเรียน:
              ชื่อ: ${healthData.patientInfo.name} (อายุ ${healthData.patientInfo.age} ปี)
              วันที่ตรวจ: ${healthData.patientInfo.date}
              
              ผลการตรวจ:
              ${healthData.labTextSummary}
              
              คำสั่ง:
              1. ช่วยอธิบายผลตรวจที่สำคัญ (เช่น ค่าไต, น้ำตาล, ไขมัน ฯลฯ) เป็นภาษาที่คนทั่วไปเข้าใจง่าย
              2. บอกว่าค่าไหนปกติ หรือค่าไหนต้องระวังเป็นพิเศษ
              3. ให้คำแนะนำสั้นๆ ในการดูแลตัวเอง หรือการเลือกทานอาหาร
              ตอบให้กระชับ เป็นมิตร ให้กำลังใจแบบหมอคุยกับคนไข้
            `;

            const result = await model.generateContent(prompt);
            const aiAnalysis = result.response.text();

            // สร้างการ์ด Flex Message (สมุดพก)
            const flexMessage = {
              type: "flex",
              altText: "สมุดพกสุขภาพของคุณมาแล้ว!",
              contents: {
                "type": "bubble",
                "size": "giga",
                "header": {
                  "type": "box",
                  "layout": "vertical",
                  "contents": [
                    {
                      "type": "text", "text": "📘 สมุดพกสุขภาพนักเรียน",
                      "weight": "bold", "color": "#ffffff", "size": "xl"
                    }
                  ],
                  "backgroundColor": "#00897B",
                  "paddingAll": "20px"
                },
                "body": {
                  "type": "box",
                  "layout": "vertical",
                  "contents": [
                    { "type": "text", "text": `ข้อมูลประจำตัว: ${healthData.patientInfo.name}`, "weight": "bold", "size": "md" },
                    { "type": "text", "text": `วันที่อัปเดต: ${healthData.patientInfo.date}`, "size": "xs", "color": "#aaaaaa" },
                    { "type": "separator", "margin": "md" },
                    {
                      "type": "box", "layout": "vertical", "margin": "md",
                      "contents": [
                        { "type": "text", "text": "💡 สรุปผลจากผู้ช่วย AI:", "weight": "bold", "color": "#00897B", "size": "sm" },
                        { "type": "text", "text": aiAnalysis, "wrap": true, "size": "sm", "margin": "sm" }
                      ],
                      "backgroundColor": "#f4fcf8", "paddingAll": "15px", "cornerRadius": "10px"
                    }
                  ],
                  "paddingAll": "20px"
                }
              }
            };

            // ส่งข้อมูลกลับไปให้ผู้ใช้ด้วยวิธี Push Message
            return lineClient.pushMessage(userId, flexMessage);

        } catch (error) {
            console.error("Error in ดูสมุดพก:", error);
            return lineClient.pushMessage(userId, { 
                type: 'text', 
                text: 'ขออภัยครับ เกิดข้อผิดพลาดในการดึงข้อมูลสมุดพก 🙏' 
            });
        }
    }

    return Promise.resolve(null);
  }

  // -----------------------------------------
  // 5.2 จัดการรูปภาพ (Image)
  // -----------------------------------------
  if (event.message.type === 'image') {
    try {
      const stream = await lineClient.getMessageContent(event.message.id);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const base64Image = buffer.toString('base64');

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
      
      const prompt = `
        คุณคือ "ผู้ช่วย AI โรงเรียนเบาหวาน" ผู้เชี่ยวชาญด้านโภชนาการและการจัดการระดับน้ำตาลในเลือด
        
        กรุณาดูภาพนี้ หากเป็นภาพผลตรวจสุขภาพ:
        1. สรุปค่าที่สำคัญ โดยเฉพาะค่าที่เกี่ยวกับเบาหวาน (เช่น FBS, HbA1c, Lipid profile)
        2. บอกว่าค่าไหนอยู่ในเกณฑ์ปกติ หรือผิดปกติ
        3. ให้คำแนะนำเบื้องต้น

        หากเป็นภาพอาหาร (วิเคราะห์อย่างละเอียดเรื่องคาร์บ):
        1. ระบุชื่ออาหารที่เป็นไปได้ให้ครบถ้วน
        2. ประเมินปริมาณอาหารโดยคร่าว (เช่น ข้าวสวยกี่ทัพพี, เส้นกี่ทัพพี)
        3. ประเมิน "จำนวนคาร์บ (Carb Exchange)" จากภาพ โดยใช้หลักการสาธารณสุขไทย คือ คาร์โบไฮเดรต 15 กรัม = 1 คาร์บ (เช่น ข้าว 1 ทัพพี = 1 คาร์บ) แยกระบุให้ชัดเจนว่ามาจากส่วนไหนบ้าง
        4. ประเมินผลกระทบต่อน้ำตาลในเลือด

        ตอบให้กระชับ เป็นมิตร ให้กำลังใจ
        หากเป็นอาหารให้ตอบในรูปแบบ:
        🍲 เมนูที่พบ:
        🍚 ปริมาณที่ประเมินได้:
        🔢 จำนวนคาร์บโดยประมาณ: (เช่น รวม 3 คาร์บ หรือ 45 กรัม)
        📈 ผลกระทบต่อน้ำตาลในเลือด:
        💡 คำแนะนำสำหรับนักเรียนเบาหวาน:
      `;

      const imageParts = [{
        inlineData: { data: base64Image, mimeType: "image/jpeg" }
      }];

      const result = await model.generateContent([prompt, ...imageParts]);
      const response = await result.response;
      const text = response.text();

      let finalText = text;
      const detectedFoods = detectThaiFoods(text);

      if (detectedFoods.length > 0) {
        finalText += `\n\n📊 ข้อมูลโภชนาการมาตรฐาน (ต่อ 1 เสิร์ฟปกติ):`;
        
        detectedFoods.forEach(food => {
          const data = thaiFoodDB[food];
          
          const carbGrams = data.carb || 0;
          const carbExchange = carbGrams > 0 ? (carbGrams / 15).toFixed(1) : "0";

          finalText += `\n\n🍲 ${food}
พลังงาน: ~${data.kcal} kcal
คาร์โบไฮเดรต: ~${carbGrams} กรัม (คิดเป็น ${carbExchange} คาร์บ)
น้ำตาล: ~${data.sugar} g
ไขมัน: ~${data.fat} g
โซเดียม: ~${data.sodium} mg`;
        });

        finalText += `\n\n📌 หมายเหตุ: 1 คาร์บ = คาร์โบไฮเดรต 15 กรัม (เทียบเท่าข้าวสวย 1 ทัพพี) ควรจำกัดจำนวนคาร์บต่อมื้อตามที่แพทย์/นักกำหนดอาหารแนะนำนะคะ/ครับ 💙`;
      }

      return lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: finalText
      });

    } catch (error) {
      console.error("Error processing image with Gemini:", error);
      return lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: 'ขออภัยครับ/ค่ะ ระบบวิเคราะห์ภาพมีปัญหาชั่วคราว กรุณาลองส่งรูปใหม่อีกครั้งในภายหลังนะคะ 🛠️'
      });
    }
  }

  return Promise.resolve(null);
}

// =====================================
// 6. สตาร์ทเซิร์ฟเวอร์
// =====================================
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Webhook server listening on port ${port}`);
});
