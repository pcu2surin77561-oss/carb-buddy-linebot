// --- ไฟล์ sheetHelper.js ---
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// โหลดไฟล์กุญแจ (เวลาขึ้นระบบจริง Render จะดึงจาก Secret Files มาให้ครับ)
const creds = require('./google-credentials.json'); 

// =====================================
// 1. ตั้งค่าพื้นฐาน
// =====================================
// ⚠️ อย่าลืมแก้ตรงนี้: นำ Sheet ID ของคุณมาใส่ (ก๊อปปี้จาก URL ของ Google Sheets)
const SHEET_ID = '190jkS-78iiOg9UjYjpmlLnC90FdmiMi4lV4Wb-h2LS4';

// ตั้งชื่อคอลัมน์ให้ตรงกับหัวตารางใน Google Sheets ของคุณ
const COL = {
    CID: 'cid',
    HN: 'HN',
    FNAME: 'fname',
    LNAME: 'lname',
    BIRTHDAY: 'birthday1',
    AGE: 'age_y',
    LAB_DATE: 'lab_date',
    LAB_NAME: 'lab_name',
    LAB_RESULT: 'lab_result',
    NORMAL_VAL: 'normal_value'
};

// =====================================
// 2. ฟังก์ชันดึงข้อมูลและจัดกลุ่มผลแล็บ
// =====================================
async function getPatientHealthReport(targetCid) {
    try {
        // ยืนยันตัวตนกับ Google ด้วย Service Account
        const serviceAccountAuth = new JWT({
            email: creds.client_email,
            key: creds.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
        await doc.loadInfo(); // โหลดข้อมูล Sheet
        
        const sheet = doc.sheetsByIndex[0]; // ดึงแท็บแรกสุด (Tab 1)
        const rows = await sheet.getRows(); // ดึงข้อมูลทุกแถว

        // ตัวแปรสำหรับเก็บข้อมูลที่จะส่งให้ AI
        let patientInfo = null;
        let labResultsList = [];

        // วนลูปหาข้อมูลของนักเรียนที่รหัส CID ตรงกัน
        for (const row of rows) {
            // เช็คว่า CID ในแถวนี้ ตรงกับคนที่กำลังค้นหาหรือไม่
            if (row.get(COL.CID) === targetCid) {
                
                // เก็บข้อมูลส่วนตัว (เก็บแค่ครั้งเดียวจากแถวแรกที่เจอ)
                if (!patientInfo) {
                    patientInfo = {
                        name: `${row.get(COL.FNAME)} ${row.get(COL.LNAME)}`,
                        age: row.get(COL.AGE),
                        date: row.get(COL.LAB_DATE)
                    };
                }

                // ดึงรายการผลแล็บของแถวนั้นๆ มาจัดเรียง
                const labName = row.get(COL.LAB_NAME);
                const labResult = row.get(COL.LAB_RESULT);
                const normalVal = row.get(COL.NORMAL_VAL);

                if (labName && labResult) {
                    labResultsList.push(`- ${labName}: ${labResult} (ค่าปกติ: ${normalVal || 'ไม่ระบุ'})`);
                }
            }
        }

        // ถ้าไม่พบข้อมูลของ CID นี้เลย
        if (!patientInfo) {
            return null;
        }

        // ส่งข้อมูลที่จัดกลุ่มแล้วกลับไปให้ server.js
        return {
            patientInfo: patientInfo,
            labTextSummary: labResultsList.join('\n')
        };

    } catch (error) {
        console.error("Error fetching Google Sheets:", error);
        return null;
    }
}

// ส่งออกฟังก์ชันไปให้ไฟล์อื่นเรียกใช้
module.exports = { getPatientHealthReport };
