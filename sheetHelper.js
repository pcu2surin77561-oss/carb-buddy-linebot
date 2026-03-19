// --- ไฟล์ sheetHelper.js ---
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const crypto = require("crypto"); 

const SECRET = process.env.CID_SECRET || "12345678901234567890123456789012";

// 🌟 ฟังก์ชันสร้าง Hash สำหรับ CID (เพิ่มระบบป้องกันการ Hash ซ้ำซ้อน)
function hashCID(cid){
    if (!cid) return "";
    
    // ตรวจสอบว่าถ้ามันเป็น hash 64 ตัวอักษร (SHA-256) อยู่แล้ว ไม่ต้อง hash ซ้ำ
    let strCid = String(cid).trim();
    if (strCid.length === 64 && /^[0-9a-fA-F]+$/.test(strCid)) {
        return strCid;
    }
    
    strCid = strCid.replace(/[^0-9]/g, ''); // บังคับตัดขีดและเว้นวรรคทิ้ง
    return crypto
        .createHash("sha256")
        .update(strCid) // เอา SECRET ออกเพื่อให้ตรงกับ server.js และระบบ LAB
        .digest("hex");
}

let creds;
try {
    creds = require('./google-credentials.json'); 
} catch (error) {
    creds = require('/etc/secrets/google-credentials.json'); 
}

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

const COL_USER = {
    LINE_ID: 'line_id', CID: 'cid_hash', BIRTHDAY: 'birthday', 
    GENDER: 'gender', WEIGHT: 'weight', HEIGHT: 'height', 
    ACTIVITY: 'activity', DIET_TYPE: 'diet_type', 
    CARB_PER_MEAL: 'carb_per_meal', REG_DATE: 'registered_date'
};

// =====================================
// 🚀 ระบบ In-Memory Caching & Indexing (O(1))
// =====================================
const userCache = new Map();
let isUserCacheLoaded = false;
let userCachePromise = null;

async function loadUserCache() {
    if (isUserCacheLoaded) return;
    if (userCachePromise) { await userCachePromise; return; }
    
    userCachePromise = (async () => {
        await initDoc();
        const userSheet = doc.sheetsByTitle['users'];
        if (!userSheet) return;

        const rows = await retryOperation(() => userSheet.getRows());
        userCache.clear();
        rows.forEach(row => {
            const lineId = String(row.get(COL_USER.LINE_ID) || '').trim();
            if (lineId) userCache.set(lineId, row);
        });
        isUserCacheLoaded = true;
        console.log(`✅ [Cache] Loaded ${userCache.size} users into memory (O(1) enabled).`);
    })();
    await userCachePromise;
}

const todayCarbCache = new Map();
let currentCacheDate = new Date().toLocaleDateString('th-TH', {timeZone: 'Asia/Bangkok'});
let isFoodCacheLoaded = false;
let foodCachePromise = null;

async function loadFoodCache() {
    if (isFoodCacheLoaded) return;
    if (foodCachePromise) { await foodCachePromise; return; }

    foodCachePromise = (async () => {
        await initDoc();
        const sheet = doc.sheetsByTitle['food_logs'];
        if (!sheet) return;

        const rows = await retryOperation(() => sheet.getRows());
        todayCarbCache.clear();
        currentCacheDate = new Date().toLocaleDateString('th-TH', {timeZone: 'Asia/Bangkok'});
        
        rows.forEach(r => {
            const rowDate = r.get('date');
            if (rowDate === currentCacheDate) { 
                const uid = r.get('userId');
                const carb = Number(r.get('actual_carb') || 0);
                const key = `${uid}_${currentCacheDate}`;
                todayCarbCache.set(key, (todayCarbCache.get(key) || 0) + carb);
            }
        });
        isFoodCacheLoaded = true;
        console.log(`✅ [Cache] Loaded today's food logs into memory.`);
    })();
    await foodCachePromise;
}

function checkAndResetDailyCache() {
    const today = new Date().toLocaleDateString('th-TH', {timeZone: 'Asia/Bangkok'});
    if (today !== currentCacheDate) {
        todayCarbCache.clear();
        currentCacheDate = today;
    }
    return today;
}

// =====================================
// 🌟 ระบบลดการเรียก API (ป้องกัน Error 429 Too Many Requests)
// =====================================
async function retryOperation(operation, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            const isRateLimit = error.response && error.response.status === 429;
            const isNetworkError = error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';
            if ((isRateLimit || isNetworkError) && i < maxRetries - 1) {
                const delay = Math.pow(2, i) * 1000 + Math.random() * 500;
                await new Promise(res => setTimeout(res, delay));
            } else {
                throw error;
            }
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
// 🌟 ฟังก์ชันจัดการวันที่และเวลา
// =====================================
function normalizeDateStr(dateStr) {
    if (!dateStr) return '';
    const cleanStr = String(dateStr).trim();
    const parts = cleanStr.split(/[\/-]/);
    if (parts.length === 3) {
        let d = parts[0];
        let m = parts[1];
        let y = parts[2];
        if (d.length === 4) { // รองรับกรณี YYYY-MM-DD
            y = parts[0];
            m = parts[1];
            d = parts[2];
        }
        return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
    return cleanStr;
}

function convertToISO(dateStr, timeStr) {
    if (!dateStr) return null;
    
    let d, m, y;
    const cleanDateStr = String(dateStr).trim();
    const cleanTimeStr = String(timeStr || '').trim();
    
    // รองรับทั้งการคั่นด้วย / และ -
    if (cleanDateStr.includes('/')) {
        const parts = cleanDateStr.split('/');
        if (parts.length === 3) { d = parts[0]; m = parts[1]; y = parseInt(parts[2]); }
    } else if (cleanDateStr.includes('-')) {
        const parts = cleanDateStr.split('-');
        if (parts.length === 3) {
            if (parts[0].length === 4) { y = parseInt(parts[0]); m = parts[1]; d = parts[2]; } // YYYY-MM-DD
            else { d = parts[0]; m = parts[1]; y = parseInt(parts[2]); } // DD-MM-YYYY
        }
    }

    // ถ้าหารูปแบบไม่เจอ ให้ลองใช้ Date ของ JS แปลงดูเผื่อรอด
    if (!y || !m || !d) {
        const fallbackDate = new Date(cleanDateStr);
        if (!isNaN(fallbackDate.getTime())) return fallbackDate.toISOString();
        return null;
    }

    // รองรับกรณีคนกรอก พ.ศ. ให้แปลงกลับเป็น ค.ศ.
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

// =====================================
// 🌟 ฟังก์ชันกรองดึง "ผลแล็บล่าสุด" เท่านั้น
// =====================================
function getLatestLab(rows, hashedCID, targetBirthday) {
    const map = {};
    let patientInfo = null;
    
    const safeHashedCID = String(hashedCID).trim();
    const safeTargetBirthday = normalizeDateStr(targetBirthday);

    rows.forEach(row => {
        const rowCID = String(row.get(COL.CID) || '').trim();
        const rowBirthday = normalizeDateStr(row.get(COL.BIRTHDAY));

        if (rowCID === safeHashedCID && rowBirthday === safeTargetBirthday) {
            // เก็บข้อมูลคนไข้ (ดึงจากบรรทัดแรกที่เจอข้อมูลตรงกัน)
            if (!patientInfo) {
                patientInfo = {
                    name: `${row.get(COL.FNAME) || ''} ${row.get(COL.LNAME) || ''}`.trim() || 'นักเรียน',
                    age: row.get(COL.AGE) || '-',
                    date: row.get(COL.LAB_DATE) || '-'
                };
            }

            const rawKey = row.get(COL.LAB_NAME);
            if (!rawKey) return; 
            
            // ใช้ Uppercase เพื่อป้องกันปัญหาชื่อซ้ำซ้อนแบบ HbA1c กับ HbA1C
            const key = String(rawKey).trim().toUpperCase();

            const dateStr = row.get(COL.LAB_DATE);
            const timeStr = row.get(COL.LAB_TIME);
            const isoString = convertToISO(dateStr, timeStr);
            
            const datetime = isoString ? new Date(isoString) : new Date(0);

            // เช็กว่าถ้ายังไม่มีค่าของแล็บนี้ หรือมีแล้วแต่วันที่ใหม่กว่า ให้แทนที่ของเดิม
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

    return { patientInfo, latestLabs: Object.entries(map) }; // คงไว้ตามเดิมเพื่อให้โครงสร้างด้านล่างใช้ได้ต่อ
}

async function getPatientHealthReport(targetCidHash, targetBirthday) {
    try {
        // hashCID ฉบับใหม่ป้องกันการซ้อน Hash ไว้ให้แล้ว ใส่เข้ามาได้อย่างปลอดภัย
        const hashedCID = hashCID(targetCidHash);

        await initDoc(); // 🌟 โหลดโครงสร้าง Sheet (ใช้ของที่ Cache ไว้ถ้าเคยโหลดแล้ว)
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

async function getRegisteredUser(userId) {
    try {
        await initDoc();
        const userSheet = doc.sheetsByTitle['users'];
        if (!userSheet) return null;

        const rows = await retryOperation(() => userSheet.getRows());
        
        // 🌟 บังคับลบเว้นวรรคซ้ายขวาทั้งฝั่งข้อมูลและฝั่งค้นหา ป้องกันปัญหาหาไม่เจอ
        const safeUserId = String(userId).trim();
        const userRow = rows.find(row => String(row.get(COL_USER.LINE_ID) || '').trim() === safeUserId);
        
        return userRow ? { 
            cid: userRow.get(COL_USER.CID), 
            birthday: userRow.get(COL_USER.BIRTHDAY),
            gender: userRow.get(COL_USER.GENDER),
            weight: userRow.get(COL_USER.WEIGHT),
            height: userRow.get(COL_USER.HEIGHT),
            activity: userRow.get(COL_USER.ACTIVITY),
            dietType: userRow.get(COL_USER.DIET_TYPE),
            carbPerMeal: userRow.get(COL_USER.CARB_PER_MEAL)
        } : null;
    } catch (e) { 
        console.error("❌ Error in getRegisteredUser (Check column line_id):", e);
        return null; 
    }
}

async function registerNewUser(userId, cid, birthday, gender, weight, height, activity, dietType, carbPerMeal) {
    try {
        await initDoc();
        const userSheet = doc.sheetsByTitle['users'];
        if (!userSheet) {
            console.error("❌ ไม่พบแท็บ 'users' ใน Google Sheet (ตรวจสอบตัวสะกด)");
            return "error";
        }

        const rows = await retryOperation(() => userSheet.getRows());
        
        const now = new Date();
        const dateStr = now.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });
        const timeStr = now.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour12: false });
        const today = `${dateStr} ${timeStr}`;
        
        const safeUserId = String(userId).trim();
        const safeCid = String(cid).trim();
        
        const existingUserRow = rows.find(row => {
            const rowLineId = String(row.get(COL_USER.LINE_ID) || '').trim();
            const rowCid = String(row.get(COL_USER.CID) || '').trim();
            return (rowLineId !== '' && rowLineId === safeUserId) || 
                   (safeCid !== '' && safeCid !== 'undefined' && rowCid !== '' && rowCid === safeCid);
        });
        
        if (existingUserRow) {
            existingUserRow.assign({
                [COL_USER.CID]: cid,
                [COL_USER.WEIGHT]: weight, [COL_USER.HEIGHT]: height, [COL_USER.ACTIVITY]: activity,
                [COL_USER.DIET_TYPE]: dietType, [COL_USER.CARB_PER_MEAL]: carbPerMeal, [COL_USER.REG_DATE]: today
            });
            await retryOperation(() => existingUserRow.save()); 
            return "updated"; 
        } else {
            await retryOperation(() => userSheet.addRow({
                [COL_USER.LINE_ID]: userId, [COL_USER.CID]: cid, [COL_USER.BIRTHDAY]: birthday,
                [COL_USER.GENDER]: gender, [COL_USER.WEIGHT]: weight, [COL_USER.HEIGHT]: height,
                [COL_USER.ACTIVITY]: activity, [COL_USER.DIET_TYPE]: dietType,
                [COL_USER.CARB_PER_MEAL]: carbPerMeal, [COL_USER.REG_DATE]: today
            }));
            return "success";
        }
    } catch (e) { 
        console.error("❌ Error in registerNewUser (เช็กชื่อหัวกระดาษหรือแท็บ):", e.message || e);
        return "error"; 
    }
}

async function saveFoodLog(data) {
    try {
        await loadFoodCache();
        const foodSheet = doc.sheetsByTitle['food_logs'];
        if (!foodSheet) return false;

        await foodSheet.addRow({
            timestamp: data.timestamp || new Date().toISOString(), // 🌟 รองรับการเรียงลำดับเวลา
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
        
        // อัปเดตยอดรวมวันนี้ลง Cache (O(1)) โดยไม่ต้องโหลดใหม่
        const today = checkAndResetDailyCache();
        if (data.date === today) {
            const key = `${data.userId}_${today}`;
            const currentCarb = todayCarbCache.get(key) || 0;
            todayCarbCache.set(key, currentCarb + (Number(data.actual_carb) || 0));
        }
        return true;
    } catch (error) { 
        console.error("Error saving food log:", error);
        return false; 
    }
}

async function getTodayCarbTotal(userId) {
    try {
        await loadFoodCache();
        const today = checkAndResetDailyCache();
        const key = `${userId}_${today}`;
        return parseFloat((todayCarbCache.get(key) || 0).toFixed(1));
    } catch (error) {
        console.error("Error getting today carb:", error);
        return 0;
    }
}

async function saveLog({ timestamp, time, userId, action, data }) {
    try {
        await initDoc();
        const sheet = doc.sheetsByTitle["LOG"];
        if (!sheet) {
            console.error("ไม่พบแท็บ LOG ใน Google Sheet");
            return false;
        }

        await sheet.addRow({
            timestamp: timestamp || new Date().toISOString(),
            time: time,
            userId: userId,
            action: action,
            data: data
        });
        return true;
    } catch (error) {
        console.error("Error saving log to sheet:", error);
        return false;
    }
}

async function getAllFoodLogs() {
    try {
        await initDoc();
        const sheet = doc.sheetsByTitle['food_logs'];
        if (!sheet) return [];

        const rows = await sheet.getRows();
        
        const logs = rows.map(row => {
            return {
                date: row.get('date') || "",
                time: row.get('time') || "",
                userId: row.get('userId') || "",
                food: row.get('food_name') || "unknown",
                actual_carb: Number(row.get('actual_carb')) || 0,
                status: row.get('status') || ""
            };
        });

        return logs;
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
