# Alfresco API — บัญชีกลาง

ทุก endpoint ของ Alfresco ใช้ logic, validation และ response ของ UserAlfresco-api โดยใช้ ALFRESCO_USER / ALFRESCO_PASS จาก .env ที่ root ของโปรเจกต์ (environment ของ process มีลำดับความสำคัญสูงกว่า)

ใช้ prefix /api/alfresco หรือ /user-api/alfresco ได้เหมือนกัน โดย downloadUrl ใช้ /api/alfresco
GET /health และ GET /api/health ตอบโหมด service-account

| Method | Path หลัง prefix | การใช้งาน |
|---|---|---|
| GET | /folders | รายการโฟลเดอร์ |
| GET | /folders/tree | โฟลเดอร์ทุกชั้น |
| GET | /documents | รายการหรือค้นหาเอกสาร |
| GET | /documents/search | ค้นหาเอกสาร |
| GET | /documents/location | ตำแหน่งเอกสาร ใช้ query id |
| GET | /documents/:id/location | ตำแหน่งเอกสาร |
| GET | /documents/:id/content | เปิดเนื้อหาไฟล์ |
| POST | /documents | อัปโหลด raw binary |
| PATCH | /documents หรือ /documents/:id | เปลี่ยนชื่อ |
| DELETE | /documents หรือ /documents/:id | ลบเอกสาร |
| PUT | /documents/content หรือ /documents/:id/content | แทนที่เนื้อหา raw binary |

เส้นทางที่ไม่มี :id รับ id ผ่าน query string

## Authentication

อ่านข้อมูลส่ง Authorization: Bearer <API_TOKEN> เขียนข้อมูลส่ง Authorization: Bearer <WRITE_API_TOKEN> ทุกคำขอ Alfresco ใช้บัญชีกลางเท่านั้น field username ใน response เป็น ALFRESCO_USER ไม่มี login/session รายบุคคลและไม่มี /auth endpoints

## Parameters และ response

รายการ/ค้นหารองรับ folderPath/path, q/keyword/name, exactName/fileName, maxItems, skipCount, sortBy, sortDirection ตามต้นฉบับ ผลลัพธ์มี count, total, hasMoreItems, nextSkipCount, files และ username ข้อมูลไฟล์มี permissions และ allowRename จาก allowableActions ของ Alfresco

Folder tree รับ path และ maxDepth และตอบ folders/tree/errors/source ตามต้นฉบับ

POST/PUT ส่ง body เป็น raw binary พร้อม Content-Type ของไฟล์ สูงสุด 100 MB ชื่อไฟล์ใช้ name/fileName ใน query หรือ X-File-Name โฟลเดอร์ปลายทางใช้ folderPath/path หรือ X-Folder-Path ไม่รับ multipart/form-data

PATCH ส่ง JSON เช่น {"name":"new-name.pdf"} หรือ field fileName

ตั้งค่าเสริม: ALFRESCO_REQUEST_TIMEOUT_MS=30000, DEFAULT_MAX_ITEMS=100, MAX_LIST_ITEMS=1000, MAX_SEARCH_ITEMS=1000, NODE_ENV=production เพื่อซ่อน error detail

## การเปลี่ยนจาก API เดิม

ยกเลิก /folders/files, /root, /sites, /children, /files, /file-names, /search-files, /object, /content, /location และ /dev-api ทั้งหมด ใช้ endpoint ในตารางแทน หน้า dev-frontend เดิมไม่ถูกเปิดให้บริการแล้ว

## ทดสอบ

รัน npm test ใช้ Alfresco จำลอง ไม่มีการเปลี่ยนข้อมูลบน Alfresco จริง
