
const $ = selector => document.querySelector(selector);

let session = null;
let interval = null;
let oldest = null;
let latest = 0;
let loading = false;

function msgView(msg) {
  const article = document.createElement('article');
  article.className =
    'chat-message ' +
    (msg.sender_type === 'citizen' ? 'chat-citizen' : 'chat-staff');

  const info = document.createElement('div');
  info.className = 'chat-message-meta';
  info.textContent =
    (msg.sender_type === 'citizen'
      ? 'Você'
      : 'NAVETRAN · ' + (msg.sender || 'Atendimento')) +
    ' · ' +
    new Date(msg.created_at).toLocaleString('pt-BR');

  const body = document.createElement('p');
  body.className = 'chat-message-body';
  body.textContent = msg.body;

  article.append(info, body);
  return article;
}

async function api(options = {}) {
  if (!session) {
    throw Error('Informe seu protocolo e código privado.');
  }

  const { headers = {}, ...rest } = options;

  const response = await fetch(
    '/api/citizen/chat/' + encodeURIComponent(session.protocol),
    {
      ...rest,
      cache: 'no-store',
      headers: {
        ...headers,
        'X-NAVEDOCS-ACCESS': session.code
      }
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Error(data.error || 'Falha na comunicação.');
  }

  return data;
}

async function refresh(strict = false) {
  if (!session || loading || document.hidden) return;

  loading = true;

  try {
    const data = await api();
    const list = $('#citizen-messages');
    const messages = data.items || [];

    if ((messages.at(-1)?.id || 0) !== latest) {
      list.replaceChildren(...messages.map(msgView));
      list.scrollTop = list.scrollHeight;
      latest = messages.at(-1)?.id || 0;
    }

    oldest = messages[0]?.id || null;
    $('#citizen-older').hidden = !data.hasMore;
    $('#citizen-chat-status').textContent = '';
  } catch (error) {
    $('#citizen-chat-status').textContent = error.message;

    if (strict) throw error;
  } finally {
    loading = false;
  }
}

$('#chat-access-form').addEventListener('submit', async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector('button');
  const input = Object.fromEntries(new FormData(form));

  const protocol = String(input.protocol || '')
    .trim()
    .toUpperCase();

  const code = String(input.code || '').trim();

  session = { protocol, code };

  button.disabled = true;
  $('#chat-error').textContent = '';

  try {
    await refresh(true);

    if (!session) {
      throw Error('Sessão indisponível.');
    }

    $('#citizen-chat').classList.remove('hidden');
    $('#chat-protocol').textContent = 'Conversa · ' + protocol;

    form.classList.add('hidden');

    sessionStorage.setItem('navedocs-chat-' + protocol, code);
    sessionStorage.setItem('navedocs-last-protocol', protocol);

    if (interval) clearInterval(interval);
    interval = setInterval(refresh, 12000);
  } catch (error) {
    session = null;
    $('#chat-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('#citizen-compose').addEventListener('submit', async event => {
  event.preventDefault();

  const button = event.currentTarget.querySelector('button');
  const textarea = event.currentTarget.elements.body;
  const body = textarea.value.trim();

  if (!body) return;

  button.disabled = true;
  $('#citizen-chat-status').textContent = 'Enviando...';

  try {
    await api({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ body })
    });

    textarea.value = '';

    await refresh();

    $('#citizen-chat-status').textContent = 'Mensagem registrada.';
  } catch (error) {
    $('#citizen-chat-status').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('#citizen-older').addEventListener('click', async () => {
  if (!oldest || !session) return;

  const button = $('#citizen-older');
  button.disabled = true;

  try {
    const response = await fetch(
      '/api/citizen/chat/' +
        encodeURIComponent(session.protocol) +
        '?before=' +
        oldest,
      {
        headers: {
          'X-NAVEDOCS-ACCESS': session.code
        },
        cache: 'no-store'
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw Error(data.error || 'Não foi possível carregar mensagens.');
    }

    const list = $('#citizen-messages');
    const height = list.scrollHeight;

    list.prepend(...data.items.map(msgView));
    list.scrollTop = list.scrollHeight - height;

    oldest = data.items[0]?.id || oldest;
    button.hidden = !data.hasMore;
  } catch (error) {
    $('#citizen-chat-status').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('#leave-chat').addEventListener('click', () => {
  if (interval) clearInterval(interval);

  interval = null;
  session = null;

  $('#citizen-chat').classList.add('hidden');
  $('#chat-access-form').classList.remove('hidden');
  $('#chat-access-form').elements.code.value = '';

  sessionStorage.removeItem(
    'navedocs-chat-' +
      ($('#chat-access-form').elements.protocol.value || '')
  );

  $('#citizen-messages').replaceChildren();
  latest = 0;
  oldest = null;
});

const last = sessionStorage.getItem('navedocs-last-protocol');

if (last) {
  $('#chat-access-form').elements.protocol.value = last;
  $('#chat-access-form').elements.code.value =
    sessionStorage.getItem('navedocs-chat-' + last) || '';
}
