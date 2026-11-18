/* NAVEDOCS — confirmação de recebimento. Apenas apresentação; o envio continua em citizen.js. */
const receiptView = document.querySelector('#success-view');
const receiptCard = receiptView?.closest('.form-card');

if (receiptView && receiptCard) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/receipt-page.css';
  document.head.append(stylesheet);

  receiptView.replaceChildren();
  receiptView.innerHTML = `
    <section class="receipt-v3" aria-labelledby="receipt-title">
      <div class="receipt-top">
        <span class="receipt-symbol" aria-hidden="true">✓</span>
        <div class="receipt-heading">
          <p class="receipt-eyebrow">ENVIO CONCLUÍDO</p>
          <h1 id="receipt-title" tabindex="-1">Sua solicitação foi recebida.</h1>
          <p>O NAVEDOCS registrou seus documentos. Guarde os dados abaixo para acompanhar o atendimento.</p>
        </div>
      </div>

      <div class="receipt-fields">
        <section class="receipt-field" aria-labelledby="receipt-protocol-heading">
          <div class="receipt-field-label">
            <h2 id="receipt-protocol-heading">Número do protocolo</h2>
            <span class="receipt-field-hint">Identificação da solicitação</span>
          </div>
          <div class="receipt-field-value">
            <strong id="protocol">—</strong>
            <button class="receipt-copy" type="button" id="copy-protocol" aria-label="Copiar número do protocolo">Copiar</button>
          </div>
        </section>

        <section class="receipt-field receipt-field-private" aria-labelledby="receipt-access-heading">
          <div class="receipt-field-label">
            <h2 id="receipt-access-heading">Código privado de acesso</h2>
            <span class="receipt-field-hint">Necessário para acompanhar a conversa</span>
          </div>
          <div class="receipt-field-value receipt-code-row">
            <code id="chat-code">—</code>
            <button class="receipt-copy" type="button" id="copy-chat-code" aria-label="Copiar código privado">Copiar código</button>
          </div>
          <p class="receipt-privacy">Esse código é pessoal. Não compartilhe com terceiros. Em caso de perda, solicite a recuperação presencial à NAVETRAN.</p>
        </section>
      </div>

      <div class="receipt-feedback" id="receipt-copy-feedback" role="status" aria-live="polite"></div>
      <div class="receipt-actions">
        <a id="open-citizen-chat" class="btn btn-primary receipt-main-action" href="/acompanhar">Acompanhar minha solicitação <span aria-hidden="true">↗</span></a>
        <button id="again" class="btn btn-outline" type="button">Enviar outra solicitação</button>
      </div>
      <p class="receipt-legal">Este comprovante registra o recebimento no NAVEDOCS. Não substitui o protocolo oficial eventualmente exigido pelo órgão responsável.</p>
    </section>`;

  const feedback = receiptView.querySelector('#receipt-copy-feedback');
  async function copyValue(selector, success) {
    const value = receiptView.querySelector(selector)?.textContent?.trim();
    if (!value || value === '—') return;
    try {
      if (!navigator.clipboard?.writeText) throw Error('Clipboard indisponível');
      await navigator.clipboard.writeText(value);
      feedback.textContent = success;
    } catch {
      feedback.textContent = 'Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.';
    }
  }
  receiptView.querySelector('#copy-protocol').addEventListener('click', () => copyValue('#protocol', 'Protocolo copiado.'));
  receiptView.querySelector('#copy-chat-code').addEventListener('click', () => copyValue('#chat-code', 'Código privado copiado. Guarde-o em local seguro.'));

  let wasVisible = false;
  function syncReceiptMode() {
    const visible = !receiptView.classList.contains('hidden');
    document.body.classList.toggle('receipt-mode', visible);
    if (visible && !wasVisible) {
      feedback.textContent = '';
      receiptView.querySelector('#receipt-title')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    wasVisible = visible;
  }
  new MutationObserver(syncReceiptMode).observe(receiptView, { attributes: true, attributeFilter: ['class'] });
  syncReceiptMode();
}
