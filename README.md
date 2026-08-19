# Alfresco API Gateway

เอกสารสำหรับ dev ภายนอก: [API_SPEC.md](API_SPEC.md)

Node.js API สำหรับเรียก Alfresco Community 4.2.0 ผ่าน CMIS Browser Binding

## Run

```bash
cd C:\xampp\htdocs\alfresco-api
npm start
```

หน้าเว็บ:

```text
http://localhost:3005/
```


## Bearer Token

ทุก endpoint ใต้ `/api/alfresco/*` ต้องแนบ Bearer token ใน header:

```http
Authorization: Bearer YOUR_API_TOKEN
```

ค่า token อ่านจากไฟล์ `.env`:

```env
API_TOKEN=your_bearer_token
WRITE_API_TOKEN=your_write_bearer_token
```

สำหรับ endpoint ที่แก้ไขข้อมูล เช่น upload, rename, delete ต้องใช้ `WRITE_API_TOKEN` แทน `API_TOKEN`

ตัวอย่างเรียกด้วย JavaScript:

```js
fetch("http://localhost:3005/api/alfresco/folders?path=/Sites/tg-saving/documentLibrary", {
  headers: {
    Authorization: "Bearer YOUR_API_TOKEN",
  },
});
```

ถ้าไม่ส่ง token หรือ token ผิด API จะตอบ:

```json
{ "message": "Unauthorized: missing or invalid Bearer token" }
```

## RESTful API Paths

| Method | Path | ความหมาย |
|---|---|---|
| GET | `/api/health` | ตรวจสอบว่า Node API ต่อ Alfresco ได้ และดู version ของ Alfresco |
| GET | `/api/alfresco/folders?path=/Sites/tg-saving/documentLibrary` | แสดงรายการโฟลเดอร์ย่อยใต้ path ที่ส่งมา เช่นรายชื่อแผนกใต้ `documentLibrary` |
| GET | `/api/alfresco/folders/files?path=/Sites/tg-saving/documentLibrary/การเงิน&maxItems=100&skipCount=0` | แสดงไฟล์ทั้งหมดใต้โฟลเดอร์ที่ระบุ รวมไฟล์ในโฟลเดอร์ย่อย ใช้แบ่งหน้าได้ |
| GET | `/api/alfresco/documents?folderPath=/Sites/tg-saving/documentLibrary/การเงิน&maxItems=100&skipCount=0` | แสดงเอกสารทั้งหมดในโฟลเดอร์ที่ระบุ รวมโฟลเดอร์ย่อย |
| GET | `/api/alfresco/documents?folderPath=/Sites/tg-saving/documentLibrary/การเงิน&q=026277&maxItems=100` | ค้นหาเอกสารจากชื่อไฟล์แบบ LIKE |
| GET | `/api/alfresco/documents?folderPath=/Sites/tg-saving/documentLibrary/การเงิน&exactName=23017_116969.pdf&maxItems=100` | ค้นหาชื่อไฟล์เต็มแบบ `=` |
| GET | `/api/alfresco/documents/:id/content?name=file.pdf` | เปิดหรือดาวน์โหลดไฟล์ด้วย document id |
| POST | `/api/alfresco/documents` | อัปโหลดไฟล์ ใช้ `WRITE_API_TOKEN` |
| PATCH | `/api/alfresco/documents/:id` | แก้ชื่อไฟล์ ใช้ `WRITE_API_TOKEN` |
| DELETE | `/api/alfresco/documents/:id` | ลบไฟล์ ใช้ `WRITE_API_TOKEN` |

## ตัวอย่างใช้งาน

โหลดรายชื่อโฟลเดอร์ใต้ documentLibrary:

```text
http://localhost:3005/api/alfresco/folders?path=/Sites/tg-saving/documentLibrary
```

โหลดไฟล์ใน folder การเงิน:

```text
http://localhost:3005/api/alfresco/documents?folderPath=/Sites/tg-saving/documentLibrary/การเงิน&maxItems=100
```

ค้นหาไฟล์ใน folder การเงิน:

```text
http://localhost:3005/api/alfresco/documents?folderPath=/Sites/tg-saving/documentLibrary/การเงิน&q=026277&maxItems=10
```

ค้นหาไฟล์แบบชื่อเต็ม:

```text
http://localhost:3005/api/alfresco/documents?folderPath=/Sites/tg-saving/documentLibrary/การเงิน&exactName=23017_116969.pdf&maxItems=10
```

หมายเหตุ: `q`, `keyword`, `name` ใช้ CMIS `LIKE` สำหรับค้นบางส่วน ส่วน `exactName` หรือ `fileName` ใช้ `cmis:name = ...` สำหรับชื่อไฟล์เต็ม เหมือน `UserAlfresco-api`

เปิดไฟล์:

```text
http://localhost:3005/api/alfresco/documents/7b815e16-a594-4864-9665-cfda64e8d880%3B1.0/content?name=026277_019376_001-21-00661-5.pdf
```

อัปโหลดไฟล์:

```http
POST http://localhost:3005/api/alfresco/documents
Authorization: Bearer <WRITE_API_TOKEN>
Content-Type: multipart/form-data

folderPath=/Sites/tg-saving/documentLibrary/การเงิน
file=<เลือกไฟล์>
name=optional-file-name.pdf
```

แก้ชื่อไฟล์:

```http
PATCH http://localhost:3005/api/alfresco/documents/<DOCUMENT_ID>
Authorization: Bearer <WRITE_API_TOKEN>
Content-Type: application/json

{
  "name": "new-file-name.pdf"
}
```

ลบไฟล์:

```http
DELETE http://localhost:3005/api/alfresco/documents/<DOCUMENT_ID>
Authorization: Bearer <WRITE_API_TOKEN>
```

## Response สำคัญ

`/api/alfresco/documents` จะคืนค่าประมาณนี้:

```json
{
  "path": "/Sites/tg-saving/documentLibrary/การเงิน",
  "count": 100,
  "total": 53000,
  "hasMoreItems": true,
  "nextSkipCount": 100,
  "files": []
}
```

ความหมาย:

- `count` จำนวนรายการที่คืนมาในหน้านี้
- `total` จำนวนรายการทั้งหมดที่ Alfresco แจ้งกลับมา
- `hasMoreItems` มีหน้าถัดไปหรือไม่
- `nextSkipCount` ค่า `skipCount` สำหรับหน้าถัดไป
- `files[].downloadUrl` URL สำหรับเปิดหรือดาวน์โหลดไฟล์

## Legacy API Paths

ยังเก็บไว้เพื่อไม่ให้ URL เดิมพัง แต่แนะนำให้ใช้ RESTful API ด้านบนแทน

| Method | Path | ความหมาย |
|---|---|---|
| GET | `/api/alfresco/root` | แสดง item ที่ root ของ repository |
| GET | `/api/alfresco/sites` | แสดง site ใต้ `/Sites` |
| GET | `/api/alfresco/children?path=/Sites/tg-saving/documentLibrary` | แสดง item ใต้ path ที่ระบุ ทั้ง folder และ file |
| GET | `/api/alfresco/files?path=/Sites/tg-saving/documentLibrary/การเงิน` | แสดงไฟล์ทั้งหมดใต้ path ที่ระบุ |
| GET | `/api/alfresco/file-names?path=/Sites/tg-saving/documentLibrary/การเงิน` | แสดงเฉพาะชื่อไฟล์ |
| GET | `/api/alfresco/search-files?path=/Sites/tg-saving/documentLibrary/การเงิน&q=026277` | ค้นหาชื่อไฟล์แบบ route เดิม ใช้ LIKE |
| GET | `/api/alfresco/search-files?path=/Sites/tg-saving/documentLibrary/การเงิน&exactName=23017_116969.pdf` | ค้นหาชื่อไฟล์เต็มแบบ route เดิม ใช้ `=` |
| GET | `/api/alfresco/content?id=DOCUMENT_ID&name=file.pdf` | เปิดหรือดาวน์โหลดไฟล์แบบ route เดิม |

## Environment Variables

สร้างไฟล์ `.env` ที่ `C:\xampp\htdocs\alfresco-api\.env`

```env
ALFRESCO_HOST=IP server
ALFRESCO_USER=your_user
ALFRESCO_PASS=your_password
PORT=3005
API_TOKEN=read_token
WRITE_API_TOKEN=write_token
```

หลังแก้ `.env` ต้อง restart Node API

## Apache / XAMPP Reverse Proxy

เปิด modules ใน `C:\xampp\apache\conf\httpd.conf`:

```apache
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
```

เพิ่ม config:

```apache
ProxyPreserveHost On
ProxyPass /node-api http://localhost:3005
ProxyPassReverse /node-api http://localhost:3005
```

Restart Apache แล้วเรียกผ่าน Apache เช่น:

```text
http://localhost/node-api/api/alfresco/folders?path=/Sites/tg-saving/documentLibrary
```
