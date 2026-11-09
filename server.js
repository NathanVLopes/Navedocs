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
// Tabela adicional; não altera solicitações existentes nem exige migração destrutiva.
db.exec(`CREATE TABLE IF NOT EXISTS detran_contingencies (
 id INTEGER PRIMARY KEY,
 request_id INTEGER NOT NULL UNIQUE REFERENCES requests(id),
 code TEXT NOT NULL UNIQUE,
 reason TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 external_protocol TEXT,
 external_recorded_by INTEGER REFERENCES users(id),
 external_recorded_at TEXT
);`);
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
// Conta administrativa adicional: credenciais somente em variáveis do Railway.
// Não altera contas existentes nem substitui dados persistidos.
const extraAdminUser=String(process.env.NAVEDOCS_EXTRA_ADMIN_USER||'').trim();
const extraAdminPassword=process.env.NAVEDOCS_EXTRA_ADMIN_PASSWORD||'';
if(extraAdminUser||extraAdminPassword){
  if(!/^[A-Za-z0-9_.-]{3,40}$/.test(extraAdminUser)||extraAdminPassword.length<(process.env.STAGING==='1'?8:14)){
    console.error('Configuração da conta administrativa adicional inválida.');
    process.exit(1);
  }
  if(!db.prepare('SELECT id FROM users WHERE username=?').get(extraAdminUser)){
    db.prepare('INSERT INTO users(username,password_hash,role) VALUES (?,?,?)').run(extraAdminUser,hashPassword(extraAdminPassword),'admin');
    console.log('Conta administrativa adicional criada.');
  }
}
// Entrada interna opcional preservada. Em produção o recebimento público tem liberação separada.
const internalPilot = process.env.STAGING === '1' && process.env.NAVEDOCS_INTERNAL_TESTS === '1';
const app=express();app.disable('x-powered-by');
if(process.env.STAGING==='1') app.use((req,res,next)=>{res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');next();});
if(process.env.TRUST_PROXY==='1') app.set('trust proxy',1);
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");next();});
app.use(express.json({limit:'50kb'}));
const cookieName='navedocs_session';
function currentUser(req){let m=(req.headers.cookie||'').match(/(?:^|; )navedocs_session=([a-f0-9]{64})/);if(!m) return null;let hash=createHash('sha256').update(m[1]).digest('hex');return db.prepare('SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(hash,Date.now())||null;}
function auth(req,res,next){req.user=currentUser(req);if(!req.user)return res.status(401).json({error:'Acesse sua conta para continuar.'});next();}
function adminOnly(req,res,next){if(req.user?.role!=='admin')return res.status(403).json({error:'Somente administradores podem realizar esta operação.'});next();}
function strongPassword(password,role){return typeof password==='string'&&password.length>=(role==='admin'?16:12)&&password.length<=128&&/[A-Z]/.test(password)&&/[a-z]/.test(password)&&/[0-9]/.test(password)&&/[^A-Za-z0-9]/.test(password);}

function originGuard(req,res,next){if(!['POST','PATCH','PUT','DELETE'].includes(req.method))return next();let o=req.headers.origin;if(o){try{if(new URL(o).host!==req.get('host'))return res.status(403).json({error:'Origem não permitida.'});}catch{return res.status(403).json({error:'Origem inválida.'});}}next();}
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
app.use('/api',originGuard);
const loginAttempts=new Map();
app.post('/api/login',(req,res)=>{const key=req.ip;const now=Date.now();const v=loginAttempts.get(key)||{count:0,until:0};if(v.until>now)return res.status(429).json({error:'Muitas tentativas. Tente mais tarde.'});let u=db.prepare('SELECT * FROM users WHERE username=?').get(String(req.body.username||''));if(!u||!checkPassword(String(req.body.password||''),u.password_hash)){v.count++;v.until=v.count>=5?now+15*60*1000:0;loginAttempts.set(key,v);return res.status(401).json({error:'Usuário ou senha incorretos.'});}loginAttempts.delete(key);const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'),u.id,now+8*3600*1000);res.cookie(cookieName,token,{httpOnly:true,sameSite:'strict',secure:req.secure,maxAge:8*3600*1000,path:'/'});res.json({user:{username:u.username,role:u.role}});});
app.post('/api/logout',auth,(req,res)=>{const token=(req.headers.cookie||'').match(/(?:^|; )navedocs_session=([a-f0-9]{64})/)?.[1];if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(createHash('sha256').update(token).digest('hex'));res.clearCookie(cookieName,{path:'/'});res.json({ok:true});});
app.get('/api/me',auth,(req,res)=>res.json({user:req.user}));

// Gestão de usuários: ações administrativas controladas no servidor.
app.get('/api/users',auth,adminOnly,(req,res)=>{
 const items=db.prepare('SELECT id,username,role FROM users ORDER BY username').all();
 res.set('Cache-Control','no-store');res.json({items});
});
app.post('/api/users',auth,adminOnly,(req,res)=>{
 const username=String(req.body?.username||'').trim();
 const password=req.body?.password;
 const role=String(req.body?.role||'');
 if(!/^[A-Za-z0-9_.-]{3,40}$/.test(username)||!['admin','atendente'].includes(role)||!strongPassword(password,role))
   return res.status(400).json({error:'Confira nome, perfil e senha. Administrador: mínimo 16 caracteres; atendente: mínimo 12. Inclua maiúscula, minúscula, número e símbolo.'});
 try {
  const result=db.prepare('INSERT INTO users(username,password_hash,role) VALUES (?,?,?)').run(username,hashPassword(password),role);
  db.prepare('INSERT INTO audit(user_id,request_id,action,created_at) VALUES (?,?,?,?)').run(req.user.id,null,'user-created:'+String(result.lastInsertRowid)+':'+role,new Date().toISOString());
  res.status(201).json({user:{id:Number(result.lastInsertRowid),username,role}});
 }catch(e){if(e.code==='SQLITE_CONSTRAINT_UNIQUE')return res.status(409).json({error:'Nome de usuário já cadastrado.'});console.error('Falha ao cadastrar usuário',e);res.status(500).json({error:'Não foi possível cadastrar o usuário.'});}
});
// Permite a cada servidor renovar sua própria senha, sem expor a senha atual aos administradores.
app.post('/api/me/password',auth,(req,res)=>{
 const current=String(req.body?.currentPassword||'');const next=req.body?.newPassword;
 const user=db.prepare('SELECT id,password_hash,role FROM users WHERE id=?').get(req.user.id);
 if(!user||!checkPassword(current,user.password_hash))return res.status(403).json({error:'Senha atual incorreta.'});
 if(!strongPassword(next,user.role))return res.status(400).json({error:'A nova senha precisa de maiúscula, minúscula, número e símbolo; mínimo 16 caracteres para admin ou 12 para atendente.'});
 db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(next),user.id);
 db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
 db.prepare('INSERT INTO audit(user_id,request_id,action,created_at) VALUES (?,?,?,?)').run(user.id,null,'password-updated',new Date().toISOString());
 res.json({ok:true,reauthRequired:true});
});

const SERVICES=['Credencial de estacionamento','Defesa de autuação','Recurso de multa','Indicação de condutor','Outros documentos'];
app.get('/api/services',(req,res)=>res.json({services:SERVICES}));
const uploadAttempts=new Map();
function publicLimit(req,res,next){const now=Date.now(),key=req.ip,history=(uploadAttempts.get(key)||[]).filter(t=>t>now-60*60*1000);if(history.length>=20)return res.status(429).json({error:'Limite de envios atingido. Tente mais tarde.'});history.push(now);uploadAttempts.set(key,history);next();}
const upload=multer({storage:multer.memoryStorage(),limits:{files:8,fileSize:10*1024*1024,fields:4,parts:12,fieldSize:4096}});
function detect(buffer){if(buffer.length<16)return null;if(buffer.subarray(0,5).toString()==='%PDF-')return {mime:'application/pdf',ext:'.pdf'};if(buffer.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])))return {mime:'image/jpeg',ext:'.jpg'};if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {mime:'image/png',ext:'.png'};return null;}
function cleanup(names){for(const name of names)try{unlinkSync(path.join(storageDir,name));}catch{}}
app.post('/api/requests', (req,res,next)=>{
 if(process.env.STAGING==='1' && process.env.ENABLE_TEST_UPLOADS!=='1')
   return res.status(503).json({error:'Recebimento temporariamente desativado.'});
 if(internalPilot){
   // Só sessões válidas e usuários internos podem enviar; nenhuma sessão de visitante.
   req.user=currentUser(req);
   if(!req.user || !['admin','atendente'].includes(req.user.role))
     return res.status(401).json({error:'Entre pelo painel administrativo para realizar testes internos.'});
   return next();
 }
 if(process.env.STAGING!=='1' && process.env.NAVEDOCS_REAL_DATA_APPROVED!=='1')
   return res.status(503).json({error:'Recebimento de documentos reais ainda não autorizado.'});
 next();
},publicLimit,upload.array('documents',8),(req,res)=>{const cpf=normalizeCpf(req.body.cpf),name=String(req.body.name||'').trim(),service=String(req.body.service||'');const files=req.files||[];
 // CPF com dígitos verificadores válidos é obrigatório, inclusive em testes.
 if(name.length<3||name.length>120||!validCpf(cpf)||!SERVICES.includes(service)||!files.length)return res.status(400).json({error:'Confira nome, CPF, tipo de solicitação e anexos.'});
 if(files.some(f=>!detect(f.buffer)))return res.status(400).json({error:'Arquivos aceitos: PDF, JPG e PNG válidos.'});
 const inserted=[];let id;const now=new Date().toISOString();const protocol='NAV-'+new Date().getUTCFullYear()+'-'+randomBytes(5).toString('hex').toUpperCase();
 try{db.exec('BEGIN IMMEDIATE');let a=db.prepare('INSERT INTO requests(protocol,citizen_name,cpf,service,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(protocol,name,cpf,service,now,now);id=Number(a.lastInsertRowid);
 for(const f of files){const sig=detect(f.buffer);const filename=randomBytes(20).toString('hex')+sig.ext;requireWrite(filename,f.buffer);inserted.push(filename);db.prepare('INSERT INTO files(request_id,original_name,disk_name,mime,size) VALUES (?,?,?,?,?)').run(id,path.basename(f.originalname).slice(0,180),filename,sig.mime,f.size);}
 if(internalPilot && req.user)db.prepare('INSERT INTO audit(user_id,request_id,action,created_at) VALUES (?,?,?,?)').run(req.user.id,id,'internal-test-request-created',now);
 db.exec('COMMIT');return res.status(201).json({protocol});}catch(e){try{db.exec('ROLLBACK');}catch{}cleanup(inserted);console.error('Erro no envio',e);return res.status(500).json({error:'Não foi possível receber os documentos. Tente novamente.'});}
});
function requireWrite(name,buf){const {writeFileSync}=fsOps;writeFileSync(path.join(storageDir,name),buf,{flag:'wx',mode:0o600});}
import * as fsOps from 'node:fs';
app.get('/api/requests',auth,(req,res)=>{const search=String(req.query.q||'').trim().slice(0,120),status=String(req.query.status||''),start=String(req.query.start||''),end=String(req.query.end||'');let conditions=[],args=[];if(search){conditions.push('(citizen_name LIKE ? OR cpf LIKE ? OR protocol LIKE ?)');args.push(...Array(3).fill('%'+search+'%'));}if(['pendente','em_analise','concluido'].includes(status)){conditions.push('status=?');args.push(status);}if(/^\d{4}-\d{2}-\d{2}$/.test(start)){conditions.push('created_at>=?');args.push(start+'T00:00:00');}if(/^\d{4}-\d{2}-\d{2}$/.test(end)){conditions.push('created_at<?');args.push(end+'T23:59:59.999Z');}const where=conditions.length?'WHERE '+conditions.join(' AND '):'';const items=db.prepare(`SELECT id,protocol,citizen_name,cpf,service,status,created_at,(SELECT COUNT(*) FROM files WHERE request_id=requests.id) as file_count FROM requests ${where} ORDER BY created_at DESC LIMIT 500`).all(...args);res.json({items});});
app.get('/api/dashboard',auth,(req,res)=>{const start=String(req.query.start||''),end=String(req.query.end||'');let where='',args=[];if(/^\d{4}-\d{2}-\d{2}$/.test(start)){where+=' AND created_at>=?';args.push(start+'T00:00:00');}if(/^\d{4}-\d{2}-\d{2}$/.test(end)){where+=' AND created_at<=?';args.push(end+'T23:59:59.999Z');}let totals=db.prepare(`SELECT count(*) total,sum(CASE WHEN status='pendente' THEN 1 ELSE 0 END) pending,sum(CASE WHEN status='em_analise' THEN 1 ELSE 0 END) analyzing,sum(CASE WHEN status='concluido' THEN 1 ELSE 0 END) done FROM requests WHERE 1=1 ${where}`).get(...args);let monthly=db.prepare(`SELECT substr(created_at,1,7) label,count(*) value FROM requests WHERE 1=1 ${where} GROUP BY label ORDER BY label`).all(...args);let services=db.prepare(`SELECT service label,count(*) value FROM requests WHERE 1=1 ${where} GROUP BY service ORDER BY value DESC`).all(...args);res.json({totals,monthly,services});});
function findRequest(req,res,next){req.entry=db.prepare('SELECT * FROM requests WHERE id=?').get(Number(req.params.id));if(!req.entry)return res.status(404).json({error:'Solicitação não encontrada.'});next();}
// Contingência DETRAN: registro interno, sem transmissão ao órgão externo.
function contingencyFor(id){return db.prepare(`SELECT c.*,u.username AS issued_by,
  u2.username AS external_registered_by FROM detran_contingencies c
  JOIN users u ON u.id=c.created_by
  LEFT JOIN users u2 ON u2.id=c.external_recorded_by WHERE c.request_id=?`).get(id)||null;}
function ensureAppeal(req,res,next){if(req.entry.service!=='Recurso de multa')return res.status(422).json({error:'Contingência disponível apenas para Recurso de multa.'});next();}
app.get('/api/requests/:id/contingency',auth,findRequest,ensureAppeal,(req,res)=>res.json({contingency:contingencyFor(req.entry.id)}));
app.post('/api/requests/:id/contingency',auth,adminOnly,findRequest,ensureAppeal,(req,res)=>{
  if(process.env.STAGING==='1'&&!internalPilot)return res.status(403).json({error:'Habilite primeiro o piloto interno.'});
  const reason=String(req.body?.reason||'').trim();
  if(reason.length<12||reason.length>500)return res.status(400).json({error:'Descreva o motivo da contingência (12 a 500 caracteres).'});
  let started=false;
  try{
    db.exec('BEGIN IMMEDIATE');started=true;
    let existing=contingencyFor(req.entry.id);
    if(existing){db.exec('COMMIT');return res.status(409).json({error:'Já existe um protocolo de contingência para este recurso.',contingency:existing});}
    const code=`NVD-CONT-${new Date().getUTCFullYear()}-${randomBytes(6).toString('hex').toUpperCase()}`;
    const now=new Date().toISOString();
    db.prepare('INSERT INTO detran_contingencies(request_id,code,reason,created_by,created_at) VALUES (?,?,?,?,?)').run(req.entry.id,code,reason,req.user.id,now);
    db.prepare('INSERT INTO audit(user_id,request_id,action,created_at) VALUES (?,?,?,?)').run(req.user.id,req.entry.id,'detran-contingency-created:'+code,now);
    db.exec('COMMIT');res.status(201).json({contingency:contingencyFor(req.entry.id)});
  }catch(err){if(started)try{db.exec('ROLLBACK');}catch{}console.error('Falha ao gerar contingência',err);res.status(500).json({error:'Não foi possível criar o protocolo interno.'});}
});
app.patch('/api/requests/:id/contingency',auth,adminOnly,findRequest,ensureAppeal,(req,res)=>{
 const external=String(req.body?.external_protocol||'').trim();
 if(!/^[A-Za-z0-9][A-Za-z0-9 ./_-]{4,79}$/.test(external))return res.status(400).json({error:'Número oficial inválido (5 a 80 caracteres).'});
 let started=false;
 try{
  db.exec('BEGIN IMMEDIATE');started=true;
  const c=contingencyFor(req.entry.id);
  if(!c){db.exec('ROLLBACK');return res.status(404).json({error:'Nenhuma contingência cadastrada.'});}
  if(c.external_protocol){db.exec('ROLLBACK');return res.status(409).json({error:'O protocolo externo já foi registrado. Correções exigem procedimento administrativo específico.'});}
  const now=new Date().toISOString();
  db.prepare('UPDATE detran_contingencies SET external_protocol=?,external_recorded_by=?,external_recorded_at=? WHERE request_id=?').run(external,req.user.id,now,req.entry.id);
  db.prepare('INSERT INTO audit(user_id,request_id,action,created_at) VALUES (?,?,?,?)').run(req.user.id,req.entry.id,'detran-external-protocol-recorded',now);
  db.exec('COMMIT');res.json({contingency:contingencyFor(req.entry.id)});
 }catch(err){if(started)try{db.exec('ROLLBACK');}catch{}console.error('Falha ao vincular protocolo oficial',err);res.status(500).json({error:'Não foi possível vincular o protocolo oficial.'});}
});
app.get('/api/requests/:id/contingency.pdf',auth,findRequest,ensureAppeal,async(req,res)=>{
 const c=contingencyFor(req.entry.id);
 if(!c)return res.status(404).json({error:'Ainda não existe protocolo de contingência para este recurso.'});
 try{
  const {StandardFonts,rgb}=await import('pdf-lib');
  const pdf=await PDFDocument.create();const page=pdf.addPage([595.28,841.89]);
  const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const blue=rgb(.08,.19,.32),gray=rgb(.33,.4,.47);
  const line=(text,y,size=11,font=regular,color=blue)=>page.drawText(text,{x:48,y,size,font,color,maxWidth:500});
  const ascii=str=>String(str).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'?');
  page.drawRectangle({x:0,y:758,width:595.28,height:84,color:blue});
  page.drawText('NAVETRAN  |  NAVEDOCS',{x:48,y:792,size:19,font:bold,color:rgb(1,1,1)});
  page.drawText('COMPROVANTE DE REGISTRO INTERNO DE CONTINGENCIA',{x:48,y:747,size:14,font:bold,color:blue});
  line('Protocolo interno: '+ascii(c.code),710,14,bold);
  line('Protocolo de recebimento NAVEDOCS: '+ascii(req.entry.protocol),682);
  line('Tipo: Recurso de multa',660);
  line('Nome: '+ascii(req.entry.citizen_name).slice(0,80),638);
  line('CPF: ***.***.***-'+String(req.entry.cpf).slice(-2),616);
  line('Recebimento no NAVEDOCS (UTC): '+req.entry.created_at,594);
  line('Registro de contingencia (UTC): '+c.created_at,572);
  line('Registrado por: '+ascii(c.issued_by),550);
  line('Situacao DETRAN: '+(c.external_protocol?'PROTOCOLO INFORMADO':'AGUARDANDO PROTOCOLO OFICIAL'),522,11,bold);
  if(c.external_protocol)line('Protocolo externo informado: '+ascii(c.external_protocol),501);
  line('Motivo declarado:',466,11,bold);
  const words=ascii(c.reason).split(' ');let text='',y=445;
  for(const word of words){if((text+' '+word).length>83){line(text,y,10,regular,gray);y-=17;text=word;}else{text=text?text+' '+word:word;}}
  if(text)line(text,y,10,regular,gray);
  page.drawRectangle({x:40,y:105,width:515,height:108,color:rgb(.94,.96,.98)});
  line('IMPORTANTE: ESTE DOCUMENTO E UM REGISTRO INTERNO DA NAVETRAN.',187,10,bold);
  line('NAO e protocolo emitido pelo DETRAN e nao comprova, por si so,',167,10);
  line('interposicao perante o orgao competente, tempestividade ou admissibilidade.',149,10);
  line('A protocolizacao oficial devera ser feita e vinculada posteriormente.',131,10);
  line('Documento gerado pelo NAVEDOCS; autenticacao exigida para acesso.',67,9,regular,gray);
  const bytes=await pdf.save();res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${c.code}.pdf"`,'Cache-Control':'private, no-store'});res.send(Buffer.from(bytes));
 }catch(err){console.error('Falha ao gerar comprovante',err);res.status(500).json({error:'Não foi possível gerar o comprovante.'});}
});
app.get('/api/requests/:id',auth,findRequest,(req,res)=>{const files=db.prepare('SELECT id,original_name,mime,size FROM files WHERE request_id=?').all(req.entry.id);res.json({entry:req.entry,files});});
app.patch('/api/requests/:id',auth,adminOnly,findRequest,(req,res)=>{if(!['pendente','em_analise','concluido'].includes(req.body.status))return res.status(400).json({error:'Status inválido.'});db.prepare('UPDATE requests SET status=?,updated_at=? WHERE id=?').run(req.body.status,new Date().toISOString(),req.entry.id);db.prepare('INSERT INTO audit(user_id,request_id,action,created_at) VALUES (?,?,?,?)').run(req.user.id,req.entry.id,'status:'+req.body.status,new Date().toISOString());res.json({ok:true});});
function getFile(req,res,next){req.fileInfo=db.prepare('SELECT f.* FROM files f JOIN requests r ON r.id=f.request_id WHERE f.id=? AND r.id=?').get(Number(req.params.fileId),Number(req.params.id));if(!req.fileInfo)return res.status(404).json({error:'Arquivo não encontrado.'});next();}
app.get('/api/requests/:id/files/:fileId',auth,getFile,(req,res)=>{const f=req.fileInfo;res.setHeader('Content-Type',f.mime);res.setHeader('Content-Disposition',(req.query.download==='1'?'attachment':'inline')+'; filename="documento'+path.extname(f.disk_name)+'"');res.setHeader('Cache-Control','private, no-store');res.sendFile(path.join(storageDir,f.disk_name));});
app.get('/api/requests/:id/zip',auth,findRequest,(req,res)=>{const files=db.prepare('SELECT * FROM files WHERE request_id=?').all(req.entry.id);res.set('Content-Type','application/zip');res.set('Content-Disposition',`attachment; filename="${req.entry.protocol}.zip"`);const zip=archiver('zip',{zlib:{level:6}});zip.on('error',()=>res.destroy());zip.pipe(res);files.forEach((f,i)=>zip.file(path.join(storageDir,f.disk_name),{name:String(i+1).padStart(2,'0')+'-'+path.basename(f.original_name).replace(/[^\w.\- ]/g,'_')}));zip.finalize();});
app.get('/api/requests/:id/merged.pdf',auth,findRequest,async(req,res)=>{const files=db.prepare('SELECT * FROM files WHERE request_id=?').all(req.entry.id);try{const doc=await PDFDocument.create();for(const f of files){const buf=readFileSync(path.join(storageDir,f.disk_name));if(f.mime==='application/pdf'){const source=await PDFDocument.load(buf);const pages=await doc.copyPages(source,source.getPageIndices());pages.forEach(p=>doc.addPage(p));}else{const im=f.mime==='image/png'?await doc.embedPng(buf):await doc.embedJpg(buf);const p=doc.addPage([595.28,841.89]);const scale=Math.min(545/im.width,790/im.height);p.drawImage(im,{x:(595.28-im.width*scale)/2,y:(841.89-im.height*scale)/2,width:im.width*scale,height:im.height*scale});}}const bytes=await doc.save();res.set('Content-Type','application/pdf');res.set('Content-Disposition',`attachment; filename="${req.entry.protocol}.pdf"`);res.send(Buffer.from(bytes));}catch(e){console.error('Falha ao unir PDFs',e);res.status(422).json({error:'Não foi possível unir os arquivos. Verifique se os PDFs são válidos e não possuem senha.'});}});
app.get('/api/qr.svg',auth,async(req,res)=>{const url=`${req.protocol}://${req.get('host')}/`;res.type('image/svg+xml').send(await QRCode.toString(url,{type:'svg',margin:2,color:{dark:'#173354',light:'#ffffff'}}));});
// O formulário interno nunca é servido como documento cacheável nem é acessível anonimamente.
app.get('/interno',(req,res)=>{
 if(!internalPilot)return res.status(404).send('Página indisponível.');
 const user=currentUser(req);
 if(!user || !['admin','atendente'].includes(user.role))return res.redirect(302,'/admin');
 res.setHeader('Cache-Control','private, no-store');
 res.sendFile(path.join(root,'public/index.html'));
});
if(internalPilot){
 // Entrada pública não participa do piloto; visitantes vão para a tela de autenticação.
 app.get('/',(req,res)=>res.redirect(302,'/admin'));
 app.get('/index.html',(req,res)=>res.redirect(302,'/admin'));
}
app.use(express.static(path.join(root,'public'),{index:'index.html',maxAge:0}));app.get('/admin',(req,res)=>res.sendFile(path.join(root,'public/admin.html')));
app.use((err,req,res,next)=>{if(err instanceof multer.MulterError)return res.status(400).json({error:'Limite de arquivos excedido (máximo 8 arquivos de até 10 MB cada).'});console.error(err);res.status(500).json({error:'Erro interno.'});});
app.listen(port,()=>console.log(`NAVEDOCS disponível em http://localhost:${port}`));
