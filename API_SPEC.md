# Alfresco API Gateway - External Developer Spec

เอกสารนี้สำหรับ dev ภายนอกที่ต้องเรียกใช้ API เพื่อดึง folder, ค้นหาไฟล์ และเปิดไฟล์จาก Alfresco ผ่าน Node.js API Gateway

> Dev ภายนอกไม่ต้องเรียก Alfresco `{IP Server}` โดยตรง ให้เรียกผ่าน API Gateway เท่านั้น

## 1. Base URL

Production / internal gateway URL ให้ใช้ตามที่ผู้ดูแลระบบแจ้ง เช่น:

```text
http://localhost:3000
```

ถ้านำไปวางหลัง Apache Reverse Proxy อาจเป็น:

```text
http://your-domain/node-api
```

ตัวอย่างในเอกสารนี้ใช้:

```text
http://localhost:3000
```

## 2. Authentication

ทุก endpoint ใต้ `/api/alfresco/*` ต้องส่ง Bearer token ใน HTTP Header

```http
Authorization: Bearer <API_TOKEN>
```

ตัวอย่าง:

```http
Authorization: Bearer xxxxxxxxxxxxxxxxxxxx
```

ถ้าไม่ส่ง token หรือ token ไม่ถูกต้อง จะได้ response:

```json
{
  "message": "Unauthorized: missing or invalid Bearer token"
}
```

หมายเหตุ:

- Token จะออกให้โดยเจ้าของระบบ
- ห้าม hardcode token ใน frontend สาธารณะ
- Dev ภายนอกควรเก็บ token ใน backend/env ของระบบตัวเอง

## 3. Content Type

สำหรับ endpoint ที่คืน JSON:

```http
Accept: application/json
```

สำหรับ endpoint เปิดไฟล์ PDF/content จะคืน binary stream ตาม MIME type ของไฟล์ เช่น `application/pdf`

## 4. Endpoint Summary

| Method | Endpoint | ใช้ทำอะไร |
|---|---|---|
| GET | `/api/health` | ตรวจว่า API Gateway ต่อ Alfresco ได้หรือไม่ |
| GET | `/api/alfresco/folders` | ดูรายชื่อ folder ใต้ path ที่ระบุ |
| GET | `/api/alfresco/folders/files` | ดูไฟล์ทั้งหมดใต้ folder รวม subfolder |
| GET | `/api/alfresco/documents` | ดูไฟล์หรือค้นหาไฟล์ใน folder รวม subfolder |
| GET | `/api/alfresco/documents/:id/content` | เปิด/ดาวน์โหลดไฟล์ด้วย document id |

## 5. Endpoint Details

## 5.1 Health Check

ตรวจว่า Node API Gateway ต่อ Alfresco ได้หรือไม่

```http
GET /api/health
```

Authentication:

- ไม่ต้องส่ง Bearer token

Example Request:

```http
GET http://localhost:3000/api/health
```

Success Response:

```json
{
  "ok": true,
  "alfresco": {
    "data": {
      "edition": "Community",
      "version": "4.2.0 (r56674-b4848)",
      "schema": "6033"
    }
  }
}
```

Error Example:

```json
{
  "message": "Cannot connect to Alfresco",
  "status": 500,
  "error": "connect ETIMEDOUT {IP Server}:80"
}
```

## 5.2 List Folders

ดูรายชื่อ folder ย่อยใต้ path ที่ส่งมา

```http
GET /api/alfresco/folders?path=<folderPath>
```

Authentication:

```http
Authorization: Bearer <API_TOKEN>
```

Query Parameters:

| Parameter | Required | Type | Example | ความหมาย |
|---|---:|---|---|---|
| `path` | No | string | `/Sites/tg-saving/documentLibrary` | path ของ folder ที่ต้องการดู folder ย่อย ถ้าไม่ส่งจะใช้ `/` |

Example Request:

```http
GET http://localhost:3000/api/alfresco/folders?path=/Sites/tg-saving/documentLibrary
Authorization: Bearer <API_TOKEN>
```

Success Response:

```json
[
  {
    "id": "732d5237-699b-4dea-b994-0d36000a7bae",
    "name": "การเงิน",
    "path": "/Sites/tg-saving/documentLibrary/การเงิน",
    "type": "cmis:folder",
    "objectTypeId": "cmis:folder",
    "isFolder": true,
    "isDocument": false,
    "createdBy": "admin",
    "creationDate": 1710000000000,
    "lastModifiedBy": "admin",
    "lastModificationDate": 1710000000000
  }
]
```

Response Fields:

| Field | Type | ความหมาย |
|---|---|---|
| `id` | string | Alfresco object id ของ folder |
| `name` | string | ชื่อ folder |
| `path` | string | path เต็มของ folder ใช้ส่งต่อไป endpoint documents ได้ |
| `type` | string | base type จาก CMIS เช่น `cmis:folder` |
| `objectTypeId` | string | object type ของ Alfresco/CMIS |
| `isFolder` | boolean | เป็น folder หรือไม่ |
| `isDocument` | boolean | เป็น document หรือไม่ |
| `createdBy` | string | ผู้สร้าง |
| `creationDate` | number/string | วันที่สร้างจาก Alfresco |
| `lastModifiedBy` | string | ผู้แก้ไขล่าสุด |
| `lastModificationDate` | number/string | วันที่แก้ไขล่าสุด |

## 5.3 List Files In Folder

ดูไฟล์ทั้งหมดใต้ folder ที่ระบุ รวมไฟล์ใน subfolder ด้วย

```http
GET /api/alfresco/folders/files?path=<folderPath>&maxItems=<number>&skipCount=<number>
```

Authentication:

```http
Authorization: Bearer <API_TOKEN>
```

Query Parameters:

| Parameter | Required | Type | Default | Example | ความหมาย |
|---|---:|---|---|---|---|
| `path` | No | string | `/Sites/tg-saving/documentLibrary/การเงิน` | `/Sites/tg-saving/documentLibrary/การเงิน` | folder path ที่ต้องการดึงไฟล์ |
| `maxItems` | No | number | `1000` | `100` | จำนวนรายการต่อหน้า สูงสุดที่ระบบจำกัดไว้ 60000 |
| `skipCount` | No | number | `0` | `0` | จำนวนรายการที่ข้าม ใช้ทำ pagination |

Example Request:

```http
GET http://localhost:3000/api/alfresco/folders/files?path=/Sites/tg-saving/documentLibrary/การเงิน&maxItems=100&skipCount=0
Authorization: Bearer <API_TOKEN>
```

Success Response:

```json
{
  "path": "/Sites/tg-saving/documentLibrary/การเงิน",
  "folderId": "folder-object-id",
  "count": 100,
  "total": 53000,
  "hasMoreItems": true,
  "maxItems": 100,
  "skipCount": 0,
  "nextSkipCount": 100,
  "files": [
    {
      "id": "7b815e16-a594-4864-9665-cfda64e8d880;1.0",
      "name": "026277_019376_001-21-00661-5.pdf",
      "path": null,
      "type": "cmis:document",
      "objectTypeId": "cmis:document",
      "isFolder": false,
      "isDocument": true,
      "mimeType": "application/pdf",
      "size": 123456,
      "createdBy": "admin",
      "creationDate": 1710000000000,
      "lastModifiedBy": "admin",
      "lastModificationDate": 1710000000000,
      "title": null,
      "description": null,
      "downloadUrl": "/api/alfresco/documents/7b815e16-a594-4864-9665-cfda64e8d880%3B1.0/content?name=026277_019376_001-21-00661-5.pdf"
    }
  ]
}
```

## 5.4 List/Search Documents

Endpoint หลักที่แนะนำให้ dev ใช้ สำหรับ list และ search ไฟล์ใน folder

```http
GET /api/alfresco/documents?folderPath=<folderPath>&q=<keyword>&maxItems=<number>&skipCount=<number>
```

Authentication:

```http
Authorization: Bearer <API_TOKEN>
```

Query Parameters:

| Parameter | Required | Type | Default | Example | ความหมาย |
|---|---:|---|---|---|---|
| `folderPath` | No | string | `/Sites/tg-saving/documentLibrary/การเงิน` | `/Sites/tg-saving/documentLibrary/การเงิน` | folder path ที่ต้องการดึง/ค้นหาไฟล์ |
| `path` | No | string | - | `/Sites/tg-saving/documentLibrary/การเงิน` | alias ของ `folderPath` ใช้แทนกันได้ |
| `q` | No | string | - | `026277` | keyword สำหรับค้นจากชื่อไฟล์ ถ้าไม่ส่งจะ list ไฟล์ทั้งหมด |
| `keyword` | No | string | - | `026277` | alias ของ `q` |
| `name` | No | string | - | `026277` | alias ของ `q` |
| `maxItems` | No | number | ถ้า list default `1000`, ถ้า search default `100` | `100` | จำนวนรายการต่อหน้า |
| `skipCount` | No | number | `0` | `0` | จำนวนรายการที่ข้าม ใช้ pagination |

List Example:

```http
GET http://localhost:3000/api/alfresco/documents?folderPath=/Sites/tg-saving/documentLibrary/การเงิน&maxItems=100&skipCount=0
Authorization: Bearer <API_TOKEN>
```

Search Example:

```http
GET http://localhost:3000/api/alfresco/documents?folderPath=/Sites/tg-saving/documentLibrary/การเงิน&q=026277&maxItems=20&skipCount=0
Authorization: Bearer <API_TOKEN>
```

Success Response:

```json
{
  "path": "/Sites/tg-saving/documentLibrary/การเงิน",
  "folderId": "folder-object-id",
  "q": "026277",
  "count": 1,
  "total": 1,
  "hasMoreItems": false,
  "maxItems": 20,
  "skipCount": 0,
  "nextSkipCount": null,
  "files": [
    {
      "id": "7b815e16-a594-4864-9665-cfda64e8d880;1.0",
      "name": "026277_019376_001-21-00661-5.pdf",
      "type": "cmis:document",
      "objectTypeId": "cmis:document",
      "isFolder": false,
      "isDocument": true,
      "mimeType": "application/pdf",
      "size": 123456,
      "createdBy": "admin",
      "creationDate": 1710000000000,
      "lastModifiedBy": "admin",
      "lastModificationDate": 1710000000000,
      "downloadUrl": "/api/alfresco/documents/7b815e16-a594-4864-9665-cfda64e8d880%3B1.0/content?name=026277_019376_001-21-00661-5.pdf"
    }
  ]
}
```

Pagination:

ถ้า response ได้:

```json
{
  "hasMoreItems": true,
  "nextSkipCount": 100
}
```

ให้เรียกหน้าถัดไปโดยส่ง:

```text
skipCount=100
```

ตัวอย่าง:

```http
GET /api/alfresco/documents?folderPath=/Sites/tg-saving/documentLibrary/การเงิน&maxItems=100&skipCount=100
```

## 5.5 Download/Open Document Content

เปิดหรือดาวน์โหลดไฟล์ด้วย document id

```http
GET /api/alfresco/documents/:id/content?name=<fileName>
```

Authentication:

```http
Authorization: Bearer <API_TOKEN>
```

Path Parameters:

| Parameter | Required | Type | Example | ความหมาย |
|---|---:|---|---|---|
| `id` | Yes | string | `7b815e16-a594-4864-9665-cfda64e8d880;1.0` | document id จาก `files[].id` |

Query Parameters:

| Parameter | Required | Type | Example | ความหมาย |
|---|---:|---|---|---|
| `name` | No | string | `file.pdf` | ชื่อไฟล์ที่ใช้ใน response header |

Important:

ถ้า `id` มีเครื่องหมาย `;` ให้ URL encode เป็น `%3B`

```text
7b815e16-a594-4864-9665-cfda64e8d880;1.0
```

ต้องเรียกเป็น:

```text
7b815e16-a594-4864-9665-cfda64e8d880%3B1.0
```

Example Request:

```http
GET http://localhost:3000/api/alfresco/documents/7b815e16-a594-4864-9665-cfda64e8d880%3B1.0/content?name=file.pdf
Authorization: Bearer <API_TOKEN>
```

Success Response:

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: inline; filename="file.pdf"

<binary file stream>
```

ใน Postman ให้ใช้ `Send and Download` ถ้าต้องการบันทึกไฟล์

## 6. Error Response Format

รูปแบบ error กลางของระบบ:

```json
{
  "message": "Cannot list Alfresco documents",
  "status": 500,
  "error": "connect ETIMEDOUT {IP Server}:80"
}
```

Common Errors:

| HTTP Status | สาเหตุ | วิธีตรวจสอบ |
|---:|---|---|
| `401` | ไม่ส่ง Bearer token หรือ token ผิด | ตรวจ Header `Authorization` |
| `403` | เรียก `/dev-api/*` จากเครื่องอื่นที่ไม่ใช่ localhost | Dev ภายนอกต้องใช้ `/api/alfresco/*` เท่านั้น |
| `400` | parameter ไม่ครบ เช่น document id ไม่ถูกต้อง | ตรวจ URL/path/query |
| `404` | path หรือ id ไม่พบใน Alfresco | ตรวจ folderPath หรือ document id |
| `500` | API Gateway ต่อ Alfresco ไม่ได้ หรือ Alfresco error | เช็ก `/api/health` และ Alfresco server |

## 7. Recommended External Dev Flow

1. เรียก health check

```http
GET /api/health
```

2. ดึงรายชื่อ folder ใต้ document library

```http
GET /api/alfresco/folders?path=/Sites/tg-saving/documentLibrary
Authorization: Bearer <API_TOKEN>
```

3. ให้ user เลือก folder จาก response `path`

4. List หรือ search เอกสารใน folder ที่เลือก

```http
GET /api/alfresco/documents?folderPath=<selectedFolderPath>&q=<keyword>&maxItems=100&skipCount=0
Authorization: Bearer <API_TOKEN>
```

5. เปิดไฟล์จาก `files[].downloadUrl` หรือประกอบ URL เองจาก `files[].id`

```http
GET /api/alfresco/documents/:id/content?name=file.pdf
Authorization: Bearer <API_TOKEN>
```

## 8. JavaScript Fetch Examples

List folders:

```js
const baseUrl = "http://localhost:3000";
const token = process.env.ALFRESCO_API_TOKEN;

const res = await fetch(`${baseUrl}/api/alfresco/folders?path=/Sites/tg-saving/documentLibrary`, {
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  },
});

const folders = await res.json();
console.log(folders);
```

Search documents:

```js
const folderPath = "/Sites/tg-saving/documentLibrary/การเงิน";
const q = "026277";

const url = new URL(`${baseUrl}/api/alfresco/documents`);
url.searchParams.set("folderPath", folderPath);
url.searchParams.set("q", q);
url.searchParams.set("maxItems", "20");
url.searchParams.set("skipCount", "0");

const res = await fetch(url, {
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  },
});

const result = await res.json();
console.log(result.files);
```

Download file:

```js
const documentId = "7b815e16-a594-4864-9665-cfda64e8d880;1.0";
const fileName = "file.pdf";

const url = `${baseUrl}/api/alfresco/documents/${encodeURIComponent(documentId)}/content?name=${encodeURIComponent(fileName)}`;

const res = await fetch(url, {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

const buffer = await res.arrayBuffer();
```

## 9. Postman Setup

แนะนำให้สร้าง Environment ใน Postman:

| Variable | Example |
|---|---|
| `baseUrl` | `http://localhost:3000` |
| `token` | `<API_TOKEN>` |
| `documentLibraryPath` | `/Sites/tg-saving/documentLibrary` |
| `folderPath` | `/Sites/tg-saving/documentLibrary/การเงิน` |

Authorization tab:

```text
Type: Bearer Token
Token: {{token}}
```

Example Postman URLs:

```text
{{baseUrl}}/api/alfresco/folders?path={{documentLibraryPath}}
```

```text
{{baseUrl}}/api/alfresco/documents?folderPath={{folderPath}}&q=026277&maxItems=20&skipCount=0
```

```text
{{baseUrl}}/api/alfresco/documents/7b815e16-a594-4864-9665-cfda64e8d880%3B1.0/content?name=file.pdf
```

## 10. Notes For External Devs

- ให้ใช้ `/api/alfresco/*` เท่านั้น
- ห้ามใช้ `/dev-api/alfresco/*` เพราะเป็น local-only สำหรับหน้า demo
- ห้ามเรียก Alfresco server โดยตรง
- ทุก path ที่มีภาษาไทยให้ส่งเป็น URL encoded หรือให้ client library encode ให้อัตโนมัติ
- `downloadUrl` ที่ response คืนมาเป็น path ภายใน API Gateway ยังต้องแนบ Bearer token เวลาเรียก
- สิทธิ์การเห็นไฟล์ขึ้นกับ user/service account ที่ API Gateway ใช้ต่อ Alfresco
