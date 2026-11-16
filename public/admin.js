import {mountChat,showUnread,userAvatar} from '/chat-ui.js';
const $=s=>document.querySelector(s),state={start:'',end:'',tab:'dashboard',items:[],role:'atendente'};
async function api(url,opt={}){let r=await fetch(url,{credentials:'same-origin',...opt});let d=await r.json().catch(()=>({}));if(r.status===401 && url!=='/api/login'){setLoggedOut();throw Error('Sessão expirada. Faça login novamente.');}if(!r.ok)throw Error(d.error||'Não foi possível completar a operação.');return d;}
function setLoggedOut(){setPresentation(false);$('#login-view').classList.remove('hidden');$('#app-view').classList.add('hidden');}
function loggedIn(user){state.user=user;state.role=['admin','superadmin'].includes(user.role)?user.role:'atendente';document.querySelectorAll('[data-admin-only]').forEach(el=>el.classList.toggle('hidden',!['admin','superadmin'].includes(state.role)));$('#userbox').textContent=user.username+' · '+(state.role==='superadmin'?'Superadministrador':['admin','superadmin'].includes(state.role)?'Administrador':'Atendente')+' · NAVETRAN';renderOwnAvatar();$('#login-view').classList.add('hidden');$('#app-view').classList.remove('hidden');showTab(!['admin','superadmin'].includes(state.role)&&state.tab==='users'?'dashboard':state.tab);showUnread().catch(()=>{});}
$('#login-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.target;const button=form.querySelector('button');button.disabled=true;$('#login-error').textContent='';try{const d=await api('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});form.reset();loggedIn(d.user);}catch(err){$('#login-error').className='notice error';$('#login-error').textContent=err.message;}finally{button.disabled=false;}});
$('#logout').addEventListener('click',async()=>{try{await api('/api/logout',{method:'POST'});setLoggedOut();}catch(err){alertError(err.message);}});
function alertError(msg){const el=state.tab==='requests'?$('#requests-error'):$('#dashboard-error');el.className='notice error';el.textContent=msg;}
function showTab(tab){if(tab==='users'&&!['admin','superadmin'].includes(state.role))return;state.tab=tab;for(const k of ['dashboard','requests','qr','users','teamchat','profile'])$('#tab-'+k).classList.toggle('hidden',k!==tab);document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('#current-tab').textContent=tab==='dashboard'?'Visão geral':tab==='requests'?'Solicitações':tab==='users'?'Usuários':tab==='teamchat'?'Chat interno':tab==='profile'?'Minha conta':'QR Code';if(tab==='dashboard')loadDashboard();if(tab==='requests')loadRequests();if(tab==='qr')$('#portal-url').textContent=location.origin+'/';if(tab==='users')loadUsers();if(tab==='teamchat'&&!$('#team-chat-mount').firstChild)mountChat($('#team-chat-mount'),'/api/staff/chat/team','Chat da equipe',()=>!$('#tab-teamchat').classList.contains('hidden'));}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));
$('#open-internal-upload').addEventListener('click',()=>{window.location.assign('/interno');});
function localDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function period(p){let d=new Date(),s='';if(p==='day')s=localDate(d);else if(p==='month')s=localDate(new Date(d.getFullYear(),d.getMonth(),1));else if(p==='year')s=localDate(new Date(d.getFullYear(),0,1));state.start=s;state.end=p==='all'?'':localDate(d);$('#start').value=state.start;$('#end').value=state.end;document.querySelectorAll('[data-period]').forEach(b=>b.classList.toggle('active',b.dataset.period===p));loadDashboard();}
document.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>period(b.dataset.period)));
$('#apply-dates').addEventListener('click',()=>{state.start=$('#start').value;state.end=$('#end').value;if(state.start&&state.end&&state.start>state.end){alertError('A data inicial precisa ser anterior à data final.');return;}document.querySelectorAll('[data-period]').forEach(b=>b.classList.remove('active'));loadDashboard();});
const nf=n=>new Intl.NumberFormat('pt-BR').format(n||0),empty='<p class="empty">Nenhum registro no período selecionado.</p>';
async function loadDashboard(){try{$('#dashboard-error').textContent='';let d=await api('/api/dashboard?'+new URLSearchParams({start:state.start,end:state.end}));$('#total').textContent=nf(d.totals.total);$('#pending').textContent=nf(d.totals.pending);$('#analyzing').textContent=nf(d.totals.analyzing);$('#done').textContent=nf(d.totals.done);renderBars(d.monthly);renderDonut(d.totals);renderServices(d.services);$('#report-period').textContent=state.start||state.end?'Período: '+(state.start||'início')+' a '+(state.end||'hoje'):'Período: todos os registros';return true;}catch(err){alertError(err.message);return false;}}
function svgEl(name,attrs={}){const el=document.createElementNS('http://www.w3.org/2000/svg',name);for(let [key,val] of Object.entries(attrs))el.setAttribute(key,val);return el;}
function renderBars(rows){let root=$('#monthly-chart');root.replaceChildren();if(!rows.length){root.innerHTML=empty;return;}let data=rows.slice(-12),max=Math.max(1,...data.map(r=>r.value)),svg=svgEl('svg',{viewBox:'0 0 700 230',class:'bar-chart',role:'img','aria-label':'Recebimentos por mês'});for(let i=0;i<=4;i++){let y=190-i*42;svg.append(svgEl('line',{x1:40,y1:y,x2:690,y2:y,stroke:'#e9eef3'}));let t=svgEl('text',{x:29,y:y+4,'text-anchor':'end'});t.textContent=Math.round(max*i/4);svg.append(t);}let w=640/data.length;data.forEach((r,i)=>{let x=47+i*w, h=r.value/max*164;svg.append(svgEl('rect',{x,y:190-h,width:Math.min(w*.55,56),height:h,rx:5,fill:'#2178b5'}));let text=svgEl('text',{x:x+Math.min(w*.55,56)/2,y:212,'text-anchor':'middle'});text.textContent=r.label.slice(5) + '/' + r.label.slice(2,4);svg.append(text);});root.append(svg);}
function renderDonut(t){let root=$('#status-chart');root.replaceChildren();let total=t.total||0;if(!total){root.innerHTML=empty;return;}let colors=['#f0b64d','#688ce2','#2aa978'],vals=[t.pending||0,t.analyzing||0,t.done||0],names=['Pendentes','Em análise','Concluídos'],offset=0;let wrapper=document.createElement('div');wrapper.className='donut-layout';let svg=svgEl('svg',{viewBox:'0 0 200 200',class:'donut',role:'img','aria-label':'Distribuição por status'});svg.append(svgEl('circle',{cx:100,cy:100,r:70,fill:'none',stroke:'#eef2f5','stroke-width':24}));vals.forEach((v,i)=>{if(!v)return;let c=svgEl('circle',{cx:100,cy:100,r:70,fill:'none',stroke:colors[i],'stroke-width':24,'stroke-dasharray':`${v/total*439.823} 439.823`,'stroke-dashoffset':-offset,'transform':'rotate(-90 100 100)'});svg.append(c);offset+=v/total*439.823;});let t1=svgEl('text',{x:100,y:98,'text-anchor':'middle',style:'font-size:27px;font-weight:800;fill:#193f60'});t1.textContent=nf(total);svg.append(t1);let t2=svgEl('text',{x:100,y:118,'text-anchor':'middle',style:'font-size:12px;fill:#8295a7'});t2.textContent='total';svg.append(t2);wrapper.append(svg);let legend=document.createElement('div');legend.className='legend';vals.forEach((v,i)=>{let p=document.createElement('div');let dot=document.createElement('span');dot.className='dot';dot.style.background=colors[i];p.append(dot,document.createTextNode(names[i]+': '+nf(v)));legend.append(p);});wrapper.append(legend);root.append(wrapper);}
function renderServices(rows){let root=$('#service-chart');root.replaceChildren();if(!rows.length){root.innerHTML=empty;return;}let max=rows[0].value;const list=document.createElement('div');list.className='service-list';rows.forEach(r=>{let el=document.createElement('div');let head=document.createElement('div');head.className='service-title';let label=document.createElement('span');label.textContent=r.label;let value=document.createElement('strong');value.textContent=nf(r.value);head.append(label,value);let track=document.createElement('div');track.className='track';let fill=document.createElement('span');fill.style.width=(100*r.value/max)+'%';track.append(fill);el.append(head,track);list.append(el);});root.append(list);}
const statusNames={pendente:'Pendente',em_analise:'Em análise',concluido:'Concluído'};
function formatDate(s){return new Date(s).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}
async function loadRequests(){try{$('#requests-error').textContent='';let d=await api('/api/requests?'+new URLSearchParams({q:$('#search').value,status:$('#status-filter').value}));state.items=d.items;let tbody=$('#requests-table');tbody.replaceChildren();if(!d.items.length){let tr=document.createElement('tr');let td=document.createElement('td');td.colSpan=8;td.className='empty';td.textContent='Nenhuma solicitação encontrada.';tr.append(td);tbody.append(tr);return;}d.items.forEach(r=>{let tr=document.createElement('tr');let cells=[r.protocol,r.citizen_name,r.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'),r.service,formatDate(r.created_at)];cells.forEach((val,i)=>{let td=document.createElement('td');if(i===0){let b=document.createElement('strong');b.textContent=val;td.append(b);}else td.textContent=val;tr.append(td);});if(r.archived_at){tr.title='Solicitação arquivada pelo superadministrador';tr.style.opacity='.65';}let status=document.createElement('td');let b=document.createElement('span');b.className='status '+r.status;b.textContent=statusNames[r.status];status.append(b);tr.append(status);let count=document.createElement('td');count.textContent=r.file_count;tr.append(count);let action=document.createElement('td'),btn=document.createElement('button');btn.className='row-action';btn.textContent='Abrir →';btn.addEventListener('click',()=>openDetail(r.id));action.append(btn);tr.append(action);tbody.append(tr);});}catch(err){$('#requests-error').className='notice error';$('#requests-error').textContent=err.message;}}
$('#search-btn').addEventListener('click',loadRequests);$('#search').addEventListener('keydown',e=>{if(e.key==='Enter')loadRequests();});$('#status-filter').addEventListener('change',loadRequests);$('#refresh').addEventListener('click',loadRequests);
let detailChatCleanup;
function closeDetail(){detailChatCleanup?.();detailChatCleanup=null;$('#detail-overlay').classList.add('hidden');}
$('#detail-close').addEventListener('click',closeDetail);$('#detail-overlay').addEventListener('click',e=>{if(e.target===$('#detail-overlay'))closeDetail();});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetail();});
async function openDetail(id){detailChatCleanup?.();detailChatCleanup=null;try{let d=await api('/api/requests/'+id),entry=d.entry,root=$('#detail-body');root.replaceChildren();let info=document.createElement('p');info.className='smalltext';info.textContent=`${entry.protocol} · ${entry.citizen_name} · ${entry.cpf} · ${entry.service} · Enviado em ${formatDate(entry.created_at)}`;root.append(info);let label=document.createElement('label');label.className='field';let s=document.createElement('span');s.textContent=['admin','superadmin'].includes(state.role)?'Situação da solicitação':'Situação (somente leitura)';let select=document.createElement('select');select.className='control';Object.entries(statusNames).forEach(([v,t])=>{let o=document.createElement('option');o.value=v;o.textContent=t;select.append(o);});select.value=entry.status;select.disabled=!['admin','superadmin'].includes(state.role);let notice=document.createElement('div');notice.setAttribute('role','status');select.addEventListener('change',async()=>{if(!['admin','superadmin'].includes(state.role))return;select.disabled=true;notice.textContent='Salvando…';try{await api('/api/requests/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:select.value})});notice.className='notice success';notice.textContent='Status atualizado.';loadRequests();}catch(err){select.value=entry.status;notice.className='notice error';notice.textContent=err.message;}finally{select.disabled=false;}});label.append(s,select);root.append(label,notice);let heading=document.createElement('h3');heading.textContent='Arquivos enviados ('+d.files.length+')';root.append(heading);let files=document.createElement('div');files.className='files-area';d.files.forEach(f=>{let row=document.createElement('div');row.className='file-row';let name=document.createElement('span');name.textContent=f.original_name+' · '+(f.size/1024/1024).toFixed(1)+' MB';let links=document.createElement('div');const url='/api/requests/'+id+'/files/'+f.id;[['Visualizar',url],['Baixar',url+'?download=1']].forEach(([text,href])=>{let a=document.createElement('a');a.href=href;a.textContent=text;a.target='_blank';a.rel='noopener';a.style.marginRight='12px';links.append(a);});row.append(name,links);files.append(row);});root.append(files);let actions=document.createElement('div');actions.className='modal-actions';[['Baixar todos (ZIP)','/api/requests/'+id+'/zip'],['Unir em PDF','/api/requests/'+id+'/merged.pdf']].forEach(([text,href])=>{let a=document.createElement('a');a.href=href;a.className='btn btn-secondary';a.textContent=text;actions.append(a);});root.append(actions);
const chatRoot=document.createElement('section');chatRoot.className='chat-request-section';root.append(chatRoot);detailChatCleanup=mountChat(chatRoot,'/api/staff/chat/request/'+id,'Conversa com o cidadão',()=>!$('#detail-overlay').classList.contains('hidden'));
if(['admin','superadmin'].includes(state.role)){
 const access=document.createElement('details');access.className='chat-access';const summary=document.createElement('summary');summary.textContent='Gerenciar acesso do cidadão ao chat';access.append(summary);
 const explanation=document.createElement('p');explanation.className='smalltext';explanation.textContent='Emita um novo código apenas após verificar a identidade do cidadão por procedimento institucional. A emissão invalida o código anterior.';access.append(explanation);
 const rotate=document.createElement('button');rotate.type='button';rotate.className='btn btn-secondary';rotate.textContent='Emitir novo código';access.append(rotate);
 const out=document.createElement('p');out.className='chat-code-output';out.setAttribute('role','status');access.append(out);
 rotate.addEventListener('click',async()=>{if(!window.confirm('Confirmar emissão de um novo código de acesso? O anterior deixará de funcionar.'))return;rotate.disabled=true;out.textContent='';try{const d=await api('/api/staff/chat/request/'+id+'/access',{method:'POST'});out.textContent='Código privado (copie agora): '+d.chatCode;}catch(e){out.textContent=e.message;}finally{rotate.disabled=false;}});
 root.append(access);
}

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
if(['Recurso de multa','Recurso à JARI','Recurso ao CETRAN'].includes(entry.service)){
 const section=document.createElement('section');section.className='contingency-section';
 const title=document.createElement('h3');title.textContent='Contingência DETRAN';section.append(title);
 const description=document.createElement('p');description.className='smalltext';description.textContent='Protocolo interno de recebimento. Não substitui o protocolo oficial do DETRAN.';section.append(description);
 const feedback=document.createElement('div');feedback.setAttribute('role','status');section.append(feedback);
 const content=document.createElement('div');section.append(content);root.append(section);
 const fetchContingency=async()=>{const value=await api('/api/requests/'+id+'/contingency');content.replaceChildren();feedback.textContent='';const c=value.contingency;
  if(c){
   const info=document.createElement('p');info.textContent='Registro interno: '+c.code+' · '+formatDate(c.created_at)+' · '+c.issued_by;content.append(info);
   const reason=document.createElement('p');reason.className='smalltext';reason.textContent='Motivo: '+c.reason;content.append(reason);
   const pdf=document.createElement('a');pdf.className='btn btn-secondary';pdf.href='/api/requests/'+id+'/contingency.pdf';pdf.textContent='Baixar comprovante de contingência (PDF)';content.append(pdf);
   if(c.external_protocol){const external=document.createElement('p');external.textContent='Protocolo oficial informado: '+c.external_protocol;content.append(external);}
   else if(['admin','superadmin'].includes(state.role)){
    const form=document.createElement('form');form.className='field';
    const label=document.createElement('label');label.className='field';label.textContent='Número do protocolo oficial após retorno do DETRAN';
    const input=document.createElement('input');input.className='control';input.required=true;input.maxLength=80;input.minLength=5;label.append(input);
    const save=document.createElement('button');save.className='btn btn-primary';save.type='submit';save.textContent='Vincular protocolo oficial';form.append(label,save);
    form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{await api('/api/requests/'+id+'/contingency',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({external_protocol:input.value})});await fetchContingency();}catch(err){feedback.className='notice error';feedback.textContent=err.message;}finally{save.disabled=false;}});content.append(form);
   }
  }else if(['admin','superadmin'].includes(state.role)){
   const form=document.createElement('form');const label=document.createElement('label');label.className='field';label.textContent='Motivo da indisponibilidade (obrigatório)';
   const textarea=document.createElement('textarea');textarea.className='control';textarea.rows=3;textarea.minLength=12;textarea.maxLength=500;textarea.required=true;textarea.placeholder='Descreva a indisponibilidade observada e o motivo do registro interno.';label.append(textarea);
   const btn=document.createElement('button');btn.className='btn btn-primary';btn.type='submit';btn.textContent='Gerar protocolo interno de contingência';form.append(label,btn);content.append(form);
   form.addEventListener('submit',async e=>{e.preventDefault();btn.disabled=true;try{await api('/api/requests/'+id+'/contingency',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:textarea.value})});await fetchContingency();}catch(err){feedback.className='notice error';feedback.textContent=err.message;}finally{btn.disabled=false;}});
  }else{const note=document.createElement('p');note.textContent='Nenhum protocolo de contingência cadastrado. Solicite ao administrador.';content.append(note);}
 };
 fetchContingency().catch(err=>{feedback.className='notice error';feedback.textContent=err.message;});

// Registro do papel em duas vias, vinculado ao protocolo digital do recurso.
const manualSection=document.createElement('section');manualSection.className='contingency-section';
const manualHeading=document.createElement('h3');manualHeading.textContent='Protocolo manual provisório (papel)';manualSection.append(manualHeading);
const manualNote=document.createElement('p');manualNote.className='smalltext';manualNote.textContent='Registrar o número do formulário físico em duas vias. Não substitui protocolo oficial do DETRAN.';manualSection.append(manualNote);
const blank=document.createElement('a');blank.className='btn btn-secondary';blank.href='/Protocolo_NAVETRAN_Caixas_Clicaveis_Corrigido.docx';blank.download='Protocolo_NAVETRAN_Caixas_Clicaveis_Corrigido.docx';blank.textContent='Baixar formulário de duas vias';manualSection.append(blank);
const manualSlot=document.createElement('div');manualSection.append(manualSlot);root.append(manualSection);
async function loadManual(){const result=await api('/api/requests/'+id+'/manual');manualSlot.replaceChildren();
 if(result.manual){
  const m=result.manual, details=document.createElement('dl');
  const fields=[['Número provisório',m.paper_number],['Recebimento',formatDate(m.received_at)],['Serviço',m.category],
   ['Telefone',m.phone],['E-mail',m.email],['Placa',m.vehicle_plate],['AIT',m.ait_number],
   ['Documentos conferidos',m.documents.join(', ')],['Observações',m.notes],
   ['Assinaturas confirmadas',m.signed_on_paper?'Sim':'Não'],['Registrado por',m.recorded_by],['Data do registro',formatDate(m.created_at)]];
  for(const [label,value] of fields){const term=document.createElement('dt'),description=document.createElement('dd');term.textContent=label;description.textContent=value||'—';details.append(term,description);}
  manualSlot.append(details);return;
 }
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

}
$('#detail-overlay').classList.remove('hidden');}catch(err){alertError(err.message);}}
document.addEventListener('navedocs-open-request',e=>openDetail(e.detail.id));
$('#print-qr').addEventListener('click',()=>window.print());
if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('/sw.js').catch(()=>{});
setInterval(()=>{if(!$('#app-view').classList.contains('hidden'))showUnread().catch(()=>{});},20000);
period('month');setInterval(()=>{if(!$('#app-view').classList.contains('hidden')){if(state.tab==='dashboard')loadDashboard();if(state.tab==='requests')loadRequests();}},30000);api('/api/me').then(d=>loggedIn(d.user)).catch(()=>setLoggedOut());

// Gerenciamento de contas acessível somente ao administrador, com validação também no servidor.
async function loadUsers(){try{const d=await api('/api/users');const list=$('#users-list');list.replaceChildren();for(const u of d.items){const row=document.createElement('div');row.className='file-row';const label=document.createElement('span');label.textContent=u.username+' — '+(u.role==='superadmin'?'Superadministrador':u.role==='admin'?'Administrador':'Atendente');row.append(userAvatar(u.id,u.username),label);list.append(row);}}catch(err){$('#users-feedback').textContent=err.message;}}
$('#new-user-form').addEventListener('submit',async event=>{event.preventDefault();if(!['admin','superadmin'].includes(state.role))return;const form=event.currentTarget,button=form.querySelector('button[type=submit]');button.disabled=true;$('#users-feedback').textContent='';try{const data=Object.fromEntries(new FormData(form));await api('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});form.reset();$('#users-feedback').textContent='Usuário cadastrado.';await loadUsers();}catch(err){$('#users-feedback').textContent=err.message;}finally{button.disabled=false;}});
$('#password-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type=submit]');button.disabled=true;$('#password-feedback').textContent='';try{const data=Object.fromEntries(new FormData(form));await api('/api/me/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});form.reset();setLoggedOut();$('#login-error').textContent='Senha atualizada. Entre novamente.';}catch(err){$('#password-feedback').textContent=err.message;}finally{button.disabled=false;}});

// NAVEDOCS-2026-11-16: apresentação usa os mesmos gráficos do dashboard.
function setPresentation(on){const presentationButton=$('#presentation-toggle');document.body.classList.toggle('report-presentation',on);presentationButton.textContent=on?'Sair da apresentação':'Apresentar';presentationButton.setAttribute('aria-pressed',String(on));}
$('#presentation-toggle').addEventListener('click',()=>{showTab('dashboard');setPresentation(!document.body.classList.contains('report-presentation'));});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('report-presentation'))setPresentation(false);});
$('#print-report').addEventListener('click',async()=>{if(await loadDashboard())window.print();});

function renderOwnAvatar(revision=''){
 const {id,username}=state.user;
 $('#userbox .user-avatar')?.remove();
 $('#userbox').prepend(userAvatar(id,username,revision));
 $('#profile-avatar').replaceChildren(userAvatar(id,username,revision));
}
const avatarForm=$('#avatar-form');
async function changeAvatar(method,body){
 const buttons=avatarForm.querySelectorAll('button');
 buttons.forEach(button=>button.disabled=true);
 const feedback=$('#avatar-feedback');
 feedback.textContent='Salvando…';
 try{
  await api('/api/me/avatar',{method,body});
  avatarForm.reset();
  renderOwnAvatar(Date.now());
  feedback.textContent=method==='DELETE'?'Foto removida.':'Foto atualizada.';
 }catch(error){feedback.textContent=error.message;}
 finally{buttons.forEach(button=>button.disabled=false);}
}
avatarForm.addEventListener('submit',event=>{
 event.preventDefault();
 const file=avatarForm.elements.avatar.files[0];
 if(file.size>2*1024*1024){$('#avatar-feedback').textContent='A foto deve ter até 2 MB.';return;}
 changeAvatar('POST',new FormData(avatarForm));
});
$('#avatar-remove').addEventListener('click',()=>changeAvatar('DELETE'));
