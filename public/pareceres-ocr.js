const $ = selector => document.querySelector(selector);
const rows = $('#ocr-review-rows');
const panel = $('#ocr-review');
const notice = $('#ocr-notice');
const labelMap = {
  ait:'Auto de infração', tipificacao:'Tipificação', data:'Data', marcaModelo:'Marca/modelo',
  placa:'Placa', proprietario:'Proprietário', condutor:'Condutor', baseLegal:'Base legal',
};
let lastId = null;

export function resetAitReview(hasAit) {
  panel.hidden = true;
  rows.replaceChildren();
  notice.textContent = '';
  $('#ocr-run').disabled = !hasAit;
}

export async function startAitReview(id, form) {
  if (!id) return;
  lastId = id;
  const button = $('#ocr-run');
  button.disabled = true;
  notice.textContent = 'Lendo o Auto de Infração… A conferência dos campos será necessária.';
  panel.hidden = true;
  rows.replaceChildren();
  try {
    const response = await fetch('/api/pareceres/' + encodeURIComponent(id) + '/extrair-ait', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(result.error || `Falha HTTP ${response.status}`);
    notice.textContent = result.aviso || 'Confira os campos identificados.';
    const entries = Object.entries(result.campos || {}).filter(([key,value]) =>
      Object.hasOwn(labelMap, key) && typeof value === 'string' && value.trim()
    );
    if (!entries.length) return;
    for (const [key, suggested] of entries) {
      const existing = form.elements[key]?.value || '';
      const row = document.createElement('div');row.className = 'ocr-row';
      const checkLabel = document.createElement('label');
      const check = document.createElement('input');check.type='checkbox';check.checked=!existing;
      check.dataset.field=key;
      checkLabel.append(check, document.createTextNode(labelMap[key] + (existing ? ' · já preenchido' : '')));
      const input = document.createElement('input');input.type='text';input.value=suggested;input.maxLength=240;
      input.setAttribute('aria-label', 'Valor sugerido para ' + labelMap[key]);
      const old = document.createElement('small');old.textContent = existing ? 'Valor atual: ' + existing : 'Campo atual vazio';
      row.append(checkLabel,input,old);rows.append(row);
    }
    panel.hidden=false;
    $('#ocr-apply').focus();
  } catch (error) {
    notice.textContent = error.message;
  } finally {
    button.disabled=false;
  }
}

export function bindAitReview(form, currentId) {
  $('#ocr-run').addEventListener('click', () => startAitReview(currentId(), form));
  $('#ocr-cancel').addEventListener('click', () => {panel.hidden=true;rows.replaceChildren();notice.textContent='Sugestões descartadas. Nenhum campo foi alterado.';});
  $('#ocr-apply').addEventListener('click', () => {
    if (lastId !== currentId()) {notice.textContent='O parecer ativo mudou. Refaça a leitura antes de aplicar os campos.';panel.hidden=true;return;}
    let count=0;
    for (const row of rows.children) {
      const cb = row.querySelector('input[type=checkbox]');
      if (!cb.checked) continue;
      const input=row.querySelector('input[type=text]');
      const el=form.elements[cb.dataset.field];
      if (!el || !input.value.trim()) continue;
      el.value=input.value.trim();count++;
    }
    panel.hidden=true;rows.replaceChildren();
    notice.textContent=`${count} campo(s) aplicado(s) ao formulário. Confira o AIT original e salve o rascunho.`;
  });
}
