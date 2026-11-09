# NAVEDOCS v0.1.8 — Preparação operacional (NÃO PUBLICADO)

Esta versão inclui as funcionalidades anteriores (admin/atendente, protocolo manual de contingência DETRAN) e remove o CPF fictício e as referências visíveis à homologação do formulário/manifesto. Mantém dados e volume existentes.

## Arquivos a atualizar no GitHub
- `server.js` (raiz)
- `public/admin.html`, `public/admin.js`, `public/contingency.css`
- `public/index.html`, `public/manifest.webmanifest`

Outros arquivos e pastas permanecem intactos. Não publique o ZIP como arquivo isolado.

## Liberação de operações (após testes, backup e autorização institucional)
O backend continua a bloquear envios reais sem a variável `NAVEDOCS_REAL_DATA_APPROVED=1`. `STAGING=0` remove o modo de demonstração; `ENABLE_TEST_UPLOADS=0` e `NAVEDOCS_INTERNAL_TESTS=0` desativam as modalidades anteriores. **Não altere essas variáveis antes de revisar e testar esta versão.**

O projeto e o domínio no Railway continuam contendo "homologacao"; retirar esse termo exige também migração de domínio/ambiente, separada do comportamento do sistema, com publicação planejada e links/QRs atualizados.

## Condições para operar com dados pessoais reais
- Backup e restauração verificáveis do volume SQLite e anexos, e plano de continuidade.
- Testes com CPF inválido/válido e arquivos sintéticos; validação de permissões, autenticação, sessão, CSRF, tráfego HTTPS, limites e exaustão de armazenamento.
- Avaliação LGPD, acesso mínimo, retenção, privacidade e auditoria.
- Aprovação administrativa/jurídica do uso do comprovante de contingência, sem apresentá-lo como protocolo do DETRAN.
- Substituir senhas fracas e registrar cada atendente individualmente.

## Rollback
Reverter o commit e desabilitar recebimento com `NAVEDOCS_REAL_DATA_APPROVED=0`. Não apagar o volume.
