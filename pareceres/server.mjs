import { registerAitOcrRoutes } from './ocr-routes.mjs';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const FIELDS = ['processo','ait','tipificacao','data','marcaModelo','placa','cor','proprietario','condutor','requerente','baseLegal','relatorio','tese','fundamentacao','conclusao','observacoes'];
export const RESULTADOS = {
  deferido: ['irregularidade_ait','erro_material','sinalizacao_irregular','outro'],
  indeferido: ['auto_consistente','alegacoes_insuficientes','provas_insuficientes','outro'],
  nao_conhecido: ['intempestividade','ilegitimidade','representacao','outro'],
};
export const MOTIVOS = {
  irregularidade_ait:'INCONSISTÊNCIA OU IRREGULARIDADE DO AIT',erro_material:'ERRO MATERIAL RELEVANTE',sinalizacao_irregular:'SINALIZAÇÃO IRREGULAR COMPROVADA',
  auto_consistente:'AUTO CONSISTENTE',alegacoes_insuficientes:'ALEGAÇÕES NÃO COMPROVADAS',provas_insuficientes:'PROVAS INSUFICIENTES',
  intempestividade:'INTEMPESTIVIDADE',ilegitimidade:'ILEGITIMIDADE DO REQUERENTE',representacao:'IRREGULARIDADE DE REPRESENTAÇÃO',outro:'OUTRO FUNDAMENTO',
};
export function validateParecer(body) {
  const resultado=String(body?.resultado||'');const motivo=String(body?.motivo||'');
  if(!RESULTADOS[resultado]?.includes(motivo))throw Error('Resultado e motivo incompatíveis.');
  const out={resultado,motivo,requestId:null,documento:{}};
  if(body.requestId!==null&&body.requestId!==''&&body.requestId!==undefined){const id=Number(body.requestId);if(!Number.isSafeInteger(id)||id<1)throw Error('Solicitação vinculada inválida.');out.requestId=id;}
  const src=body.documento;
  if(!src||typeof src!=='object'||Array.isArray(src))throw Error('Campos do documento ausentes.');
  for(const f of FIELDS){if(typeof src[f]!=='string')throw Error('Campo inválido: '+f);if(src[f].length>(['relatorio','tese','fundamentacao','conclusao','observacoes'].includes(f)?10000:240))throw Error('Texto excede o limite: '+f);out.documento[f]=src[f].trim();}
  if(!['proprietario','condutor','outro'].includes(String(body.requerenteTipo)))throw Error('Tipo do requerente inválido.');
  out.requerenteTipo=String(body.requerenteTipo);
  return out;
}

function tidy(x){return String(x||'').replace(/\s+/g,' ').trim();}
export function extractFromText(text){
 const t=String(text||'').slice(0,120000), f={};
 const rules={
  ait:/(?:N[ÚU]MERO\s+DO\s+AUTO|AUTO\s+DE\s+INFRA[ÇC][ÃA]O|AUTO\s+N[º°O.]*)\s*[:#-]?\s*([A-Z]{1,3}\s*\d{7,12})/i,
  tipificacao:/(?:C[ÓO]DIGO\s+DE\s+ENQUADRAMENTO|TIPIFICA[ÇC][ÃA]O)\s*[:#-]?\s*(\d{4}[-.]?\d)/i,
  data:/(?:DATA\s+(?:DA\s+)?INFRA[ÇC][ÃA]O|DATA)\s*[:#-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
  placa:/(?:PLACA(?:\s+DO\s+VE[ÍI]CULO)?)\s*[:#-]?\s*([A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2})/i,
  marcaModelo:/(?:MARCA\s*\/\s*MODELO|MARCA\s+MODELO)\s*[:#-]?\s*([^\n\r]{3,60})/i,
  proprietario:/(?:NOME\s+DO\s+PROPRIET[ÁA]RIO|PROPRIET[ÁA]RIO)\s*[:#-]?\s*([^\r\n]{3,100})/i,
  condutor:/(?:NOME\s+DO\s+CONDUTOR|CONDUTOR)\s*[:#-]?\s*([^\r\n]{3,100})/i,
 };
 for(const [k,re] of Object.entries(rules)){const m=t.match(re);if(m)f[k]=tidy(m[1]);}
 return f;
}

export function registerParecerRoutes({app,db,auth,root,privateRoot}){
 const directory=path.join(privateRoot,'pareceres-ait');mkdirSync(directory,{recursive:true});
 db.exec(`CREATE TABLE IF NOT EXISTS pareceres_analise (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER REFERENCES requests(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  updated_by INTEGER NOT NULL REFERENCES users(id),
  resultado TEXT NOT NULL CHECK(resultado IN ('deferido','indeferido','nao_conhecido')),
  motivo TEXT NOT NULL, requerente_tipo TEXT NOT NULL,
  documento_json TEXT NOT NULL, ait_filename TEXT, ait_mime TEXT, ait_original_name TEXT,
  estado TEXT NOT NULL DEFAULT 'rascunho' CHECK(estado IN ('rascunho','em_revisao')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
 );
 CREATE INDEX IF NOT EXISTS idx_pareceres_request ON pareceres_analise(request_id);
 CREATE TABLE IF NOT EXISTS pareceres_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parecer_id INTEGER NOT NULL REFERENCES pareceres_analise(id),
  actor_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL, created_at TEXT NOT NULL
 );`);
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1},fileFilter(req,file,cb){
  if(!['application/pdf','image/png','image/jpeg'].includes(file.mimetype))return cb(new Error('Apenas PDF, PNG e JPG são aceitos.'));cb(null,true);
 }});
 const one= (req,res,next)=>upload.single('ait')(req,res,error=>error?res.status(400).json({error:error.message}):next());
 const lookup=(req,res,next)=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Identificador inválido.'});req.parecer=db.prepare('SELECT * FROM pareceres_analise WHERE id=?').get(id);if(!req.parecer)return res.status(404).json({error:'Parecer não encontrado.'});next();};
 const rowPublic=p=>({id:p.id,requestId:p.request_id,resultado:p.resultado,motivo:p.motivo,requerenteTipo:p.requerente_tipo,documento:JSON.parse(p.documento_json),estado:p.estado,temAit:!!p.ait_filename,nomeAit:p.ait_original_name,createdAt:p.created_at,updatedAt:p.updated_at});
 function audit(id,actor,action){db.prepare('INSERT INTO pareceres_audit(parecer_id,actor_id,action,created_at) VALUES (?,?,?,?)').run(id,actor,action,new Date().toISOString());}
 function checkLink(requestId){if(requestId&&!db.prepare('SELECT 1 FROM requests WHERE id=?').get(requestId))throw Error('Solicitação não localizada.');}
 app.get('/pareceres',auth,(req,res)=>{res.set('Cache-Control','private, no-store');res.sendFile(path.join(root,'public','pareceres.html'));});
 app.get('/api/pareceres',auth,(req,res)=>{const rows=db.prepare(`SELECT * FROM pareceres_analise ORDER BY id DESC LIMIT 100`).all();res.set('Cache-Control','no-store').json({items:rows.map(rowPublic)});});
 app.post('/api/pareceres',auth,(req,res)=>{try{const d=validateParecer(req.body);checkLink(d.requestId);const now=new Date().toISOString();const row=db.prepare(`INSERT INTO pareceres_analise(request_id,created_by,updated_by,resultado,motivo,requerente_tipo,documento_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).run(d.requestId,req.user.id,req.user.id,d.resultado,d.motivo,d.requerenteTipo,JSON.stringify(d.documento),now,now);audit(row.lastInsertRowid,req.user.id,'criado');res.status(201).json({id:Number(row.lastInsertRowid)});}catch(e){res.status(400).json({error:e.message});}});
 app.get('/api/pareceres/:id',auth,lookup,(req,res)=>res.set('Cache-Control','no-store').json({parecer:rowPublic(req.parecer)}));
 app.put('/api/pareceres/:id',auth,lookup,(req,res)=>{try{const d=validateParecer(req.body);checkLink(d.requestId);const now=new Date().toISOString();db.prepare(`UPDATE pareceres_analise SET request_id=?,updated_by=?,resultado=?,motivo=?,requerente_tipo=?,documento_json=?,updated_at=? WHERE id=?`).run(d.requestId,req.user.id,d.resultado,d.motivo,d.requerenteTipo,JSON.stringify(d.documento),now,req.parecer.id);audit(req.parecer.id,req.user.id,'editado');res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
 app.get('/api/pareceres/:id/audit',auth,lookup,(req,res)=>{const a=db.prepare(`SELECT a.action,a.created_at,u.username FROM pareceres_audit a LEFT JOIN users u ON u.id=a.actor_id WHERE a.parecer_id=? ORDER BY a.id DESC`).all(req.parecer.id);res.json({items:a});});
 app.post('/api/pareceres/:id/ait',auth,lookup,one,(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Selecione o Auto de Infração.'});
  const b=req.file.buffer,m=req.file.mimetype;
  const ok=m==='application/pdf'?b.subarray(0,5).toString()==='%PDF-':m==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):b[0]===255&&b[1]===216;
  if(!ok)return res.status(415).json({error:'O conteúdo não corresponde ao tipo do arquivo.'});
  const name=randomBytes(18).toString('hex')+(m==='application/pdf'?'.pdf':m==='image/png'?'.png':'.jpg');
  writeFileSync(path.join(directory,name),b,{flag:'wx',mode:0o600});
  db.prepare('UPDATE pareceres_analise SET ait_filename=?,ait_mime=?,ait_original_name=?,updated_by=?,updated_at=? WHERE id=?').run(name,m,path.basename(req.file.originalname).slice(0,150),req.user.id,new Date().toISOString(),req.parecer.id);
  audit(req.parecer.id,req.user.id,'ait_anexado');res.json({ok:true,extractionStatus:'manual_required',message:'AIT original anexado. Preencha ou confira os dados; OCR de imagem ainda não está disponível.'});
 });
 app.get('/api/pareceres/:id/ait',auth,lookup,(req,res)=>{const p=req.parecer;if(!p.ait_filename)return res.status(404).json({error:'AIT não anexado.'});res.set({'Content-Type':p.ait_mime,'Content-Disposition':'attachment; filename="ait-original'+path.extname(p.ait_filename)+'"','Cache-Control':'private, no-store'});res.sendFile(path.join(directory,p.ait_filename));});
 app.post('/api/pareceres/interpretar-texto',auth,(req,res)=>{const input=String(req.body?.texto||'');if(input.length>120000)return res.status(413).json({error:'Texto muito longo.'});res.json({campos:extractFromText(input),metodo:'texto_colado',aviso:'Extração preliminar: conferir cada campo no documento original.'});});
 app.get('/api/pareceres/:id/minuta.pdf',auth,lookup,async(req,res)=>{
  try {const bytes=await generateParecerPdf(req.parecer,directory);res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="parecer-minuta-${req.parecer.id}.pdf"`,'Cache-Control':'private, no-store'});res.send(Buffer.from(bytes));audit(req.parecer.id,req.user.id,'minuta_pdf');}
  catch(e){console.error('Erro na geração do parecer',e);res.status(422).json({error:'Não foi possível gerar o PDF. Confira o AIT e os campos.'});}
 });
 registerAitOcrRoutes({app,auth,lookup,privateRoot,directory,audit});
}

const W=595.28,H=841.89,M=44;
function wrapText(value,font,size,width){const parts=String(value||'').normalize('NFC').replace(/[^\x20-\x7e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\n\r]/g,'?').replace(/\r/g,'').split('\n'),out=[];for(const segment of parts){let line='';for(const word of segment.split(/\s+/)){if(!word)continue;const candidate=line?line+' '+word:word;try{if(font.widthOfTextAtSize(candidate,size)>width&&line){out.push(line);line=word;}else line=candidate;}catch{line=candidate.replace(/[^\x20-\x7eÀ-ÿ]/g,'');}}out.push(line);}return out;}
export async function generateParecerPdf(p,dir){
 const doc=await PDFDocument.create();const regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),black=rgb(.12,.18,.25),gray=rgb(.4,.45,.5),blue=rgb(.09,.22,.36);let page,y;
 function newPage(){page=doc.addPage([W,H]);y=H-54;page.drawText('ESTADO DE SANTA CATARINA',{x:M,y,size:10,font:bold,color:blue});y-=15;page.drawText('PREFEITURA MUNICIPAL DE NAVEGANTES',{x:M,y,size:10,font:bold,color:blue});y-=15;page.drawText('NAVETRAN - ORGAO 8272',{x:M,y,size:10,font:bold,color:blue});y-=25;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:1,color:blue});y-=23;}
 function ensure(n=24){if(y-n<M+42)newPage();}
 function line(value,{size=10,font=regular,spacing=15,color=black}={}){for(const l of wrapText(value,font,size,W-2*M)){ensure(spacing);if(l)page.drawText(l,{x:M,y,size,font,color});y-=spacing;}}
 function heading(text){ensure(42);y-=8;line(text,{font:bold,size:11,spacing:19});}
 function field(k,v){line(k+': '+(v||'—'),{size:9,spacing:14});}
 function section(h,content){heading(h);line(content||'[Texto a elaborar e revisar pelo responsável.]');y-=10;}
 const d=JSON.parse(p.documento_json);newPage();heading('PARECER ADMINISTRATIVO DE TRANSITO - MINUTA');
 const result={deferido:'DEFERIDO',indeferido:'INDEFERIDO',nao_conhecido:'NAO CONHECIDO'}[p.resultado];
 field('PROCESSO No',d.processo);field('RESULTADO',result);field('MOTIVO',MOTIVOS[p.motivo]);field('AUTO DE INFRACAO',d.ait);field('TIPIFICACAO',d.tipificacao);field('DATA',d.data);field('MARCA/MODELO',d.marcaModelo);field('PLACA',d.placa);field('COR',d.cor);field('PROPRIETARIO',d.proprietario);field('CONDUTOR',d.condutor);field('REQUERENTE',d.requerente);field('BASE LEGAL',d.baseLegal);y-=6;
 section('RELATORIO',d.relatorio);
 if(p.ait_filename){heading('AUTO DE INFRACAO - DOCUMENTO ORIGINAL ANEXO');const buf=readFileSync(path.join(dir,p.ait_filename));if(p.ait_mime==='application/pdf'){
   const src=await PDFDocument.load(buf,{ignoreEncryption:false});const indexes=src.getPageIndices();if(indexes.length>15)throw Error('AIT com mais de 15 páginas.');const pages=await doc.copyPages(src,indexes);for(const cp of pages){doc.addPage(cp);}newPage();
  }else {const im=p.ait_mime==='image/png'?await doc.embedPng(buf):await doc.embedJpg(buf);const maxW=W-2*M,maxH=Math.min(410,y-M-50),scale=Math.min(maxW/im.width,maxH/im.height);if(scale<=0){newPage();}ensure(200);const s=Math.min(maxW/im.width,Math.max(50,Math.min(410,y-M-20))/im.height);const hh=im.height*s;ensure(hh+25);page.drawImage(im,{x:M,y:y-hh,width:im.width*s,height:hh});y-=hh+20;}}
 section('TESE DEFENSIVA',d.tese);section('PARECER',d.fundamentacao);section('CONCLUSAO',d.conclusao);if(d.observacoes)section('OBSERVACOES',d.observacoes);
 heading('MINUTA NAO ASSINADA');line('Documento para revisao humana. Nao constitui decisao administrativa ou protocolo oficial.',{size:9,color:gray});
 const pages=doc.getPages();pages.forEach((pg,i)=>{pg.drawText(`MINUTA - SEM APROVACAO | ${i+1}/${pages.length}`,{x:M,y:25,font:regular,size:8,color:gray});});
 return await doc.save();
}
