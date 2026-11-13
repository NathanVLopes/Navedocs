// Componente de mensagens para funcionários, sem HTML dinâmico e sem dados simulados.
const jsonHeaders={'Content-Type':'application/json'};
async function request(url,options={}){
 const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
 const value=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(value.error||`Falha na comunicação (${response.status}).`);
 return value;
}
function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function timeText(value){try{return new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}catch{return value;}}
function messageElement(message){
 const row=node('article','chat-message '+(message.sender_type==='staff'?'chat-staff':'chat-citizen'));
 const meta=node('div','chat-message-meta',(message.sender|| (message.sender_type==='staff'?'Servidor NAVETRAN':'Cidadão'))+' · '+timeText(message.created_at));
 const body=node('p','chat-message-body',message.body);
 row.append(meta,body);return row;
}
export function mountChat(container,url,title,isVisible=()=>true){
 let disposed=false,loading=false,first=true,oldest=null,hasMore=false,lastId=0;
 container.replaceChildren();
 const panel=node('section','chat-panel');const top=node('div','chat-panel-heading');
 top.append(node('h3','',title),node('small','chat-hint','Mensagens persistidas no NAVEDOCS · atualização automática'));
 const status=node('p','chat-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const older=node('button','btn btn-secondary chat-older','Carregar mensagens anteriores');older.type='button';older.hidden=true;
 const list=node('div','chat-messages');list.setAttribute('aria-label','Histórico de mensagens');
 const form=node('form','chat-compose');const label=node('label','field','Mensagem');
 const textarea=node('textarea','control');textarea.rows=3;textarea.maxLength=2000;textarea.required=true;textarea.placeholder='Digite sua mensagem para enviar...';label.append(textarea);
 const action=node('div','chat-actions');const send=node('button','btn btn-primary','Enviar mensagem');send.type='submit';action.append(send);
 form.append(label,action);panel.append(top,status,older,list,form);container.append(panel);
 async function refresh(){
  if(disposed||loading||!isVisible())return;
  loading=true;
  try{
   const data=await request(url);
   if(disposed)return;
   const items=data.items||[];
   if(first){list.replaceChildren(...items.map(messageElement));first=false;}
   else if(!items.length){list.replaceChildren();}
   else if(items[items.length-1].id!==lastId){
    // Recupera a janela recente, mesmo quando chegaram muitas mensagens.
    list.replaceChildren(...items.map(messageElement));
   }
   lastId=items.at(-1)?.id||0;
   oldest=items[0]?.id||null;hasMore=Boolean(data.hasMore);older.hidden=!hasMore;
   status.textContent='';
   if(items.length)list.scrollTop=list.scrollHeight;
  }catch(error){status.textContent='Não foi possível atualizar o chat: '+error.message;}
  finally{loading=false;}
 }
 older.addEventListener('click',async()=>{
  if(!oldest||disposed)return;older.disabled=true;
  try{const data=await request(url+'?before='+oldest);const prev=data.items||[];
   if(disposed)return;
   const height=list.scrollHeight;list.prepend(...prev.map(messageElement));
   list.scrollTop=list.scrollHeight-height;
   oldest=prev[0]?.id||oldest;hasMore=Boolean(data.hasMore);older.hidden=!hasMore;
  }catch(error){status.textContent=error.message;}finally{older.disabled=false;}
 });
 form.addEventListener('submit',async(event)=>{
  event.preventDefault();const body=textarea.value.trim();if(!body)return;
  send.disabled=true;status.textContent='Enviando mensagem...';
  try{await request(url,{method:'POST',headers:jsonHeaders,body:JSON.stringify({body})});textarea.value='';status.textContent='Mensagem enviada.';await refresh();}
  catch(error){status.textContent='Não foi possível enviar: '+error.message;}
  finally{send.disabled=false;}
 });
 const interval=setInterval(refresh,12000);
 refresh();
 return ()=>{disposed=true;clearInterval(interval);};
}
export async function showUnread(){
 const el=document.querySelector('#chat-unread');if(!el)return;
 const data=await request('/api/staff/chat/unread');const total=data.items.reduce((sum,item)=>sum+item.unread,0);
 el.hidden=!total;el.textContent=total>99?'99+':String(total);
 el.setAttribute('aria-label',total+' mensagens do cidadão não lidas');
 const container=document.querySelector('#chat-unread-list');
 if(container){container.replaceChildren();const heading=node('strong','','Mensagens de cidadãos aguardando leitura');container.append(heading);
 if(!data.items.length)container.append(node('p','smalltext','Nenhuma mensagem pendente de leitura.'));
 for(const item of data.items){const row=node('div','chat-alert-item');const label=node('span','',item.protocol+' · '+item.unread+' nova(s)');const button=node('button','btn btn-secondary','Abrir solicitação');button.type='button';button.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('navedocs-open-request',{detail:{id:item.id}})));row.append(label,button);container.append(row);}
 }

}
