// --- ไฟล์ sheetHelper.js ---
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const crypto = require("crypto"); // 🌟 นำเข้า crypto สำหรับทำ Hashing

// 🌟 ฟังก์ชันสร้าง Hash สำหรับ CID
function hashCID(cid){
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

async function getPatientHealthReport(targetCid, targetBirthday) {
    try {
        const hashedCID = hashCID(targetCid); // 🌟 แปลง CID ที่รับมาเป็น Hash ก่อนนำไปค้นหาใน Sheet

        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0]; 
        const rows = await sheet.getRows(); 
        let patientInfo = null;
        let labResultsMap = {}; 

        for (const row of rows) {
            // 🌟 เปรียบเทียบกับค่า Hash ใน Sheet
            if (row.get(COL.CID) === hashedCID && row.get(COL.BIRTHDAY) === targetBirthday) {
                patientInfo = {
                    name: `${row.get(COL.FNAME)} ${row.get(COL.LNAME)}`,
                    age: row.get(COL.AGE),
                    date: row.get(COL.LAB_DATE)
                };
                const labDate = row.get(COL.LAB_DATE);
                const labName = row.get(COL.LAB_NAME);
                const labResult = row.get(COL.LAB_RESULT);
                const normalVal = row.get(COL.NORMAL_VAL);

                if (labName && labResult) {
                    labResultsMap[labName] = { result: labResult, normal: normalVal || 'ไม่ระบุ', date: labDate };
                }
            }
        }
        if (!patientInfo) return null;
        let finalLabList = [];
        for (const [name, data] of Object.entries(labResultsMap)) {
            finalLabList.push(`- ${name}: ${data.result} (ค่าปกติ: ${data.normal}) [ตรวจเมื่อ: ${data.date}]`);
        }
        return { patientInfo, labTextSummary: finalLabList.join('\n') };
    } catch (e) { return null; }
}

async function getRegisteredUser(userId) {
    try {
        await doc.loadInfo();
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
        await doc.loadInfo();
        const userSheet = doc.sheetsByTitle['users'];
        const rows = await userSheet.getRows();
        const today = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        // cid ที่ถูกส่งเข้ามาถูก Hash จาก server.js เรียบร้อยแล้ว ไม่ต้องทำซ้ำ
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
        await doc.loadInfo();
        const foodSheet = doc.sheetsByTitle['food_logs'];
        if (!foodSheet) return false;

        await foodSheet.addRow({
            date: data.date, time: data.time, userId: data.userId, cid_hash: data.cid,
            food_name: data.food, estimated_carb: data.carb, portion: data.portion,
            actual_carb: data.actual_carb, status: data.status, image_url: '-', note: data.note || '-'
        });
        return true;
    } catch (error) { return false; }
}

async function getTodayCarbTotal(userId) {
    try {
        await doc.loadInfo();
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

// 🌟 ฟังก์ชันบันทึก Log การใช้งานลง Google Sheet (แท็บ LOG)
async function saveLog({ time, userId, action, data }) {
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle["LOG"];
        if (!sheet) {
            console.error("ไม่พบแท็บ LOG ใน Google Sheet");
            return false;
        }

        await sheet.addRow({
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

// 🌟 ฟังก์ชันสำหรับดึงข้อมูลการกินอาหารทั้งหมดไปแสดงบน Dashboard
async function getAllFoodLogs() {
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['food_logs'];
        if (!sheet) return [];

        const rows = await sheet.getRows();
        
        // แปลงข้อมูลจาก Google Sheet ให้เป็น Array ของ Object ปกติ
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
    getAllFoodLogs // 🌟 เพิ่มตรงนี้เข้าไป
};
