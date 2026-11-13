# NAVEDOCS v0.2.0 — Chats por protocolo e equipe

**Base da atualização:** NAVEDOCS operacional v0.1.8, preservando as alterações do menu v0.1.9. O projeto no GitHub foi inspecionado em 12/11/2026 (commit `707096eba25cffedc8247ff5e5f47fd1c609ca1f`); a conexão GitHub concede somente leitura. **Nenhuma mudança foi publicada.**

## O que foi implementado

### Chat cidadão ↔ NAVETRAN
- Cada solicitação enviada recebe `chatCode` criptograficamente aleatório (64 caracteres hexadecimais) junto ao protocolo.
- O código é entregue somente na resposta do envio; o servidor armazena somente hash SHA-256, nunca o código em texto puro.
- Cidadão abre `/acompanhar`, informa protocolo + código privado e lê/envia mensagens persistidas no SQLite.
- **CPF e protocolo sozinhos não autenticam.** Não existe endpoint de busca pública por CPF.
- Para solicitações anteriores à versão, **administrador** pode emitir um novo código após verificar a identidade do cidadão. O código anterior é invalidado.
- A página usa `sessionStorage` para facilitar a continuação no mesmo dispositivo; a opção Sair remove o código da sessão.
- Textos são inseridos com `textContent`; não se interpreta HTML de mensagens.

### Chat interno entre servidores
- Aba **Chat interno**, para perfis `admin` e `atendente` autenticados.
- Conversa interna global, completamente separada do chat de cidadãos e inacessível nas APIs públicas.
- Dentro de **Solicitações → Abrir**, existe **Conversa com o cidadão** para aquele protocolo.
- Visualização de mensagens recentes, paginação de mensagens antigas, envio e atualização automática a cada 12 segundos.
- Indicador de novas mensagens recebidas do cidadão e atalhos para a solicitação correspondente.
- Nenhuma mensagem do chat interno aparece no portal público.

## Arquivos a aplicar no repositório

**Raiz:** `server.js` (contém tabelas aditivas e APIs de chat, preservando o sistema de contingência DETRAN, usuários, documentos e upload).

**Pasta `public/`:**
- Substituir: `admin.html`, `admin.js`, `index.html`, `citizen.js`.
- Adicionar: `chat-ui.js`, `chat.css`, `acompanhar.html`, `citizen-chat.js`.

**Não remover:** `data`, `storage`, `public/contingency.css`, `public/pwa.js`, `public/sw.js`, manifest, logos ou demais arquivos existentes.

> Atenção: estes são arquivos completos baseados no pacote anterior. Antes de substituir, compare com eventuais modificações locais posteriores. Faça backup/commit anterior e aplique preferencialmente em branch de teste. Não envie conteúdo de `data/` ou `storage/` ao GitHub.

## Ativação controlada

O chat está **desativado por padrão** (`NAVEDOCS_CHAT_ENABLED` ausente ou diferente de `1`). Após conferir um deploy de teste e executar os testes integrados, configure no Railway do serviço correto:

`NAVEDOCS_CHAT_ENABLED=1`

A flag do chat **não libera uploads**; não altera `STAGING`, `ENABLE_TEST_UPLOADS`, `NAVEDOCS_REAL_DATA_APPROVED` ou `NAVEDOCS_INTERNAL_TESTS`. Sem autorizações e validações institucionais, mantenha bloqueado o recebimento público de dados reais.

A persistência precisa permanecer no volume já existente (`/data`) com `NAVEDOCS_PRIVATE_DIR=/data`. Faça backup verificado da base e arquivos antes do deploy. A migração só adiciona `chat_access`, `chat_messages` e `chat_reads`, sem apagar tabelas anteriores.

## Checklist obrigatório para homologação

1. Confirmar que volume existente está montado e dados/protocolos anteriores continuam visíveis.
2. Testar envio com dados **sintéticos** e comprovar que o retorno inclui `protocol` e `chatCode`; salvar esse código.
3. Acessar `/acompanhar` com protocolo+token: enviar mensagem, ler no painel, responder e confirmar retorno.
4. Protocolo sem token / token incorreto / token de outro protocolo: acesso negado.
5. Funcionário não autenticado: endpoints internos retornam HTTP 401.
6. Atendente: pode conversar mas não pode emitir novo token; admin pode emitir e o token antigo deixa de funcionar.
7. Chat interno: mensagem visível para servidores logados, invisível ao cidadão.
8. Testar falha de rede, reconexão, mensagens vazias e acima de 2.000 caracteres, mensagens concorrentes e recarga.
9. Verificar CSP, cookies, logs, rate limiting, backups, autorização para tratamento de dados e política de retenção.
10. Fazer teste visual mobile/desktop e de acessibilidade; o build e testes locais não provam isso.

## Limitações explícitas

- **Mensagens de texto apenas**, sem arquivos anexados ao chat. Complementos documentais continuam no fluxo de upload existente.
- Atualização por polling, não WebSocket/push. Indicador de não lidas de mensagens do cidadão para funcionários.
- Sala interna global para equipe; não há salas internas individuais nem controle de designação por atendente.
- Códigos privados de mensagens antigas só poderão ser emitidos pelo administrador. O sistema não envia automaticamente por e-mail ou SMS.
- Não há integração com DETRAN nem garantia de prazo/protocolo oficial.
- Em relação às conversas, ainda faltam políticas institucionais de retenção/expurgo e testes ponta a ponta em produção.

## Verificações executadas

- `node --check` para todos os arquivos JavaScript modificados.
- `node --test tests/chat.test.mjs`: 4 testes locais aprovados (SQLite em memória, isolamento de canais, hash de código, cursor de leitura e verificações estruturais de autorização).
- Não foi possível executar testes HTTP com Express/navegador neste ambiente por falta de dependências instaladas; **não afirmar que os chats estão funcionando em produção**.
