#!/usr/bin/env python3
"""Aplica melhorias NAVEDOCS a um checkout EXISTENTE, nunca em produção diretamente.
Idempotente: recusa âncoras inesperadas; não altera data/, storage/ nem variáveis Railway.
Execute: python aplicar_atualizacao.py /caminho/para/Navedocs
"""
import sys, shutil, pathlib, re, datetime, json
ROOT=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else None
if not ROOT or not (ROOT/'server.js').is_file() or not (ROOT/'public'/'admin.html').is_file():
 raise SystemExit('Informe a pasta raiz de uma cópia atualizada do repositório NAVEDOCS.')
TAG='NAVEDOCS-2026-11-16'
files=['server.js','public/admin.html','public/admin.js','public/styles.css']
data={p:(ROOT/p).read_text(encoding='utf-8') for p in files}
if any(TAG in x for x in data.values()):raise SystemExit('Atualização já aplicada, nenhuma alteração feita.')
def replace_one(s,old,new,why):
 n=s.count(old)
 if n!=1:raise RuntimeError(f'{why}: esperado 1 ponto de inserção, encontrados {n}; atualização CANCELADA.')
 return s.replace(old,new,1)
# ----------------- backend: permissões e auditoria -----------------
s=data['server.js']
s=replace_one(s,"function adminOnly(req,res,next){if(req.user?.role!=='admin')", "function adminOnly(req,res,next){if(!['admin','superadmin'].includes(req.user?.role))",'adminOnly')
s=replace_one(s,"password.length>=(role==='admin'?16:12)","password.length>=(role==='superadmin'?20:role==='admin'?16:12)",'senha forte')
bootstrap='''
// NAVEDOCS-2026-11-16: superadministrador provisionado APENAS por variável segura.
// Não modifica contas antigas nem imprime senha nos logs.
const superName=String(process.env.NAVEDOCS_SUPERADMIN_USER||'').trim();
const superPass=process.env.NAVEDOCS_SUPERADMIN_PASSWORD||'';
if(superName||superPass){
 if(!/^[A-Za-z0-9_.-]{3,40}$/.test(superName)||!strongPassword(superPass,'superadmin')){
  console.error('Conta superadmin inválida: exige usuário e senha forte de 20+ caracteres.');process.exit(1);
 }
 const oldSuper=db.prepare('SELECT id,role FROM users WHERE username=?').get(superName);
 if(!oldSuper)db.prepare('INSERT INTO users(username,password_hash,role) VALUES (?,?,?)').run(superName,hashPassword(superPass),'superadmin');
 else if(oldSuper.role!=='superadmin'){console.error('Usuário reservado para superadmin já existe com outro papel.');process.exit(1);}
}
'''
# place AFTER strongPassword declaration, prior originGuard
s=replace_one(s,"function originGuard(req,res,next)",bootstrap+"\nfunction originGuard(req,res,next)",'superadmin provisionamento')
# privilege backend: non-destructive editing and archiving (one-time additive migration)
server_extra='''
// NAVEDOCS-2026-11-16: protocolo manuscrito registrado e vinculado ao recebimento.
// Registros internos NÃO são protocolo oficial DETRAN.
db.exec(`CREATE TABLE IF NOT EXISTS paper_appeal_receipts (
 id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL UNIQUE REFERENCES requests(id),
 paper_number TEXT NOT NULL UNIQUE, received_at TEXT NOT NULL,
 category TEXT NOT NULL, phone TEXT, email TEXT, vehicle_plate TEXT, ait_number TEXT,
 documents_json TEXT NOT NULL, notes TEXT NOT NULL, signed_on_paper INTEGER NOT NULL DEFAULT 0,
 created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS privileged_request_actions (
 id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES requests(id),
 actor_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL,
 reason TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL, at TEXT NOT NULL
);`);
if(!db.prepare('PRAGMA table_info(requests)').all().some(x=>x.name==='archived_at')){
 db.exec('ALTER TABLE requests ADD COLUMN archived_at TEXT');
}
function superOnly(req,res,next){
 if(req.user?.role!=='superadmin')return res.status(403).json({error:'Operação reservada ao superadministrador.'});
 const user=db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
 if(!user||!checkPassword(String(req.body?.password||''),user.password_hash))
  return res.status(403).json({error:'Confirme a sua senha atual para autorizar a operação.'});
 const reason=String(req.body?.reason||'').trim();
 if(reason.length<12||reason.length>500)return res.status(400).json({error:'Justificativa obrigatória (12 a 500 caracteres).'});
 req.actionReason=reason;next();
}
app.get('/api/requests/:id/manual',auth,findRequest,ensureAppeal,(req,res)=>{
 const x=db.prepare(`SELECT m.*,u.username AS recorded_by FROM paper_appeal_receipts m
 JOIN users u ON u.id=m.created_by WHERE m.request_id=?`).get(req.entry.id);
 res.json({manual:x?{...x,documents:JSON.parse(x.documents_json)}:null});
});
app.post('/api/requests/:id/manual',auth,adminOnly,findRequest,ensureAppeal,(req,res)=>{
 if(process.env.STAGING==='1'&&!internalPilot)return res.status(403).json({error:'Registro manual indisponível fora do piloto interno.'});
 const v=req.body||{},number=String(v.paper_number||'').trim(),dt=String(v.received_at||'').trim();
 const category=String(v.category||'');
 const docs=Array.isArray(v.documents)?[...new Set(v.documents)]:[];
 const allowed=['Requerimento/formulário','Documento de identificação','CNH','CRLV','Notificação/AIT','Comprovantes','Outros'];
 const notes=String(v.notes||'').trim(),phone=String(v.phone||'').trim(),email=String(v.email||'').trim();
 const plate=String(v.vehicle_plate||'').trim().toUpperCase(),ait=String(v.ait_number||'').trim();
 if(!/^[A-Za-z0-9][A-Za-z0-9./_-]{2,39}$/.test(number)||!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}/.test(dt)||!Number.isFinite(Date.parse(dt))||
 !['Defesa de autuação','Indicação de condutor','Outro'].includes(category)||docs.some(x=>!allowed.includes(x))||docs.length>7||
 notes.length>1000||phone.length>30||email.length>120||plate.length>12||ait.length>40)
 return res.status(400).json({error:'Revise número, data, serviço e informações do protocolo manual.'});
 if(email&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))return res.status(400).json({error:'E-mail inválido.'});
 try{
  db.exec('BEGIN IMMEDIATE');
  const now=new Date().toISOString();
  db.prepare(`INSERT INTO paper_appeal_receipts(request_id,paper_number,received_at,category,phone,email,vehicle_plate,ait_number,documents_json,notes,signed_on_paper,created_by,created_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.entry.id,number,new Date(dt).toISOString(),category,phone,email,plate,ait,JSON.stringify(docs),notes,v.signed_on_paper===true?1:0,req.user.id,now);
  db.prepare('INSERT INTO audit(user_id,request_id,action,created_at) VALUES(?,?,?,?)').run(req.user.id,req.entry.id,'paper-manual-registered:'+number,now);
  db.exec('COMMIT');res.status(201).json({ok:true});
 }catch(err){try{db.exec('ROLLBACK')}catch{}
  if(err.code?.startsWith('SQLITE_CONSTRAINT'))return res.status(409).json({error:'Já existe protocolo manual para esta solicitação ou este número.'});
  console.error('Erro ao registrar protocolo manual',err);res.status(500).json({error:'Falha ao registrar o protocolo.'});}
});
app.patch('/api/requests/:id/correct',auth,findRequest,superOnly,(req,res)=>{
 const v=req.body||{},changes={};
 if(v.citizen_name!==undefined){const x=String(v.citizen_name).trim();if(x.length<3||x.length>120)return res.status(400).json({error:'Nome inválido.'});changes.citizen_name=x;}
 if(v.cpf!==undefined){const x=normalizeCpf(v.cpf);if(!validCpf(x))return res.status(400).json({error:'CPF inválido.'});changes.cpf=x;}
 if(v.service!==undefined){const x=String(v.service);if(!SERVICES.includes(x))return res.status(400).json({error:'Serviço inválido.'});
 if(x!=='Recurso de multa' && req.entry.service==='Recurso de multa' && (contingencyFor(req.entry.id)||db.prepare('SELECT 1 FROM paper_appeal_receipts WHERE request_id=?').get(req.entry.id)))return res.status(409).json({error:'Não é possível alterar o serviço com registros de contingência vinculados.'});
 changes.service=x;}
 if(!Object.keys(changes).length)return res.status(400).json({error:'Nenhuma alteração informada.'});
 let active=false;
 try{db.exec('BEGIN IMMEDIATE');active=true;
 const now=new Date().toISOString();
 for(const [key,value] of Object.entries(changes))db.prepare(`UPDATE requests SET ${key}=?,updated_at=? WHERE id=?`).run(value,now,req.entry.id);
 db.prepare('INSERT INTO privileged_request_actions(request_id,actor_id,action,reason,before_json,after_json,at) VALUES(?,?,?,?,?,?,?)').run(req.entry.id,req.user.id,'correction',req.actionReason,JSON.stringify({citizen_name:req.entry.citizen_name,cpf:req.entry.cpf,service:req.entry.service}),JSON.stringify(changes),now);
 db.prepare('INSERT INTO audit(user_id,request_id,action,created_at) VALUES(?,?,?,?)').run(req.user.id,req.entry.id,'privileged-request-correction',now);
 db.exec('COMMIT');res.json({ok:true});
 }catch(e){if(active)try{db.exec('ROLLBACK')}catch{}console.error('Erro na correção autorizada',e);res.status(500).json({error:'Não foi possível salvar a correção.'});}
});
app.post('/api/requests/:id/archive',auth,findRequest,superOnly,(req,res)=>{
 const archive=req.body?.archive===true;if(typeof req.body?.archive!=='boolean')return res.status(400).json({error:'Informe archive=true ou false.'});
 let active=false;try{db.exec('BEGIN IMMEDIATE');active=true;const now=new Date().toISOString();
 const after=archive?now:null;
 db.prepare('UPDATE requests SET archived_at=?,updated_at=? WHERE id=?').run(after,now,req.entry.id);
 db.prepare('INSERT INTO privileged_request_actions(request_id,actor_id,action,reason,before_json,after_json,at) VALUES(?,?,?,?,?,?,?)').run(req.entry.id,req.user.id,archive?'archive':'restore',req.actionReason,JSON.stringify({archived_at:req.entry.archived_at}),JSON.stringify({archived_at:after}),now);
 db.prepare('INSERT INTO audit(user_id,request_id,action,created_at) VALUES(?,?,?,?)').run(req.user.id,req.entry.id,archive?'privileged-request-archived':'privileged-request-restored',now);
 db.exec('COMMIT');res.json({ok:true});
 }catch(e){if(active)try{db.exec('ROLLBACK')}catch{}console.error('Erro no arquivamento',e);res.status(500).json({error:'Não foi possível alterar o arquivamento.'});}
});
'''
s=replace_one(s,'function getFile(req,res,next)',server_extra+'\nfunction getFile(req,res,next)','API protocolo manual e admin')
# Adjust request listing to show archival status without silently discarding historical rows.
s=replace_one(s,'SELECT id,protocol,citizen_name,cpf,service,status,created_at,','SELECT id,protocol,citizen_name,cpf,service,status,archived_at,created_at,','listar arquivados')
# ----------------- admin HTML -----------------
h=data['public/admin.html']
h=replace_one(h,'<button class="navbtn" data-tab="users" data-admin-only>♙ &nbsp; Usuários</button>',
 '''<button class="navbtn" data-tab="users" data-admin-only>♙ &nbsp; Usuários</button><button class="navbtn" data-tab="profile">⚙ &nbsp; Minha conta</button>''','menu minha conta')
# Move password panel to dedicated profile tab for ALL authenticated users
pass_start='<section class="surface chart-card" style="margin-top:22px"><h2>Trocar minha senha</h2>'
idx=h.find(pass_start)
if idx<0:raise RuntimeError('Não encontrei o bloco de troca de senha')
end=h.find('</section></main>',idx)
if end<0:raise RuntimeError('Limite do bloco de senha ausente')
block=h[idx:end+len('</section>')]
h=h[:idx]+h[end+len('</section>'):]
profile='<section id="tab-profile" class="hidden"><div class="page-heading"><div><h1>Minha conta</h1><p>Configurações de acesso e segurança da sua conta.</p></div></div>'+block+'</section>'
h=replace_one(h,'</main></div></div>',profile+'</main></div></div>','aba perfil')
h=replace_one(h,'<div class="filters"><button data-period="day">','<div class="filters"><button type="button" class="btn btn-secondary" id="presentation-toggle">Apresentar</button><button type="button" class="btn btn-secondary" id="print-report">Imprimir relatório</button><button data-period="day">','ações relatório')
# inject additional UI entry in requests panel (only Recurso de multa)
h=replace_one(h,'<link rel="stylesheet" href="/contingency.css">','<link rel="stylesheet" href="/contingency.css"><link rel="stylesheet" href="/report-modes.css">','report css')
# ----------------- admin JS -----------------
j=data['public/admin.js']
j=replace_one(j,"state.role=user.role==='admin'?'admin':'atendente';", "state.role=['admin','superadmin'].includes(user.role)?user.role:'atendente';",'roles front')

# Normalize additional checks (throughout UI)
j=j.replace("state.role==='admin'", "['admin','superadmin'].includes(state.role)")
j=j.replace("state.role!=='admin'", "!['admin','superadmin'].includes(state.role)")
j=replace_one(j,"['dashboard','requests','qr','users','teamchat']", "['dashboard','requests','qr','users','teamchat','profile']",'abas visibilidade')
j=replace_one(j,"tab==='teamchat'?'Chat interno':'QR Code'", "tab==='teamchat'?'Chat interno':tab==='profile'?'Minha conta':'QR Code'",'rotulo perfil')
j=replace_one(j,"user.username+' · '+(['admin','superadmin'].includes(state.role)?'Administrador':'Atendente')", "user.username+' · '+(state.role==='superadmin'?'Superadministrador':['admin','superadmin'].includes(state.role)?'Administrador':'Atendente')",'badge superadmin')
# Render archive label, not conceal it.
j=j.replace("u.role==='admin'?'Administrador':'Atendente'","u.role==='superadmin'?'Superadministrador':u.role==='admin'?'Administrador':'Atendente'")
j=replace_one(j,"let status=document.createElement('td');", "if(r.archived_at){tr.title='Solicitação arquivada pelo superadministrador';tr.style.opacity='.65';}let status=document.createElement('td');",'arquivados')
# Append request detail controls before the original contingency flow.
anchor="if(entry.service==='Recurso de multa'){"
extra_js='''
// NAVEDOCS-2026-11-16: ações privilegiadas têm autenticação renovada no servidor.
if(state.role==='superadmin'){
 const details=document.createElement('details');details.className='privileged-actions';
 const summary=document.createElement('summary');summary.textContent='Correção e arquivamento (superadministrador)';details.append(summary);
 const form=document.createElement('form');form.className='privileged-form';
 const field=(label,value)=>{const el=document.createElement('label');el.className='field';const span=document.createElement('span');span.textContent=label;const input=document.createElement('input');input.className='control';input.value=value||'';el.append(span,input);return [el,input];};
 const [nameLabel,name]=field('Nome do cidadão',entry.citizen_name),[cpfLabel,cpf]=field('CPF',entry.cpf);
 const [reasonLabel,reason]=field('Justificativa institucional', '');reason.required=true;reason.minLength=12;
 const [passLabel,password]=field('Confirme sua senha', '');password.type='password';password.required=true;password.autocomplete='current-password';
 const update=document.createElement('button');update.className='btn btn-secondary';update.type='submit';update.textContent='Salvar correção';
 const archive=document.createElement('button');archive.className='btn btn-outline';archive.type='button';archive.textContent=entry.archived_at?'Restaurar solicitação':'Arquivar solicitação';
 const feedback=document.createElement('p');feedback.setAttribute('role','status');
 form.append(nameLabel,cpfLabel,reasonLabel,passLabel,update,archive,feedback);details.append(form);root.append(details);
 form.addEventListener('submit',async e=>{e.preventDefault();update.disabled=true;feedback.textContent='Salvando…';
 try{await api('/api/requests/'+id+'/correct',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({citizen_name:name.value,cpf:cpf.value,reason:reason.value,password:password.value})});feedback.className='notice success';feedback.textContent='Correção salva e auditada.';password.value='';loadRequests();}
 catch(err){feedback.className='notice error';feedback.textContent=err.message;}finally{update.disabled=false;}});
 archive.addEventListener('click',async()=>{if(!reason.value.trim()||!password.value){feedback.textContent='Informe justificativa e senha antes de continuar.';return;}
 const action=!entry.archived_at;
 if(!window.confirm(action?'Arquivar esta solicitação? Os documentos permanecerão guardados.':'Restaurar esta solicitação?'))return;
 archive.disabled=true;try{await api('/api/requests/'+id+'/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({archive:action,reason:reason.value,password:password.value})});feedback.className='notice success';feedback.textContent=action?'Solicitação arquivada.':'Solicitação restaurada.';password.value='';archive.textContent=action?'Restaurar solicitação':'Arquivar solicitação';entry.archived_at=action?new Date().toISOString():null;loadRequests();}
 catch(err){feedback.className='notice error';feedback.textContent=err.message;}finally{archive.disabled=false;}});
}
'''
j=replace_one(j,anchor,extra_js+anchor,'controles superadmin')
manual_js='''
// Registro do papel em duas vias, vinculado ao protocolo digital do recurso.
const manualSection=document.createElement('section');manualSection.className='contingency-section';
const manualHeading=document.createElement('h3');manualHeading.textContent='Protocolo manual provisório (papel)';manualSection.append(manualHeading);
const manualNote=document.createElement('p');manualNote.className='smalltext';manualNote.textContent='Registrar o número do formulário físico em duas vias. Não substitui protocolo oficial do DETRAN.';manualSection.append(manualNote);
const blank=document.createElement('a');blank.className='btn btn-secondary';blank.href='/Protocolo_NAVETRAN_Caixas_Clicaveis_Corrigido.docx';blank.download='Protocolo_NAVETRAN_Caixas_Clicaveis_Corrigido.docx';blank.textContent='Baixar formulário de duas vias';manualSection.append(blank);
const manualSlot=document.createElement('div');manualSection.append(manualSlot);root.append(manualSection);
async function loadManual(){const result=await api('/api/requests/'+id+'/manual');manualSlot.replaceChildren();
 if(result.manual){const p=document.createElement('p');p.className='smalltext';p.textContent='Nº '+result.manual.paper_number+' · '+result.manual.category+' · '+formatDate(result.manual.received_at)+' · Registrado por '+result.manual.recorded_by;manualSlot.append(p);return;}
 if(!['admin','superadmin'].includes(state.role)){const p=document.createElement('p');p.textContent='Nenhum formulário manual vinculado.';manualSlot.append(p);return;}
 const form=document.createElement('form');form.className='manual-form';
 const add=(label,name,type='text',required=false)=>{const l=document.createElement('label');l.className='field';const span=document.createElement('span');span.textContent=label;const x=document.createElement('input');x.className='control';x.type=type;x.name=name;x.required=required;l.append(span,x);form.append(l);return x;};
 add('Número provisório da folha','paper_number','text',true).maxLength=40;
 const at=add('Data e horário do recebimento','received_at','datetime-local',true);at.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
 const cat=document.createElement('select');cat.name='category';cat.className='control';for(const v of ['Defesa de autuação','Indicação de condutor','Outro']){const o=document.createElement('option');o.value=v;o.textContent=v;cat.append(o);}const catLabel=document.createElement('label');catLabel.className='field';catLabel.textContent='Serviço no formulário';catLabel.append(cat);form.append(catLabel);
 add('Telefone (opcional)','phone').maxLength=30;add('E-mail (opcional)','email','email').maxLength=120;
 add('Placa (se aplicável)','vehicle_plate').maxLength=12;add('Nº do AIT (se aplicável)','ait_number').maxLength=40;
 const choices=['Requerimento/formulário','Documento de identificação','CNH','CRLV','Notificação/AIT','Comprovantes','Outros'];
 const documents=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent='Documentos conferidos no formulário';documents.append(legend);
 for(const v of choices){const l=document.createElement('label');const cb=document.createElement('input');cb.type='checkbox';cb.value=v;cb.name='document';l.append(cb,document.createTextNode(' '+v));documents.append(l);}form.append(documents);
 const n=document.createElement('label');n.className='field';n.textContent='Observações';const notes=document.createElement('textarea');notes.name='notes';notes.maxLength=1000;notes.rows=3;notes.className='control';n.append(notes);form.append(n);
 const check=document.createElement('label');const signed=document.createElement('input');signed.type='checkbox';signed.name='signed';check.append(signed,document.createTextNode(' As duas vias físicas foram assinadas (confirmação manual)'));form.append(check);
 const submit=document.createElement('button');submit.type='submit';submit.className='btn btn-primary';submit.textContent='Vincular protocolo manual';form.append(submit);
 const feedback=document.createElement('p');feedback.setAttribute('role','status');form.append(feedback);manualSlot.append(form);
 form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;feedback.textContent='Registrando…';const v=Object.fromEntries(new FormData(form));
 try{await api('/api/requests/'+id+'/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paper_number:v.paper_number,received_at:new Date(v.received_at).toISOString(),category:v.category,phone:v.phone,email:v.email,vehicle_plate:v.vehicle_plate,ait_number:v.ait_number,documents:[...form.querySelectorAll('[name="document"]:checked')].map(x=>x.value),notes:v.notes,signed_on_paper:signed.checked})});await loadManual();}
 catch(err){feedback.className='notice error';feedback.textContent=err.message;}finally{submit.disabled=false;}});
}
loadManual().catch(e=>{manualSlot.textContent=e.message;});
'''
j=replace_one(j,"fetchContingency().catch(err=>{feedback.className='notice error';feedback.textContent=err.message;});", "fetchContingency().catch(err=>{feedback.className='notice error';feedback.textContent=err.message;});\n"+manual_js,'formulario manual')
j+='''
// NAVEDOCS-2026-11-16: apresentação usa os mesmos gráficos do dashboard.
const presentationButton=$('#presentation-toggle');
function setPresentation(on){document.body.classList.toggle('report-presentation',on);presentationButton.textContent=on?'Sair da apresentação':'Apresentar';presentationButton.setAttribute('aria-pressed',String(on));}
presentationButton.addEventListener('click',()=>{showTab('dashboard');setPresentation(!document.body.classList.contains('report-presentation'));});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('report-presentation'))setPresentation(false);});
$('#print-report').addEventListener('click',async()=>{showTab('dashboard');await loadDashboard();window.print();});
'''
# explicit page not overwritten
css=data['public/styles.css']
report_css='''/* NAVEDOCS-2026-11-16: apresentação e impressão de indicadores reais */
.report-presentation .sidebar,.report-presentation .admin-topbar{display:none}
.report-presentation .admin-main{width:100%;min-height:100vh}
.report-presentation .page{max-width:1700px;margin:auto;padding:30px 42px}
.report-presentation #tab-dashboard{display:block!important}
.report-presentation .charts{margin-top:22px}
.privileged-actions,.manual-form{border-top:1px solid #d8e2eb;margin-top:16px;padding-top:16px}
.manual-form fieldset{display:flex;flex-wrap:wrap;gap:12px;border:1px solid #d5dfe8;border-radius:9px;padding:10px}
.manual-form fieldset label{display:inline-flex;align-items:center;gap:3px}
.manual-form .field{max-width:100%}
@media print{
 @page{size:A4 portrait;margin:14mm}
 body{color:#111!important;background:#fff!important;font-family:Arial,sans-serif}
 .sidebar,.admin-topbar,.filters,.dates,#print-report,#presentation-toggle,.sidebar-bottom,.btn,.navbtn,.header-actions{display:none!important}
 #app-view,#tab-dashboard,.admin-main,.page{display:block!important;width:100%!important;max-width:none!important;padding:0!important;margin:0!important}
 #tab-dashboard>.page-heading:before{content:'NAVETRAN · NAVEDOCS — RELATÓRIO DE ATENDIMENTOS';display:block;font-weight:700;font-size:15pt;margin-bottom:5mm;color:#102d4b}
 .surface{box-shadow:none!important;border:1px solid #ccd5dc!important;break-inside:avoid}
 .charts{display:grid!important;grid-template-columns:1fr!important;gap:8mm!important}
 .chart-card{break-inside:avoid}
 svg{max-width:100%!important}
 .metrics{display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:3mm!important}
 .metric{padding:8px!important}.metric strong{font-size:18pt!important}
 #dashboard-error{display:none!important}
}
@media(max-width:700px){.report-presentation .page{padding:14px!important}}
'''
# output package content
out={"server.js":s,"public/admin.html":h,"public/admin.js":j,"public/styles.css":css,"public/report-modes.css":report_css}
# do not modify *anything* if an anchor fails above. Backup originals before writing.
backup=ROOT/('.backup-navedocs-'+datetime.datetime.now().strftime('%Y%m%d%H%M%S'))
backup.mkdir()
for extra in ['public/navetran.svg','public/report-modes.css','public/Protocolo_NAVETRAN_Caixas_Clicaveis_Corrigido.docx']:
 if (ROOT/extra).exists():
  saved=backup/extra;saved.parent.mkdir(exist_ok=True);shutil.copy2(ROOT/extra,saved)
for name in files:
 dst=backup/name;dst.parent.mkdir(exist_ok=True);shutil.copy2(ROOT/name,dst)
for name,content in out.items():
 path=ROOT/name;path.parent.mkdir(exist_ok=True);path.write_text(content,encoding='utf-8')
asset=pathlib.Path(__file__).parent/'assets'
shutil.copy2(asset/'navetran.svg',ROOT/'public'/'navetran.svg')
shutil.copy2(asset/'Protocolo_NAVETRAN_Caixas_Clicaveis_Corrigido.docx',ROOT/'public'/'Protocolo_NAVETRAN_Caixas_Clicaveis_Corrigido.docx')
print('Alterações aplicadas à cópia local. Backup:',backup)
print('Faça testes, revisão e commit; NÃO publique sem validar autenticação e dados.')
