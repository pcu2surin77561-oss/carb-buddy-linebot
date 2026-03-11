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

// ตั้งชื่อคอลัมน์แท็บผลแล็บ (Tab 1)
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

// ตั้งชื่อคอลัมน์แท็บลงทะเบียน (Tab ชื่อ users)
const COL_USER = {
    LINE_ID: 'line_id',
    CID: 'cid',
    BIRTHDAY: 'birthday'
};

// =====================================
// ฟังก์ชัน 1: ดึงข้อมูลผลแล็บ
// =====================================
async function getPatientHealthReport(targetCid, targetBirthday) {
    try {
        const serviceAccountAuth = new JWT({
            email: creds.client_email,
            key: creds.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
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
    } catch (e) { console.error(e); return null; }
}

// =====================================
// ฟังก์ชัน 2: เช็คสถานะการลงทะเบียน (ดึง CID จาก LINE ID)
// =====================================
async function getRegisteredUser(userId) {
    try {
        const serviceAccountAuth = new JWT({
            email: creds.client_email,
            key: creds.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        
        const userSheet = doc.sheetsByTitle['users'];
        const rows = await userSheet.getRows();
        
        const userRow = rows.find(row => row.get(COL_USER.LINE_ID) === userId);
        return userRow ? { cid: userRow.get(COL_USER.CID), birthday: userRow.get(COL_USER.BIRTHDAY) } : null;
    } catch (e) { return null; }
}

// =====================================
// ฟังก์ชัน 3: บันทึกการลงทะเบียนใหม่
// =====================================
async function registerNewUser(userId, cid, birthday) {
    try {
        const serviceAccountAuth = new JWT({
            email: creds.client_email,
            key: creds.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        
        const userSheet = doc.sheetsByTitle['users'];
        const rows = await userSheet.getRows();

        const isDuplicate = rows.some(row => row.get(COL_USER.LINE_ID) === userId || row.get(COL_USER.CID) === cid);
        if (isDuplicate) return "duplicate";

        await userSheet.addRow({
            [COL_USER.LINE_ID]: userId,
            [COL_USER.CID]: cid,
            [COL_USER.BIRTHDAY]: birthday
        });
        return "success";
    } catch (e) { return "error"; }
}

module.exports = { getPatientHealthReport, getRegisteredUser, registerNewUser };
