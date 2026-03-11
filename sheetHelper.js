// --- ไฟล์ sheetHelper.js ---
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// โหลดไฟล์กุญแจ (ฉบับอัปเกรด: รองรับทั้งการรันในคอมตัวเอง และรันบนระบบ Render)
let creds;
try {
    // ลองหาไฟล์ในโฟลเดอร์เดียวกันก่อน (กรณีทดสอบในคอมตัวเอง)
    creds = require('./google-credentials.json'); 
} catch (error) {
    // ถ้าไม่เจอ ให้ไปหาในโฟลเดอร์ Secret ของ Render
    creds = require('/etc/secrets/google-credentials.json'); 
}

// =====================================
// 1. ตั้งค่าพื้นฐาน
// =====================================
const SHEET_ID = '190jkS-78iiOg9UjYjpmlLnC90FdmiMi4lV4Wb-h2LS4';

// ตั้งชื่อคอลัมน์ให้ตรงกับหัวตารางใน Google Sheets ของคุณ
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

// =====================================
// 2. ฟังก์ชันดึงข้อมูลและจัดกลุ่มผลแล็บ (อัปเกรด: ใช้ CID + วันเกิด, ดึงค่าล่าสุด, ใส่วันที่)
// =====================================
async function getPatientHealthReport(targetCid, targetBirthday) {
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
        let labResultsMap = {}; // ใช้ Object แทน Array เพื่อกรองค่าซ้ำ

        // วนลูปหาข้อมูลของนักเรียนที่รหัส CID และวันเกิดตรงกัน
        for (const row of rows) {
            // 🔥 ตรวจสอบความปลอดภัย: CID และ วันเกิด ต้องตรงกันทั้งคู่
            if (row.get(COL.CID) === targetCid && row.get(COL.BIRTHDAY) === targetBirthday) {
                
                // อัปเดตข้อมูลส่วนตัว (จะยึดตามบรรทัดล่างสุด/ล่าสุดเสมอ)
                patientInfo = {
                    name: `${row.get(COL.FNAME)} ${row.get(COL.LNAME)}`,
                    age: row.get(COL.AGE),
                    date: row.get(COL.LAB_DATE) // เก็บวันที่ตรวจล่าสุดของคนไข้
                };

                // ดึงข้อมูลแล็บและวันที่ของแถวนั้นๆ
                const labDate = row.get(COL.LAB_DATE);
                const labName = row.get(COL.LAB_NAME);
                const labResult = row.get(COL.LAB_RESULT);
                const normalVal = row.get(COL.NORMAL_VAL);

                if (labName && labResult) {
                    // เก็บค่าเข้ากล่อง โดยพ่วงวันที่เข้าไปด้วย
                    // ถ้าเจอชื่อแล็บซ้ำ มันจะเอาค่าใหม่และวันที่ใหม่มาทับค่าเก่าทันที
                    labResultsMap[labName] = {
                        result: labResult,
                        normal: normalVal || 'ไม่ระบุ',
                        date: labDate 
                    };
                }
            }
        }

        // ถ้าไม่พบข้อมูลของ CID และวันเกิดนี้เลย
        if (!patientInfo) {
            return null;
        }

        // นำข้อมูลจาก Object มาเรียงร้อยเป็นข้อความ โดยใส่วันที่กำกับไว้ด้านหลัง
        let finalLabList = [];
        for (const [name, data] of Object.entries(labResultsMap)) {
            finalLabList.push(`- ${name}: ${data.result} (ค่าปกติ: ${data.normal}) [ตรวจเมื่อ: ${data.date}]`);
        }

        // ส่งข้อมูลที่จัดกลุ่มแล้วกลับไปให้ server.js
        return {
            patientInfo: patientInfo,
            labTextSummary: finalLabList.join('\n')
        };

    } catch (error) {
        console.error("Error fetching Google Sheets:", error);
        return null;
    }
}

// ส่งออกฟังก์ชันไปให้ไฟล์อื่นเรียกใช้
module.exports = { getPatientHealthReport };
