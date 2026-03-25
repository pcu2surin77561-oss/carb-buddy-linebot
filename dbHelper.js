// --- ไฟล์ dbHelper.js (Hybrid: MongoDB + Google Sheets) ---
const mongoose = require('mongoose');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const crypto = require("crypto");

// =====================================
// 🟢 ส่วนที่ 1: ตั้งค่า MongoDB (สำหรับ User, Food, Log)
// =====================================
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ เชื่อมต่อ MongoDB สำเร็จ!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    cid: String,
    birthday: String,
    gender: String,
    weight: Number,
    height: Number,
    activity: Number,
    dietType: Number,
    carbPerMeal: Number,
    regDate: String
}, { timestamps: true });

const foodLogSchema = new mongoose.Schema({
    timestamp: String,
    date: { type: String, index: true },
    time: String,
    userId: { type: String, index: true },
    cid_hash: String,
    food_name: String,
    estimated_carb: Number,
    portion: Number,
    actual_carb: Number,
    status: String,
    image_url: String,
    note: String
});

const systemLogSchema = new mongoose.Schema({
    timestamp: String,
    time: String,
    userId: String,
    action: String,
    data: String
});

const User = mongoose.model('User', userSchema);
const FoodLog = mongoose.model('FoodLog', foodLogSchema);
const SystemLog = mongoose.model('SystemLog', systemLogSchema);


// =====================================
// 🔵 ส่วนที่ 2: ตั้งค่า Google Sheets (สำหรับดึงผลแล็บ)
// =====================================
const SECRET = process.env.CID_SECRET || "12345678901234567890123456789012";

function hashCID(cid){
    if (!cid) return "";
    let strCid = String(cid).trim();
    if (strCid.length === 64 && /^[0-9a-fA-F]+$/.test(strCid)) return strCid;
    strCid = strCid.replace(/[^0-9]/g, '');
    return crypto.createHash("sha256").update(strCid).digest("hex");
}

let creds;
try { creds = require('./google-credentials.json'); } 
catch (error) { creds = require('/etc/secrets/google-credentials.json'); }

const SHEET_ID = '190jkS-78iiOg9UjYjpmlLnC90FdmiMi4lV4Wb-h2LS4';
const serviceAccountAuth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);

const COL = {
    CID: 'cid_hash', HN: 'hn', FNAME: 'fname', LNAME: 'lname', 
    BIRTHDAY: 'birthday1', AGE: 'age_y', LAB_DATE: 'lab_date', LAB_TIME: 'lab_time',
    LAB_NAME: 'lab_name', LAB_RESULT: 'lab_result', NORMAL_VAL: 'normal_value'
};

async function retryOperation(operation, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try { return await operation(); } 
        catch (error) {
            if (i < maxRetries - 1) {
                const delay = Math.pow(2, i) * 1000 + Math.random() * 500;
                await new Promise(res => setTimeout(res, delay));
            } else throw error;
        }
    }
}

let isDocLoaded = false;
async function initDoc() {
    if (!isDocLoaded) {
        await retryOperation(() => doc.loadInfo());
        isDocLoaded = true;
    }
}

// =====================================
// 🟡 ส่วนที่ 3: ฟังก์ชัน Helper (ของเดิม)
// =====================================
function normalizeDateStr(dateStr) {
    if (!dateStr) return '';
    const cleanStr = String(dateStr).trim();
    const parts = cleanStr.split(/[\/-]/);
    if (parts.length === 3) {
        let d = parts[0], m = parts[1], y = parts[2];
        if (d.length === 4) { y = parts[0]; m = parts[1]; d = parts[2]; }
        return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
    return cleanStr;
}

function convertToISO(dateStr, timeStr) {
    if (!dateStr) return null;
    let d, m, y;
    const cleanDateStr = String(dateStr).trim();
    const cleanTimeStr = String(timeStr || '').trim();
    
    if (cleanDateStr.includes('/')) {
        const parts = cleanDateStr.split('/');
        if (parts.length === 3) { d = parts[0]; m = parts[1]; y = parseInt(parts[2]); }
    } else if (cleanDateStr.includes('-')) {
        const parts = cleanDateStr.split('-');
        if (parts.length === 3) {
            if (parts[0].length === 4) { y = parseInt(parts[0]); m = parts[1]; d = parts[2]; }
            else { d = parts[0]; m = parts[1]; y = parseInt(parts[2]); }
        }
    }
    if (!y || !m || !d) {
        const fallbackDate = new Date(cleanDateStr);
        if (!isNaN(fallbackDate.getTime())) return fallbackDate.toISOString();
        return null;
    }
    if (y > 2400) y = y - 543;

    let formattedTime = "00:00:00";
    if (cleanTimeStr && cleanTimeStr !== "undefined" && cleanTimeStr !== "-") {
        const timeParts = cleanTimeStr.split(':');
        if (timeParts.length >= 2) {
            const th = timeParts[0].padStart(2, '0');
            const tm = timeParts[1].padStart(2, '0');
            const ts = timeParts[2] ? timeParts[2].padStart(2, '0') : '00';
            formattedTime = `${th}:${tm}:${ts}`;
        }
    }
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${formattedTime}`;
}

function getLatestLab(rows, hashedCID, targetBirthday) {
    const map = {};
    let patientInfo = null;
    const safeHashedCID = String(hashedCID).trim();
    const safeTargetBirthday = normalizeDateStr(targetBirthday);

    rows.forEach(row => {
        const rowCID = String(row.get(COL.CID) || '').trim();
        const rowBirthday = normalizeDateStr(row.get(COL.BIRTHDAY));

        if (rowCID === safeHashedCID && rowBirthday === safeTargetBirthday) {
            if (!patientInfo) {
                patientInfo = {
                    name: `${row.get(COL.FNAME) || ''} ${row.get(COL.LNAME) || ''}`.trim() || 'นักเรียน',
                    age: row.get(COL.AGE) || '-',
                    date: row.get(COL.LAB_DATE) || '-'
                };
            }
            const rawKey = row.get(COL.LAB_NAME);
            if (!rawKey) return; 
            
            const key = String(rawKey).trim().toUpperCase();
            const dateStr = row.get(COL.LAB_DATE);
            const timeStr = row.get(COL.LAB_TIME);
            const isoString = convertToISO(dateStr, timeStr);
            const datetime = isoString ? new Date(isoString) : new Date(0);

            if (!map[key] || datetime >= map[key].datetime) {
                map[key] = {
                    name: String(rawKey).trim(),
                    result: row.get(COL.LAB_RESULT),
                    normal: row.get(COL.NORMAL_VAL) || 'ไม่ระบุ',
                    date: dateStr || '-',
                    datetime: datetime
                };
            }
        }
    });
    return { patientInfo, latestLabs: Object.entries(map) };
}


// =====================================
// 🚀 ส่วนที่ 4: ฟังก์ชันส่งออก (ใช้ร่วมกับ server.js)
// =====================================

// 1. ดึงผลแล็บ (ดึงจาก Google Sheets เหมือนเดิม)
async function getPatientHealthReport(targetCidHash, targetBirthday) {
    try {
        const hashedCID = hashCID(targetCidHash);
        await initDoc(); 
        const sheet = doc.sheetsByIndex[0]; 
        const rows = await retryOperation(() => sheet.getRows()); 
        
        const { patientInfo, latestLabs } = getLatestLab(rows, hashedCID, targetBirthday);
        if (!patientInfo || latestLabs.length === 0) return null;

        let finalLabList = [];
        for (const [key, data] of latestLabs) {
            finalLabList.push(`- ${data.name}: ${data.result} (ค่าปกติ: ${data.normal}) [ตรวจเมื่อ: ${data.date}]`);
        }
        return { patientInfo, labTextSummary: finalLabList.join('\n') };
    } catch (e) { 
        console.error("Error in getPatientHealthReport:", e);
        return null; 
    }
}

// 2. ดึงข้อมูล User (ย้ายมา MongoDB)
async function getRegisteredUser(userId) {
    try {
        const safeUserId = String(userId).trim();
        return await User.findOne({ userId: safeUserId }).lean();
    } catch (e) { 
        console.error("Error in getRegisteredUser:", e);
        return null; 
    }
}

// 3. ลงทะเบียน / อัปเดต User (ย้ายมา MongoDB)
async function registerNewUser(userId, cid, birthday, gender, weight, height, activity, dietType, carbPerMeal) {
    try {
        const now = new Date();
        const dateStr = now.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });
        const timeStr = now.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour12: false });
        const today = `${dateStr} ${timeStr}`;
        const safeUserId = String(userId).trim();

        const updateData = { cid, birthday, gender, weight, height, activity, dietType, carbPerMeal, regDate: today };
        
        const user = await User.findOneAndUpdate(
            { userId: safeUserId },
            updateData,
            { upsert: true, new: true, rawResult: true }
        );
        
        return user.lastErrorObject?.updatedExisting ? "updated" : "success";
    } catch (e) { 
        console.error("Error in registerNewUser:", e);
        return "error"; 
    }
}

// 4. บันทึกอาหาร (ย้ายมา MongoDB)
async function saveFoodLog(data) {
    try {
        const newLog = new FoodLog({
            timestamp: data.timestamp || new Date().toISOString(),
            date: data.date, 
            time: data.time, 
            userId: data.userId, 
            cid_hash: data.cid,
            food_name: data.food, 
            estimated_carb: data.carb, 
            portion: data.portion,
            actual_carb: data.actual_carb, 
            status: data.status, 
            image_url: '-', 
            note: data.note || '-'
        });
        await newLog.save();
        return true;
    } catch (error) { 
        console.error("Error saving food log:", error);
        return false; 
    }
}

// 5. ดึงยอดคาร์บวันนี้ (ย้ายมา MongoDB)
async function getTodayCarbTotal(userId) {
    try {
        const today = new Date().toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });
        const logs = await FoodLog.find({ userId: userId, date: today }).lean();
        return parseFloat(logs.reduce((sum, log) => sum + (log.actual_carb || 0), 0).toFixed(1));
    } catch (error) {
        console.error("Error getting today carb:", error);
        return 0;
    }
}

// 6. บันทึก Log (ย้ายมา MongoDB)
async function saveLog({ timestamp, time, userId, action, data }) {
    try {
        await new SystemLog({
            timestamp: timestamp || new Date().toISOString(),
            time: time,
            userId: userId,
            action: action,
            data: String(data)
        }).save();
        return true;
    } catch (error) {
        console.error("Error saving system log:", error);
        return false;
    }
}

// 7. ดึงประวัติอาหาร (ย้ายมา MongoDB)
async function getAllFoodLogs() {
    try {
        const logs = await FoodLog.find().sort({ timestamp: -1 }).limit(100).lean();
        return logs.map(row => ({
            date: row.date || "",
            time: row.time || "",
            userId: row.userId || "",
            food: row.food_name || "unknown",
            actual_carb: Number(row.actual_carb) || 0,
            status: row.status || ""
        }));
    } catch (error) {
        console.error("Error getting all food logs:", error);
        return [];
    }
}

module.exports = { 
    getPatientHealthReport, 
    getRegisteredUser, 
    registerNewUser, 
    saveFoodLog, 
    getTodayCarbTotal,
    saveLog,
    getAllFoodLogs
};
