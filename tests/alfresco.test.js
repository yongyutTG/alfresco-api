const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

test('API contract and service-account authentication against mock Alfresco', async () => {
 const calls = [];
 const object = (id, type, name, repositoryPath) => ({properties: Object.fromEntries(Object.entries({
  'cmis:objectId': id, 'cmis:baseTypeId': type, 'cmis:name': name, 'cmis:path': repositoryPath,
 }).map(([key,value]) => [key,{value}])), allowableActions: {canUpdateProperties:true,canDeleteObject:true}});
 const document = object('doc-1','cmis:document','report.pdf',null);
 const folder = object('folder-1','cmis:folder','library','/library');
 const upstream = http.createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  const chunks=[]; for await (const chunk of req) chunks.push(chunk);
  calls.push({url, auth:req.headers.authorization, method:req.method, body:Buffer.concat(chunks).toString()});
  if(url.searchParams.get('cmisselector')==='content') {res.end('file-content');return;}
  res.setHeader('Content-Type','application/json');
  if(req.method==='POST') return res.end(JSON.stringify(document));
  if(url.searchParams.get('cmisselector')==='query') return res.end(JSON.stringify({results:[document],numItems:3,hasMoreItems:true}));
  if(url.searchParams.get('cmisselector')==='children') return res.end(JSON.stringify({objects:[folder,document]}));
  if(url.pathname.includes('/nodes/')) return res.end(JSON.stringify({entry:{path:{name:'/Company Home/library'}}}));
  res.end(JSON.stringify(url.searchParams.has('objectId') ? document : folder));
 });
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 Object.assign(process.env,{ALFRESCO_HOST:`http://127.0.0.1:${upstream.address().port}`,ALFRESCO_USER:'central-test',ALFRESCO_PASS:'test-password',API_TOKEN:'read-test',WRITE_API_TOKEN:'write-test'});
 const app = require('../backend/src/app');
 const server = app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api/alfresco`;
 async function request(route,options={}) {
  const result=await fetch(base+route,{...options,headers:{Authorization:'Bearer read-test',...options.headers}});
  return {status:result.status,body:await result.json()};
 }
 try {
  assert.equal((await request('/documents',{headers:{Authorization:'Bearer invalid'}})).status,401);
  const list=await request('/documents?path=/library&maxItems=2&skipCount=1&sortBy=name&sortDirection=desc');
  assert.equal(list.status,200); assert.equal(list.body.username,'central-test'); assert.equal(list.body.nextSkipCount,2);
  assert.equal(list.body.files[0].permissions.canRename,true);
  assert.match(list.body.files[0].downloadUrl,/^\/api\/alfresco\//);
  assert.match(calls.at(-1).url.searchParams.get('q'),/ORDER BY cmis:name DESC$/);
  assert.equal((await request('/documents/search')).status,400);
  await request('/documents/search?exactName=report&maxItems=99999');
  assert.match(calls.at(-1).url.searchParams.get('q'),/report.pdf/);
  assert.equal(calls.at(-1).url.searchParams.get('maxItems'),'1000');
  assert.equal((await request('/folders?path=/library')).body.length,1);
  assert.equal((await request('/documents/location?id=doc-1')).body.parentPath,'/library');
  const write={Authorization:'Bearer write-test','Content-Type':'application/pdf'};
  assert.equal((await request('/documents?name=new.pdf',{method:'POST',headers:write,body:'pdf'})).status,201);
  assert.equal((await request('/documents/doc-1/content?name=new.pdf',{method:'PUT',headers:write,body:'replacement'})).body.updatedContent,true);
  assert.equal((await request('/documents?id=doc-1',{method:'PATCH',headers:{...write,'Content-Type':'application/json'},body:JSON.stringify({name:'renamed.pdf'})})).body.updated,true);
  assert.equal((await request('/documents/doc-1',{method:'DELETE',headers:write})).body.deleted,true);
  assert.equal((await request('/documents/doc-1',{method:'DELETE'})).status,401);
  for (const route of ['/root','/sites','/children','/files','/file-names','/search-files','/object','/content','/location','/folders/files']) {
   assert.equal((await request(route)).status,404,route);
  }
  const alias=await fetch(base.replace('/api/alfresco','/user-api/alfresco')+'/documents',{headers:{Authorization:'Bearer read-test'}});
  assert.equal(alias.status,200); await alias.json();
  assert.ok(calls.every(call=>call.auth==='Basic '+Buffer.from('central-test:test-password').toString('base64')));
 } finally { await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>upstream.close(r))]); }
});

test('business logic matches reference except configuration import and auth mode', () => {
 const reference=path.resolve(__dirname,'../../UserAlfresco-api/backend/src/modules/alfresco');
 if(!fs.existsSync(reference)) return;
 for(const name of ['controller','service','repo']) {
  const expected=fs.readFileSync(path.join(reference,`alfresco.${name}.js`),'utf8').replace('const config = require("../../config/env");','const { env: config } = require("../../config/env");').replace('mode: "user-session"','mode: "service-account"').replace(/\r\n/g,'\n');
  assert.equal(fs.readFileSync(path.resolve(__dirname,`../backend/src/modules/alfresco/alfresco.${name}.js`),'utf8').replace(/\r\n/g,'\n').trimEnd(),expected.trimEnd());
 }
});

test('all Alfresco method/path pairs match reference', () => {
 const reference=path.resolve(__dirname,'../../UserAlfresco-api/backend/src/modules/alfresco/alfresco.route.js');
 if(!fs.existsSync(reference)) return;
 const routes = file => [...fs.readFileSync(file,'utf8').matchAll(/router\.(get|post|put|patch|delete)\("([^"]+)"/g)].map(match=>match[1]+' '+match[2]).sort();
 assert.deepEqual(routes(path.resolve(__dirname,'../backend/src/modules/alfresco/alfresco.route.js')),routes(reference));
});
