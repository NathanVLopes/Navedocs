/* NAVEDOCS — reorganização não destrutiva dos detalhes da solicitação.
   Mantém elementos e listeners existentes. Sem dados simulados. */
const root = document.getElementById('detail-body');
const overlay = document.getElementById('detail-overlay');
const modal = overlay?.querySelector('.modal');
if (root && overlay && modal) {
  modal.classList.add('request-detail-modal');
  const rootObserver = new MutationObserver(() => {
    if (overlay.classList.contains('hidden')) return;
    if (root.querySelector(':scope > .detail-shell')) return;
    if (!root.querySelector(':scope > .chat-request-section')) return;
    buildDetailLayout();
  });
  rootObserver.observe(root, { childList: true });
  const visibilityObserver = new MutationObserver(() => {
    if (!overlay.classList.contains('hidden')) {
      if (!root.querySelector(':scope > .detail-shell')) buildDetailLayout();
    } else {
      restoreFocus?.focus?.();
    }
  });
  visibilityObserver.observe(overlay, {attributes:true, attributeFilter:['class']});
  let restoreFocus = null;
  overlay.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || overlay.classList.contains('hidden')) return;
    const focusable = [...overlay.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]')]
      .filter(el => !el.closest('[hidden]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    if (!focusable.length) return;
    const first=focusable[0], last=focusable[focusable.length-1];
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
  });
  function el(tag, cls, text) {
    const node=document.createElement(tag);
    if(cls) node.className=cls;
    if(text!==undefined) node.textContent=text;
    return node;
  }
  function buildDetailLayout() {
    const parts=[...root.children];
    const info=parts.find(node => node.tagName==='P' && node.classList.contains('smalltext'));
    const status=parts.find(node => node.tagName==='LABEL' && node.querySelector('select'));
    const statusFeedback=status?.nextElementSibling;
    const fileHeading=parts.find(node => node.tagName==='H3' && node.textContent?.startsWith('Arquivos enviados'));
    const fileList=parts.find(node => node.classList.contains('files-area'));
    const downloadActions=parts.find(node => node.classList.contains('modal-actions'));
    const chat=parts.find(node => node.classList.contains('chat-request-section'));
    if(!info || !status || !fileList || !chat) return;
    restoreFocus = document.activeElement instanceof HTMLElement && !overlay.contains(document.activeElement) ? document.activeElement : restoreFocus;
    const [protocol='',citizen='',cpf='',service='',date=''] = (info.textContent||'').split(' · ');
    const shell=el('div','detail-shell');
    const heading=el('div','detail-identity');
    const headingLeft=el('div','detail-heading-left');
    const overline=el('div','detail-overline');
    const code=el('span','detail-protocol',protocol);
    overline.append(code);
    const copy=el('button','detail-copy','Copiar protocolo');copy.type='button';
    copy.addEventListener('click',async()=>{
      try { await navigator.clipboard.writeText(protocol);copy.textContent='Copiado'; }
      catch {copy.textContent='Não foi possível copiar';}
    });
    overline.append(copy);
    headingLeft.append(overline,el('h2','detail-service-title',service||'Solicitação'),el('p','detail-date',date));
    const select=status.querySelector('select');
    const badge=el('span','detail-status-pill');
    const names={pendente:'Pendente',em_analise:'Em análise',concluido:'Concluído'};
    function syncBadge(){badge.textContent=names[select.value]||select.selectedOptions[0]?.textContent||'Situação';badge.dataset.status=select.value;}
    select.addEventListener('change',syncBadge);
    if(statusFeedback)new MutationObserver(syncBadge).observe(statusFeedback,{childList:true,characterData:true,subtree:true});
    syncBadge();
    heading.append(headingLeft,badge);
    const metadata=el('div','detail-meta');
    const who=el('div','detail-meta-item');who.append(el('span','detail-meta-key','Cidadão'),el('strong','',citizen));
    const cpfItem=el('div','detail-meta-item');const cpfValue=el('strong','detail-cpf',cpf.replace(/\D/g,'').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,'***.***.***-$4'));
    const showCpf=el('button','detail-cpf-toggle','Mostrar CPF');showCpf.type='button';let cpfVisible=false;
    showCpf.setAttribute('aria-pressed','false');
    showCpf.addEventListener('click',()=>{cpfVisible=!cpfVisible;cpfValue.textContent=cpfVisible?cpf:cpf.replace(/\D/g,'').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,'***.***.***-$4');showCpf.textContent=cpfVisible?'Ocultar CPF':'Mostrar CPF';showCpf.setAttribute('aria-pressed',String(cpfVisible));});
    cpfItem.append(el('span','detail-meta-key','CPF'),cpfValue,showCpf);
    metadata.append(who,cpfItem);
    const statusBox=el('section','detail-status-editor');
    statusBox.append(status,el('p','detail-autosave','Alterações de situação são salvas automaticamente no sistema.'));
    if(statusFeedback) statusBox.append(statusFeedback);
    const tabs=el('div','detail-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Seções da solicitação');
    const content=el('div','detail-tab-contents');
    const definitions=[['documents','Documentos'],['chat','Atendimento'],['protocol','Protocolo'],['history','Histórico']];
    const panelMap=new Map(),buttons=new Map();
    function activate(id,focus=false){
      for(const [key,panel] of panelMap){const active=key===id;panel.hidden=!active;buttons.get(key).setAttribute('aria-selected',String(active));buttons.get(key).tabIndex=active?0:-1;}
      if(focus)buttons.get(id)?.focus();
    }
    definitions.forEach(([id,title],index)=>{
      const tab=el('button','detail-tab',title);tab.type='button';tab.id='detail-tab-'+id;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','detail-panel-'+id);tab.addEventListener('click',()=>activate(id));
      tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const n=event.key==='Home'?0:event.key==='End'?definitions.length-1:(index+(event.key==='ArrowRight'?1:definitions.length-1))%definitions.length;activate(definitions[n][0],true);});
      buttons.set(id,tab);tabs.append(tab);
      const panel=el('section','detail-tab-panel');panel.id='detail-panel-'+id;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);panelMap.set(id,panel);content.append(panel);
    });
    const docPanel=panelMap.get('documents');if(fileHeading)docPanel.append(fileHeading);docPanel.append(fileList);if(downloadActions)docPanel.append(downloadActions);
    const chatPanel=panelMap.get('chat');chatPanel.append(chat);
    const access=parts.find(node=>node.classList.contains('chat-access'));if(access)chatPanel.append(access);
    const protocolPanel=panelMap.get('protocol');
    const contingency=parts.filter(node=>node.classList.contains('contingency-section'));
    if(contingency.length)contingency.forEach(node=>protocolPanel.append(node));
    else protocolPanel.append(el('p','detail-empty','Não há registro de contingência para este tipo de solicitação.'));
    const privileged=parts.find(node=>node.classList.contains('privileged-actions'));if(privileged)protocolPanel.append(privileged);
    const historyPanel=panelMap.get('history');
    const historyStatus=el('p','detail-history-status','Consultando registros de auditoria…');historyStatus.setAttribute('role','status');historyPanel.append(historyStatus);
    const id=(fileList.querySelector('a[href*="/api/requests/"]')?.getAttribute('href') || downloadActions?.querySelector('a[href*="/api/requests/"]')?.getAttribute('href') || '').match(/\/api\/requests\/(\d+)/)?.[1];
    if(id)loadHistory(id,historyPanel,historyStatus);
    else historyStatus.textContent='Histórico indisponível para esta solicitação.';
    shell.append(heading,metadata,statusBox,tabs,content);
    root.replaceChildren(shell);
    info.hidden=true; // Conteúdo original convertido em cabeçalho; dados não são alterados no banco.
    activate('documents');
    buttons.get('documents').focus({preventScroll:true});
  }
  async function loadHistory(id,panel,status){
    try {
      const response=await fetch('/api/requests/'+encodeURIComponent(id)+'/history',{credentials:'same-origin',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(data.error||'Não foi possível consultar o histórico.');
      const timeline=el('ol','detail-timeline');
      for(const item of data.items||[]){
        const li=el('li','detail-event');
        li.append(el('strong','',item.label||'Alteração registrada'),el('p','',`${new Date(item.created_at).toLocaleString('pt-BR')} · ${item.username||'Sistema'}`));
        timeline.append(li);
      }
      if(!timeline.children.length)status.textContent='Nenhuma alteração registrada no histórico disponível.';
      else { status.remove();panel.append(timeline); }
    }catch(error){status.className='notice error';status.textContent=error.message;}
  }
}
