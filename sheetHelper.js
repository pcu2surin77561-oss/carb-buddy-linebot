// --- ไฟล์ sheetHelper.js ---
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const crypto = require("crypto"); 

function hashCID(cid){
    if (!cid) return "";
    return crypto
        .createHash("sha256")
        .update(String(cid).trim())
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
    BIRTHDAY: 'birthday1', AGE: 'age_y', LAB_DATE: 'lab_date', 
    LAB_NAME: 'lab_name', LAB_RESULT: 'lab_result', NORMAL_VAL: 'normal_value'
};

const COL_USER = {
    LINE_ID: 'line_id', CID: 'cid_hash', BIRTHDAY: 'birthday', 
    GENDER: 'gender', WEIGHT: 'weight', HEIGHT: 'height', 
    ACTIVITY: 'activity', DIET_TYPE: 'diet_type', 
    CARB_PER_MEAL: 'carb_per_meal', REG_DATE: 'registered_date'
};

// 🌟 เพิ่มระบบ Cache โครงสร้าง Sheet เพื่อป้องกัน Error 429 (Too Many Requests)
let isDocLoaded = false;
async function initDoc() {
    if (!isDocLoaded) {
        await doc.loadInfo();
        isDocLoaded = true;
    }
}

function convertToISO(dateStr, timeStr) {
    if (!dateStr) return null;
    
    let d, m, y;
    const cleanDateStr = String(dateStr).trim();
    
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

    const formattedTime = timeStr ? timeStr : "00:00:00";
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${formattedTime}`;
}

function getLatestLab(rows, hashedCID, targetBirthday) {
    const map = {};
    let patientInfo = null;
    
    const safeHashedCID = String(hashedCID).trim();
    const safeTargetBirthday = String(targetBirthday).trim();

    rows.forEach(row => {
        const rowCID = String(row.get(COL.CID) || '').trim();
        const rowBirthday = String(row.get(COL.BIRTHDAY) || '').trim();

        if (rowCID === safeHashedCID && rowBirthday === safeTargetBirthday) {
            if (!patientInfo) {
                patientInfo = {
                    name: `${row.get(COL.FNAME) || ''} ${row.get(COL.LNAME) || ''}`.trim() || 'นักเรียน',
                    age: row.get(COL.AGE) || '-',
                    date: row.get(COL.LAB_DATE) || '-'
                };
            }

            const key = row.get(COL.LAB_NAME);
            if (!key) return; 

            const dateStr = row.get(COL.LAB_DATE);
            const isoString = convertToISO(dateStr, "00:00:00");
            
            const datetime = isoString ? new Date(isoString) : new Date(0);

            if (!map[key] || datetime >= map[key].datetime) {
                map[key] = {
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

async function getPatientHealthReport(targetCidHash, targetBirthday) {
    try {
        const hashedCID = targetCidHash;

        await initDoc(); // 🌟 เปลี่ยนมาใช้ initDoc()
        const sheet = doc.sheetsByIndex[0]; 
        const rows = await sheet.getRows(); 
        
        const { patientInfo, latestLabs } = getLatestLab(rows, hashedCID, targetBirthday);

        if (!patientInfo || latestLabs.length === 0) return null;

        let finalLabList = [];
        for (const [name, data] of latestLabs) {
            finalLabList.push(`- ${name}: ${data.result} (ค่าปกติ: ${data.normal}) [ตรวจเมื่อ: ${data.date}]`);
        }

        return { patientInfo, labTextSummary: finalLabList.join('\n') };
    } catch (e) { 
        console.error("Error in getPatientHealthReport:", e);
        return null; 
    }
}

async function getRegisteredUser(userId) {
    try {
        await initDoc(); // 🌟 เปลี่ยนมาใช้ initDoc()
        const userSheet = doc.sheetsByTitle['users'];
        const rows = await userSheet.getRows();
        const userRow = rows.find(row => row.get(COL_USER.LINE_ID) === userId);
        
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
    } catch (e) { return null; }
}

async function registerNewUser(userId, cid, birthday, gender, weight, height, activity, dietType, carbPerMeal) {
    try {
        await initDoc(); // 🌟 เปลี่ยนมาใช้ initDoc()
        const userSheet = doc.sheetsByTitle['users'];
        const rows = await userSheet.getRows();
        const today = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        
        const existingUserRow = rows.find(row => row.get(COL_USER.LINE_ID) === userId || row.get(COL_USER.CID) === cid);
        
        if (existingUserRow) {
            existingUserRow.assign({
                [COL_USER.WEIGHT]: weight, [COL_USER.HEIGHT]: height, [COL_USER.ACTIVITY]: activity,
                [COL_USER.DIET_TYPE]: dietType, [COL_USER.CARB_PER_MEAL]: carbPerMeal, [COL_USER.REG_DATE]: today
            });
            await existingUserRow.save(); 
            return "updated"; 
        } else {
            await userSheet.addRow({
                [COL_USER.LINE_ID]: userId, [COL_USER.CID]: cid, [COL_USER.BIRTHDAY]: birthday,
                [COL_USER.GENDER]: gender, [COL_USER.WEIGHT]: weight, [COL_USER.HEIGHT]: height,
                [COL_USER.ACTIVITY]: activity, [COL_USER.DIET_TYPE]: dietType,
                [COL_USER.CARB_PER_MEAL]: carbPerMeal, [COL_USER.REG_DATE]: today
            });
            return "success";
        }
    } catch (e) { return "error"; }
}

async function saveFoodLog(data) {
    try {
        await initDoc(); // 🌟 เปลี่ยนมาใช้ initDoc()
        const foodSheet = doc.sheetsByTitle['food_logs'];
        if (!foodSheet) return false;

        await foodSheet.addRow({
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
        return true;
    } catch (error) { 
        console.error("Error saving food log:", error);
        return false; 
    }
}

async function getTodayCarbTotal(userId) {
    try {
        await initDoc(); // 🌟 เปลี่ยนมาใช้ initDoc()
        const sheet = doc.sheetsByTitle['food_logs'];
        if (!sheet) return 0;

        const rows = await sheet.getRows();
        const today = new Date().toLocaleDateString('th-TH', {timeZone: 'Asia/Bangkok'});
        let total = 0;

        rows.forEach(r => {
            if (r.get('userId') === userId && r.get('date') === today) {
                total += Number(r.get('actual_carb') || 0);
            }
        });

        return parseFloat(total.toFixed(1));
    } catch (error) {
        console.error("Error getting today carb:", error);
        return 0;
    }
}

async function saveLog({ timestamp, time, userId, action, data }) {
    try {
        await initDoc(); // 🌟 เปลี่ยนมาใช้ initDoc()
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
        await initDoc(); // 🌟 เปลี่ยนมาใช้ initDoc()
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
