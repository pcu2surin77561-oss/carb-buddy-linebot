// --- ไฟล์ sheetHelper.js ---
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

let creds;
try {
    creds = require('./google-credentials.json'); 
} catch (error) {
    creds = require('/etc/secrets/google-credentials.json'); 
}

const SHEET_ID = '190jkS-78iiOg9UjYjpmlLnC90FdmiMi4lV4Wb-h2LS4';

// =====================================
// การตั้งค่าเชื่อมต่อ Google Sheet (ทำครั้งเดียว)
// =====================================
const serviceAccountAuth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);

// =====================================
// ตั้งชื่อหัวคอลัมน์ (ต้องให้ตรงกับแถวที่ 1 ใน Google Sheet)
// =====================================
// แท็บผลแล็บ (Tab 1)
const COL = {
    CID: 'cid',
    HN: 'hn', 
    FNAME: 'fname',
    LNAME: 'lname',
    BIRTHDAY: 'birthday1',
    AGE: 'age_y',
    LAB_DATE: 'lab_date',
    LAB_NAME: 'lab_name',
    LAB_RESULT: 'lab_result',
    NORMAL_VAL: 'normal_value'
};

// แท็บลงทะเบียน (Tab ชื่อ users)
const COL_USER = {
    LINE_ID: 'line_id',
    CID: 'cid',
    BIRTHDAY: 'birthday',
    GENDER: 'gender',
    WEIGHT: 'weight',
    HEIGHT: 'height',
    ACTIVITY: 'activity',
    DIET_TYPE: 'diet_type',
    CARB_PER_MEAL: 'carb_per_meal',
    REG_DATE: 'registered_date'
};

// =====================================
// ฟังก์ชัน 1: ดึงข้อมูลผลแล็บ
// =====================================
async function getPatientHealthReport(targetCid, targetBirthday) {
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0]; 
        const rows = await sheet.getRows(); 

        let patientInfo = null;
        let labResultsMap = {}; 

        for (const row of rows) {
            if (row.get(COL.CID) === targetCid && row.get(COL.BIRTHDAY) === targetBirthday) {
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
                    labResultsMap[labName] = {
                        result: labResult,
                        normal: normalVal || 'ไม่ระบุ',
                        date: labDate 
                    };
                }
            }
        }

        if (!patientInfo) return null;

        let finalLabList = [];
        for (const [name, data] of Object.entries(labResultsMap)) {
            finalLabList.push(`- ${name}: ${data.result} (ค่าปกติ: ${data.normal}) [ตรวจเมื่อ: ${data.date}]`);
        }

        return { patientInfo, labTextSummary: finalLabList.join('\n') };
    } catch (e) { 
        console.error("Error getPatientHealthReport:", e); 
        return null; 
    }
}

// =====================================
// ฟังก์ชัน 2: เช็คสถานะการลงทะเบียน (ดึงข้อมูลผู้ใช้)
// =====================================
async function getRegisteredUser(userId) {
    try {
        await doc.loadInfo();
        const userSheet = doc.sheetsByTitle['users'];
        const rows = await userSheet.getRows();
        
        const userRow = rows.find(row => row.get(COL_USER.LINE_ID) === userId);
        
        // ถ้าเจอข้อมูล ให้ดึงข้อมูลโควตาคาร์บออกไปด้วย เพื่อให้ AI ใช้ประเมิน
        return userRow ? { 
            cid: userRow.get(COL_USER.CID), 
            birthday: userRow.get(COL_USER.BIRTHDAY),
            gender: userRow.get(COL_USER.GENDER),
            weight: userRow.get(COL_USER.WEIGHT),
            height: userRow.get(COL_USER.HEIGHT),
            carbPerMeal: userRow.get(COL_USER.CARB_PER_MEAL)
        } : null;
    } catch (e) { 
        console.error("Error getRegisteredUser:", e); 
        return null; 
    }
}

// =====================================
// ฟังก์ชัน 3: บันทึกการลงทะเบียนใหม่ หรือ อัปเดตข้อมูลเดิม
// =====================================
async function registerNewUser(userId, cid, birthday, gender, weight, height, activity, dietType, carbPerMeal) {
    try {
        await doc.loadInfo();
        const userSheet = doc.sheetsByTitle['users'];
        const rows = await userSheet.getRows();

        const today = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

        // ค้นหาว่าเคยลงทะเบียนไว้หรือยัง
        const existingUserRow = rows.find(row => row.get(COL_USER.LINE_ID) === userId || row.get(COL_USER.CID) === cid);
        
        if (existingUserRow) {
            // 🔄 กรณีคนไข้เก่า: ให้อัปเดตข้อมูลสุขภาพใหม่
            existingUserRow.assign({
                [COL_USER.WEIGHT]: weight,
                [COL_USER.HEIGHT]: height,
                [COL_USER.ACTIVITY]: activity,
                [COL_USER.DIET_TYPE]: dietType,
                [COL_USER.CARB_PER_MEAL]: carbPerMeal,
                [COL_USER.REG_DATE]: today
            });
            await existingUserRow.save(); // บันทึกการแก้ไข
            return "updated"; 
        } else {
            // 🆕 กรณีคนไข้ใหม่: เพิ่มแถวใหม่
            await userSheet.addRow({
                [COL_USER.LINE_ID]: userId,
                [COL_USER.CID]: cid,
                [COL_USER.BIRTHDAY]: birthday,
                [COL_USER.GENDER]: gender,
                [COL_USER.WEIGHT]: weight,
                [COL_USER.HEIGHT]: height,
                [COL_USER.ACTIVITY]: activity,
                [COL_USER.DIET_TYPE]: dietType,
                [COL_USER.CARB_PER_MEAL]: carbPerMeal,
                [COL_USER.REG_DATE]: today
            });
            return "success";
        }
    } catch (e) { 
        console.error("Error registerNewUser:", e); 
        return "error"; 
    }
}

module.exports = { getPatientHealthReport, getRegisteredUser, registerNewUser };
