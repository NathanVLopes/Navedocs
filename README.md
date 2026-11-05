# NAVEDOCS — Gestão de Documentos | NAVETRAN

MVP de desenvolvimento local (v0.1.0). **Não publicar com dados pessoais reais sem auditoria técnica, validação LGPD, HTTPS, backups e homologação.**

## Pré-requisitos

- Node.js 22.13+ (preferencialmente uma versão LTS recente)
- npm

## Executar

1. Abra a pasta `navedocs` em um terminal.
2. Execute `npm install`.
3. Configure usuário e senha de administrador no ambiente. Windows PowerShell:

   ```powershell
   $env:ADMIN_USER="admin"
   $env:ADMIN_PASSWORD="UMA_SENHA_FORTE_COM_16_OU_MAIS_CARACTERES"
   npm start
   ```

   Linux/macOS:

   ```bash
   ADMIN_USER=admin ADMIN_PASSWORD='UMA_SENHA_FORTE_COM_16_OU_MAIS_CARACTERES' npm start
   ```

4. Cidadão: http://localhost:3000
5. Funcionários: http://localhost:3000/admin

O administrador inicial é criado **uma única vez**, no primeiro início. Senhas do ambiente não são sobrepostas a usuários existentes. Não commitar credenciais.

## Funcionalidades nesta versão

- Formulário público sem conta, com CPF validado no servidor e múltiplos anexos (até 8, de até 10 MB cada)
- Protocolo gerado após persistência da solicitação e arquivos
- Login com hash de senha `scrypt`, cookie `HttpOnly` e sessão expirada após 8 horas
- Pesquisa de solicitações, mudança de status e auditoria de mudanças
- Visualização e download com autenticação, ZIP e PDF combinado
- Dashboard com métricas reais de SQLite, barras mensais, rosca de status e serviços
- Filtro por período e atualização automática do painel a cada 30 segundos (quando aberto)
- PWA com manifesto para instalar o painel em navegadores compatíveis
- QR Code da URL pública atual para impressão

## Atenção: limites e pendências para produção

- Implantar **HTTPS** com proxy reverso configurado, domínio e certificados válidos. O ambiente local HTTP é só para testes.
- Criar usuários individuais e papéis/permissões, recuperação de senha, bloqueios distribuídos e política de sessão adequada.
- Implementar limite de requisições persistente, antivirus/varredura de arquivos, limpeza de anexos malformados e observabilidade.
- Revisar modelos de ameaças, políticas de retenção/exclusão, bases legais, direitos dos titulares, aviso de privacidade e acesso auditável conforme orientação do encarregado LGPD.
- Implantar backups criptografados, recuperação testada, armazenamento protegido, e monitoração.
- Validar formalmente os tipos de serviços com a NAVETRAN; esta lista é uma proposta inicial.
- Para operação multi-instância ou alto volume, planejar migração de SQLite para PostgreSQL.
- Validar envio e downloads end-to-end com dependências instaladas em ambiente controlado antes de produção.
- PWA instalável requer localhost ou HTTPS e navegador compatível; o sistema não pode ser usado offline para documentos protegidos.
- Para PDFs muito volumosos, a união atual usa memória e deve ser convertida para processamento assíncrono e limites explícitos.

## Estrutura

- `server.js`: API Express, banco, autenticação, anexos e gráficos
- `public/index.html`, `citizen.js`: portal do cidadão
- `public/admin.html`, `admin.js`: painel interno
- `public/styles.css`: identidade visual responsiva
- `public/manifest.webmanifest`, `sw.js`: PWA
- `data/`: banco local, não versionado
- `storage/`: arquivos privados, não servidos estaticamente

## Teste manual de aceitação

1. Inicie com senha forte configurada.
2. Cadastre uma solicitação de teste usando CPF de teste válido e PDF/JPG/PNG fictícios.
3. Verifique se o protocolo foi gerado e se o painel apresenta o registro.
4. Entre no painel administrativo e procure por nome/protocolo.
5. Abra arquivos, baixe individualmente, faça download ZIP, e una arquivos em PDF.
6. Atualize status e valide mudança nos gráficos.
7. Tente abrir `/api/requests` e URLs dos arquivos sem sessão: resposta deve ser HTTP 401.
8. Envie arquivo inválido ou maior que 10 MB: deve ser rejeitado.
9. Teste no celular, em telas grandes, teclado e navegação responsiva.
10. Instale o PWA em navegador compatível sob HTTPS e verifique atualização com uma nova versão publicada.

## Notas de segurança

O CPF, nome e documentos são dados pessoais. Nada é transmitido a serviços de terceiros pela aplicação base. Evite expor o serviço local à internet; testes iniciais devem usar apenas dados sintéticos.

## Publicação de homologação (Railway)

Este pacote está **preparado**, mas não foi publicado. Requer uma conta Railway conectada e a criação explícita de um serviço. Configure: `ADMIN_USER` e `ADMIN_PASSWORD` únicos, `STAGING=1`, `ENABLE_TEST_UPLOADS=0`, `NAVEDOCS_PRIVATE_DIR=/data`, `TRUST_PROXY=1` (somente atrás do proxy HTTPS confiável do provedor). Monte um volume persistente em `/data` **antes** de permitir uploads. Dados do SQLite e anexos não devem viver no filesystem efêmero. Configure URL HTTPS pública pelo painel da hospedagem.

Por padrão, a página do cidadão pode ser visualizada, mas o envio retorna HTTP 503 em homologação. Para testes end-to-end sob responsabilidade da equipe, mude `ENABLE_TEST_UPLOADS=1` e use **apenas dados sintéticos**, nunca CPFs ou documentos reais. Volte para `0` após os testes. Não libere o uso público sem auditoria e política de dados. O sistema não inclui contas individuais nem autorização granular e a configuração atual **não está homologada para uso real**.


## Atualização v0.1.2 — Homologação restrita

- Permite provisionar **uma conta administrativa adicional** por `NAVEDOCS_EXTRA_ADMIN_USER` e `NAVEDOCS_EXTRA_ADMIN_PASSWORD` do Railway. Cria a conta somente se ainda não existe; não modifica senhas já registradas. Em homologação requer 8 caracteres; fora da homologação requer no mínimo 14. A senha nunca deve ser salva no GitHub.
- Para habilitar envios de teste, manter `STAGING=1` e definir `ENABLE_TEST_UPLOADS=1`. **Somente o CPF fictício `000.000.000-00` é aceito no modo de testes.** Não envie informações pessoais reais, fotografias pessoais ou documentos verdadeiros.
- O código continua em avaliação, não está homologado para produção com documentos pessoais; faltam testes de segurança, mecanismos antimalware e políticas formais de tratamento/retencão de dados.
- No Railway, os arquivos `server.js`, `package.json`, `railway.json` e a pasta `public/` devem ficar na raiz do repositório. Envie os arquivos extraídos, não o ZIP.
