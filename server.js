import express from 'express';
import multer from 'multer';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import archiver from 'archiver';
import QRCode from 'qrcode';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const privateRoot = path.resolve(process.env.NAVEDOCS_PRIVATE_DIR || root);
const dataDir = path.join(privateRoot,'data');
const storageDir = path.join(privateRoot,'storage');
for (const d of [dataDir,storageDir]) mkdirSync(d,{recursive:true});
const db = new DatabaseSync(path.join(dataDir,'navedocs.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin');
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY, protocol TEXT UNIQUE NOT NULL, citizen_name TEXT NOT NULL, cpf TEXT NOT NULL, service TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pendente', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE, original_name TEXT NOT NULL, disk_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, user_id INTEGER, request_id INTEGER, action TEXT NOT NULL, created_at TEXT NOT NULL);`);
const normalizeCpf=v=>String(v||'').replace(/\D/g,'');
function validCpf(v){ if(!/^\d{11}$/.test(v)||/^(\d)\1+$/.test(v)) return false; for(let size=9;size<=10;size++){ let sum=0;for(let i=0;i<size;i++) sum+=Number(v[i])*(size+1-i); let digit=(sum*10)%11;if(digit===10) digit=0;if(digit!==Number(v[size])) return false;}return true; }
function hashPassword(pass,salt=randomBytes(16).toString('hex')){return salt+':'+scryptSync(pass,salt,64).toString('hex');}
function checkPassword(pass,stored){const [salt,hash]=stored.split(':');const a=scryptSync(pass,salt,64),b=Buffer.from(hash,'hex');return a.length===b.length&&timingSafeEqual(a,b);}
const username=process.env.ADMIN_USER, password=process.env.ADMIN_PASSWORD;
if(!db.prepare('SELECT 1 FROM users LIMIT 1').get()){
 if(!username||!password||password.length<14||password==='SUBSTITUA_POR_SENHA_FORTE_UNICA') {console.error('Configure ADMIN_USER e ADMIN_PASSWORD (min. 14 caracteres) antes de iniciar.');process.exit(1);}
 db.prepare('INSERT INTO users(username,password_hash) VALUES (?,?)').run(username,hashPassword(password));
 console.log('Usuário administrador inicial criado.');
}
const app=express();app.disable('x-powered-by');
if(process.env.STAGING==='1') app.use((req,res,next)=>{res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');next();});
if(process.env.TRUST_PROXY==='1') app.set('trust proxy',1);
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");next();});
app.use(express.json({limit:'50kb'}));
const cookieName='navedocs_session';
function currentUser(req){let m=(req.headers.cookie||'').match(/(?:^|; )navedocs_session=([a-f0-9]{64})/);if(!m) return null;let hash=createHash('sha256').update(m[1]).digest('hex');return db.prepare('SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(hash,Date.now())||null;}
function auth(req,res,next){req.user=currentUser(req);if(!req.user)return res.status(401).json({error:'Acesse sua conta para continuar.'});next();}
function originGuard(req,res,next){if(!['POST','PATCH','PUT','DELETE'].includes(req.method))return next();let o=req.headers.origin;if(o){try{if(new URL(o).host!==req.get('host'))return res.status(403).json({error:'Origem não permitida.'});}catch{return res.status(403).json({error:'Origem inválida.'});}}next();}
app.use('/api',originGuard);
const loginAttempts=new Map();
app.post('/api/login',(req,res)=>{const key=req.ip;const now=Date.now();const v=loginAttempts.get(key)||{count:0,until:0};if(v.until>now)return res.status(429).json({error:'Muitas tentativas. Tente mais tarde.'});let u=db.prepare('SELECT * FROM users WHERE username=?').get(String(req.body.username||''));if(!u||!checkPassword(String(req.body.password||''),u.password_hash)){v.count++;v.until=v.count>=5?now+15*60*1000:0;loginAttempts.set(key,v);return res.status(401).json({error:'Usuário ou senha incorretos.'});}loginAttempts.delete(key);const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'),u.id,now+8*3600*1000);res.cookie(cookieName,token,{httpOnly:true,sameSite:'strict',secure:req.secure,maxAge:8*3600*1000,path:'/'});res.json({user:{username:u.username,role:u.role}});});
app.post('/api/logout',auth,(req,res)=>{const token=(req.headers.cookie||'').match(/(?:^|; )navedocs_session=([a-f0-9]{64})/)?.[1];if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(createHash('sha256').update(token).digest('hex'));res.clearCookie(cookieName,{path:'/'});res.json({ok:true});});
app.get('/api/me',auth,(req,res)=>res.json({user:req.user}));
const SERVICES=['Credencial de estacionamento','Defesa de autuação','Recurso de multa','Indicação de condutor','Outros documentos'];
app.get('/api/services',(req,res)=>res.json({services:SERVICES}));
const uploadAttempts=new Map();
function publicLimit(req,res,next){const now=Date.now(),key=req.ip,history=(uploadAttempts.get(key)||[]).filter(t=>t>now-60*60*1000);if(history.length>=20)return res.status(429).json({error:'Limite de envios atingido. Tente mais tarde.'});history.push(now);uploadAttempts.set(key,history);next();}
const upload=multer({storage:multer.memoryStorage(),limits:{files:8,fileSize:10*1024*1024,fields:4,parts:12,fieldSize:4096}});
function detect(buffer){if(buffer.length<16)return null;if(buffer.subarray(0,5).toString()==='%PDF-')return {mime:'application/pdf',ext:'.pdf'};if(buffer.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])))return {mime:'image/jpeg',ext:'.jpg'};if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {mime:'image/png',ext:'.png'};return null;}
function cleanup(names){for(const name of names)try{unlinkSync(path.join(storageDir,name));}catch{}}
app.post('/api/requests', (req,res,next)=>{if(process.env.STAGING==='1' && process.env.ENABLE_TEST_UPLOADS!=='1')return res.status(503).json({error:'Ambiente de demonstração: recebimento desativado. Não envie dados reais.'});next();},publicLimit,upload.array('documents',8),(req,res)=>{const cpf=normalizeCpf(req.body.cpf),name=String(req.body.name||'').trim(),service=String(req.body.service||'');const files=req.files||[];
 if(name.length<3||name.length>120||!validCpf(cpf)||!SERVICES.includes(service)||!files.length)return res.status(400).json({error:'Confira nome, CPF, tipo de solicitação e anexos.'});
 if(files.some(f=>!detect(f.buffer)))return res.status(400).json({error:'Arquivos aceitos: PDF, JPG e PNG válidos.'});
 const inserted=[];let id;const now=new Date().toISOString();const protocol='NAV-'+new Date().getUTCFullYear()+'-'+randomBytes(5).toString('hex').toUpperCase();
 try{db.exec('BEGIN IMMEDIATE');let a=db.prepare('INSERT INTO requests(protocol,citizen_name,cpf,service,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(protocol,name,cpf,service,now,now);id=Number(a.lastInsertRowid);
 for(const f of files){const sig=detect(f.buffer);const filename=randomBytes(20).toString('hex')+sig.ext;requireWrite(filename,f.buffer);inserted.push(filename);db.prepare('INSERT INTO files(request_id,original_name,disk_name,mime,size) VALUES (?,?,?,?,?)').run(id,path.basename(f.originalname).slice(0,180),filename,sig.mime,f.size);}
 db.exec('COMMIT');return res.status(201).json({protocol});}catch(e){try{db.exec('ROLLBACK');}catch{}cleanup(inserted);console.error('Erro no envio',e);return res.status(500).json({error:'Não foi possível receber os documentos. Tente novamente.'});}
});
function requireWrite(name,buf){const {writeFileSync}=fsOps;writeFileSync(path.join(storageDir,name),buf,{flag:'wx',mode:0o600});}
import * as fsOps from 'node:fs';
app.get('/api/requests',auth,(req,res)=>{const search=String(req.query.q||'').trim().slice(0,120),status=String(req.query.status||''),start=String(req.query.start||''),end=String(req.query.end||'');let conditions=[],args=[];if(search){conditions.push('(citizen_name LIKE ? OR cpf LIKE ? OR protocol LIKE ?)');args.push(...Array(3).fill('%'+search+'%'));}if(['pendente','em_analise','concluido'].includes(status)){conditions.push('status=?');args.push(status);}if(/^\d{4}-\d{2}-\d{2}$/.test(start)){conditions.push('created_at>=?');args.push(start+'T00:00:00');}if(/^\d{4}-\d{2}-\d{2}$/.test(end)){conditions.push('created_at<?');args.push(end+'T23:59:59.999Z');}const where=conditions.length?'WHERE '+conditions.join(' AND '):'';const items=db.prepare(`SELECT id,protocol,citizen_name,cpf,service,status,created_at,(SELECT COUNT(*) FROM files WHERE request_id=requests.id) as file_count FROM requests ${where} ORDER BY created_at DESC LIMIT 500`).all(...args);res.json({items});});
app.get('/api/dashboard',auth,(req,res)=>{const start=String(req.query.start||''),end=String(req.query.end||'');let where='',args=[];if(/^\d{4}-\d{2}-\d{2}$/.test(start)){where+=' AND created_at>=?';args.push(start+'T00:00:00');}if(/^\d{4}-\d{2}-\d{2}$/.test(end)){where+=' AND created_at<=?';args.push(end+'T23:59:59.999Z');}let totals=db.prepare(`SELECT count(*) total,sum(CASE WHEN status='pendente' THEN 1 ELSE 0 END) pending,sum(CASE WHEN status='em_analise' THEN 1 ELSE 0 END) analyzing,sum(CASE WHEN status='concluido' THEN 1 ELSE 0 END) done FROM requests WHERE 1=1 ${where}`).get(...args);let monthly=db.prepare(`SELECT substr(created_at,1,7) label,count(*) value FROM requests WHERE 1=1 ${where} GROUP BY label ORDER BY label`).all(...args);let services=db.prepare(`SELECT service label,count(*) value FROM requests WHERE 1=1 ${where} GROUP BY service ORDER BY value DESC`).all(...args);res.json({totals,monthly,services});});
function findRequest(req,res,next){req.entry=db.prepare('SELECT * FROM requests WHERE id=?').get(Number(req.params.id));if(!req.entry)return res.status(404).json({error:'Solicitação não encontrada.'});next();}
app.get('/api/requests/:id',auth,findRequest,(req,res)=>{const files=db.prepare('SELECT id,original_name,mime,size FROM files WHERE request_id=?').all(req.entry.id);res.json({entry:req.entry,files});});
app.patch('/api/requests/:id',auth,findRequest,(req,res)=>{if(!['pendente','em_analise','concluido'].includes(req.body.status))return res.status(400).json({error:'Status inválido.'});db.prepare('UPDATE requests SET status=?,updated_at=? WHERE id=?').run(req.body.status,new Date().toISOString(),req.entry.id);db.prepare('INSERT INTO audit(user_id,request_id,action,created_at) VALUES (?,?,?,?)').run(req.user.id,req.entry.id,'status:'+req.body.status,new Date().toISOString());res.json({ok:true});});
function getFile(req,res,next){req.fileInfo=db.prepare('SELECT f.* FROM files f JOIN requests r ON r.id=f.request_id WHERE f.id=? AND r.id=?').get(Number(req.params.fileId),Number(req.params.id));if(!req.fileInfo)return res.status(404).json({error:'Arquivo não encontrado.'});next();}
app.get('/api/requests/:id/files/:fileId',auth,getFile,(req,res)=>{const f=req.fileInfo;res.setHeader('Content-Type',f.mime);res.setHeader('Content-Disposition',(req.query.download==='1'?'attachment':'inline')+'; filename="documento'+path.extname(f.disk_name)+'"');res.setHeader('Cache-Control','private, no-store');res.sendFile(path.join(storageDir,f.disk_name));});
app.get('/api/requests/:id/zip',auth,findRequest,(req,res)=>{const files=db.prepare('SELECT * FROM files WHERE request_id=?').all(req.entry.id);res.set('Content-Type','application/zip');res.set('Content-Disposition',`attachment; filename="${req.entry.protocol}.zip"`);const zip=archiver('zip',{zlib:{level:6}});zip.on('error',()=>res.destroy());zip.pipe(res);files.forEach((f,i)=>zip.file(path.join(storageDir,f.disk_name),{name:String(i+1).padStart(2,'0')+'-'+path.basename(f.original_name).replace(/[^\w.\- ]/g,'_')}));zip.finalize();});
app.get('/api/requests/:id/merged.pdf',auth,findRequest,async(req,res)=>{const files=db.prepare('SELECT * FROM files WHERE request_id=?').all(req.entry.id);try{const doc=await PDFDocument.create();for(const f of files){const buf=readFileSync(path.join(storageDir,f.disk_name));if(f.mime==='application/pdf'){const source=await PDFDocument.load(buf);const pages=await doc.copyPages(source,source.getPageIndices());pages.forEach(p=>doc.addPage(p));}else{const im=f.mime==='image/png'?await doc.embedPng(buf):await doc.embedJpg(buf);const p=doc.addPage([595.28,841.89]);const scale=Math.min(545/im.width,790/im.height);p.drawImage(im,{x:(595.28-im.width*scale)/2,y:(841.89-im.height*scale)/2,width:im.width*scale,height:im.height*scale});}}const bytes=await doc.save();res.set('Content-Type','application/pdf');res.set('Content-Disposition',`attachment; filename="${req.entry.protocol}.pdf"`);res.send(Buffer.from(bytes));}catch(e){console.error('Falha ao unir PDFs',e);res.status(422).json({error:'Não foi possível unir os arquivos. Verifique se os PDFs são válidos e não possuem senha.'});}});
app.get('/api/qr.svg',auth,async(req,res)=>{const url=`${req.protocol}://${req.get('host')}/`;res.type('image/svg+xml').send(await QRCode.toString(url,{type:'svg',margin:2,color:{dark:'#173354',light:'#ffffff'}}));});
app.use(express.static(path.join(root,'public'),{index:'index.html',maxAge:0}));app.get('/admin',(req,res)=>res.sendFile(path.join(root,'public/admin.html')));
app.use((err,req,res,next)=>{if(err instanceof multer.MulterError)return res.status(400).json({error:'Limite de arquivos excedido (máximo 8 arquivos de até 10 MB cada).'});console.error(err);res.status(500).json({error:'Erro interno.'});});
app.listen(port,()=>console.log(`NAVEDOCS disponível em http://localhost:${port}`));
