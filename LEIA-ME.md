# NAVEDOCS — atualização técnica proposta (16/11/2026)

**Status:** patch preparado e testado estaticamente em cópia local baseada no pacote NAVEDOCS v0.2.0. **Não aplicado ao GitHub/Railway, não testado contra o banco de produção/homologação.**

## Como aplicar com segurança

1. Faça backup recuperável do banco SQLite e da pasta de documentos do volume Railway. Preserve o serviço/volume `navedocs-homologacao-dados`, o ambiente e os segredos.
2. Baixe/clon​e a versão mais recente do repositório `NathanVLopes/Navedocs` em uma pasta de trabalho, nunca uma pasta de dados do Railway.
3. Execute `python aplicar_atualizacao.py /caminho/para/Navedocs`. O script valida pontos de alteração e recusa versões incompatíveis. Ele cria `.backup-navedocs-AAAAMMDDHHMMSS/` dos arquivos existentes.
4. Execute `node --check server.js` e `node --check public/admin.js`, instale dependências a partir de `package-lock.json` se presente (`npm ci`), execute `npm test` e teste os fluxos em uma cópia isolada do banco de dados. **Não rode o processo modificado apontando para `/data` antes de testar a migração em cópia.**
5. Revise diferenças (`git diff`), execute os testes de permissão, acessibilidade e regressão; só então envie mudanças ao GitHub e publique em homologação com autorização.
6. Após validação, para provisionar uma conta **nova** superadministradora, configure no Railway (como secrets) `NAVEDOCS_SUPERADMIN_USER` e `NAVEDOCS_SUPERADMIN_PASSWORD`. A senha deve ter entre 20 e 128 caracteres, com maiúscula, minúscula, número e símbolo; **não coloque a senha no GitHub**. A alteração das variáveis reinicia o serviço e deve ser feita apenas depois de verificar o deploy. Não afeta senhas já cadastradas.

## Funcionalidades incluídas

- **Logo:** substituição somente de `public/navetran.svg` pelo arquivo transparente fornecido pelo usuário (verificado: cantos com alfa 0); preservação das cores e desenho.
- **Minha conta:** a troca de senha passa a aparecer somente na aba `Minha conta`; disponível tanto para atendente quanto para administrador.
- **Protocolo manual:** no detalhe de uma solicitação de **Recurso de multa**, um atendente visualiza e um administrador registra número provisório do papel, data/hora, serviço do formulário (defesa, indicação ou outro), telefone/e-mail, placa/AIT, checklist de documentos, observações, confirmação de assinaturas, servidor e data do registro. Número e vínculo são únicos e auditados. O template original em DOCX de **duas vias** é oferecido para download. O registro manual permanece separado do protocolo eletrônico interno `NVD-CONT` e do número oficial do DETRAN. Para um caso exclusivamente físico, primeiro registre o recebimento pela entrada interna autorizada, depois vincule o papel a essa solicitação.
- **Superadministrador:** perfil separado dos administradores existentes, só provisionado por configuração segura. Pode corrigir nome/CPF e **arquivar/restaurar**, jamais eliminar fisicamente, mediante justificativa e confirmação de senha atual. Todas as ações são registradas em tabelas de auditoria. Contas `admin` e `atendente` continuam sem acesso a estas rotas.
- **Relatórios:** botões `Apresentar`/`Sair da apresentação` e `Imprimir relatório` no dashboard existente; preserva gráficos e filtros originais. Impressão usa uma folha A4 com regras CSS específicas, sem imprimir os botões/menu.

## Limites importantes

- **Não foi desenvolvido** um fluxo para cadastrar o papel sem uma solicitação digital prévia, nem um upload específico de digitalização da via assinada. Esses itens exigem requisitos de guarda/assinatura institucional.
- O arquivamento conserva os dados e **não os exclui dos números históricos** do dashboard. A listagem administrativa sinaliza visualmente casos arquivados. Mudança da regra de indicadores exigirá homologação com a NAVETRAN.
- Não existe conexão oficial com o DETRAN; nenhum protocolo aqui é certificado como protocolo emitido pelo DETRAN.
- O patch faz uma migração **aditiva** no SQLite (`requests.archived_at`, `paper_appeal_receipts`, `privileged_request_actions`). Deve ser testado com backup e plano de recuperação antes do deploy.
- O código ainda não teve teste end-to-end real com login, envio e persistência: somente validação sintática e de pontos de inserção em cópia local.

## Checklist para validação obrigatória

- Servidor inicia com base de teste; volume correto permanece conectado; mensagens e documentos anteriores estão preservados.
- Usuário atendente consegue acessar `Minha conta`, **não** gerencia usuários ou ações privilegiadas; administrador mantém funções existentes; superadmin só executa ações depois de informar sua senha e justificativa.
- Formulário manual recusa número duplicado, serviço diferente de Recurso de multa e payloads inválidos; aparece após recarga; não confunde com o protocolo DETRAN.
- Arquivamento e restauração são auditados, os documentos permanecem acessíveis às pessoas autorizadas e não ocorre exclusão definitiva.
- Modo apresentação e impressão mostram dados agregados corretos para o período escolhido em desktop/mobile/A4; fechar com Esc restaura a tela.
- A logo transparente aparece no portal, acompanhamento e admin após cache limpo.

## Reversão

Restaure os arquivos da pasta `.backup-navedocs-...` antes de novo deploy. Como a migração é aditiva, **não apague as tabelas/coluna** após gravação de dados sem procedimento aprovado de preservação de registros e um backup completo. Para problemas em homologação, reverta o código e preserve o volume intacto.
