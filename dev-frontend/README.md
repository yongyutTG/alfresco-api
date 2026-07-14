# Dev Alfresco Frontend

Frontend ตัวอย่างสำหรับ dev ใช้ดูรายการไฟล์โดยไม่ต้องกรอก Bearer token ในหน้าเว็บ

## เปิดใช้งาน

```text
http://localhost:3000/dev-frontend/
```

## Flow ของหน้า Demo

หน้าเว็บนี้เรียกผ่าน proxy ภายในที่จำกัดเฉพาะ localhost:

```text
/dev-frontend -> /dev-api/alfresco/* -> Alfresco
```

Browser ไม่เห็น Bearer token และไม่ต้องแนบ token เอง

## สำหรับ External Dev ต้องใช้ API เส้นไหน

External dev หรือระบบอื่น **ห้ามใช้** `/dev-api/alfresco/*` เพราะเป็น proxy สำหรับหน้า demo local เท่านั้น

External dev ให้ใช้ `/api/alfresco/*` และต้องแนบ header นี้ทุก request:

```http
Authorization: Bearer <API_TOKEN>
```

| ใช้ทำอะไร | Method | API path สำหรับ external dev |
|---|---|---|
| โหลดรายชื่อ folder ใต้ documentLibrary | GET | `/api/alfresco/folders?path=/Sites/tg-saving/documentLibrary` |
| โหลดไฟล์ทั้งหมดใต้ folder ที่เลือก | GET | `/api/alfresco/folders/files?path=/Sites/tg-saving/documentLibrary/การเงิน&maxItems=100&skipCount=0` |
| โหลดเอกสารทั้งหมด หรือค้นหาเอกสารด้วยชื่อไฟล์ | GET | `/api/alfresco/documents?folderPath=/Sites/tg-saving/documentLibrary/การเงิน&q=026277&maxItems=100&skipCount=0` |
| เปิดหรือดาวน์โหลดไฟล์ | GET | `/api/alfresco/documents/:id/content?name=file.pdf` |

## ตัวอย่าง External Dev Request

โหลด folder:

```js
fetch("http://localhost:3000/api/alfresco/folders?path=/Sites/tg-saving/documentLibrary", {
  headers: {
    Authorization: "Bearer <API_TOKEN>",
  },
});
```

ค้นหาไฟล์:

```js
fetch("http://localhost:3000/api/alfresco/documents?folderPath=/Sites/tg-saving/documentLibrary/การเงิน&q=026277&maxItems=10", {
  headers: {
    Authorization: "Bearer <API_TOKEN>",
  },
});
```

เปิดไฟล์ PDF:

```js
fetch("http://localhost:3000/api/alfresco/documents/7b815e16-a594-4864-9665-cfda64e8d880%3B1.0/content?name=file.pdf", {
  headers: {
    Authorization: "Bearer <API_TOKEN>",
  },
});
```

## API ที่หน้า Demo เรียกเอง

หน้า demo นี้ใช้เส้น local-only proxy:

```http
GET /dev-api/alfresco/folders?path=/Sites/tg-saving/documentLibrary
GET /dev-api/alfresco/documents?folderPath=/Sites/tg-saving/documentLibrary/การเงิน&q=026277&maxItems=100
GET /dev-api/alfresco/documents/:id/content?name=file.pdf
```
