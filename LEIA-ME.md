# NAVEDOCS — endurecimento de segurança pré-produção (0.2.1)

## Escopo

Este pacote contém um patch conservador para a versão atualmente instalada no repositório. **Não muda o banco, os documentos, as interfaces, nem publica o sistema.** Corrige duas regras de servidor:

1. Com `STAGING=1`, o recebimento só é permitido se `ENABLE_TEST_UPLOADS=1`, `NAVEDOCS_INTERNAL_TESTS=1` **e** a sessão pertencer a um administrador ou atendente. Não existe recebimento público por uma combinação acidental de variáveis.
2. Ao sair de homologação, a senha adicional fraca de um administrador **já cadastrado** não impede a inicialização. Para cadastrar um novo administrador adicional via ambiente, a senha deve ser forte (mín. 16 caracteres, maiúscula, minúscula, dígito e símbolo). A senha antiga deve ser trocada pelo titular; esta correção **não a fortalece automaticamente**.

## Aplicação sem sobrescrever arquivos existentes

1. Faça clone/backup do repositório e execute o patch em um branch, jamais diretamente em produção.
2. Copie `apply-hardening.mjs` e `production-policy.mjs` para a raiz do repositório.
3. Execute `node apply-hardening.mjs` na raiz. O script valida trechos do servidor existente, cria uma cópia local `server.js.pre-hardening-*.bak` e aborta se a estrutura não corresponder.
4. Execute `node --check server.js` e `node --test tests/production-policy.test.mjs`. Revise `git diff` antes de fazer o commit.
5. **Não suba o backup `.bak` para o GitHub.** Comite apenas `server.js`, `production-policy.mjs` e os testes; os scripts de aplicação podem ficar locais.

## Verificações realizadas aqui

- `node --check server.js` na cópia da versão 0.1.8: aprovado.
- `node --test tests/production-policy.test.mjs`: 5 testes aprovados.
- Não foi possível executar a aplicação Express real, browser ou testes HTTP neste ambiente, pois não estão disponíveis as dependências Node do projeto e acesso à infraestrutura interna.
- Não foi possível verificar a integridade/restauração de backup do volume Railway nem os requisitos institucionais de privacidade.

## Gates de publicação (não ativar antes das validações)

Para simular internamente, usar `STAGING=1`, `NAVEDOCS_INTERNAL_TESTS=1`, `ENABLE_TEST_UPLOADS=1`, `NAVEDOCS_REAL_DATA_APPROVED=0`, com documentos **sintéticos** e conta autenticada.

Somente após verificação de backup+restauração, testes HTTP/UI, revisão de acessos/criptografia, privacidade e autorização institucional, transitar de modo controlado para:

- `STAGING=0`
- `ENABLE_TEST_UPLOADS=0`
- `NAVEDOCS_INTERNAL_TESTS=0`
- `NAVEDOCS_REAL_DATA_APPROVED=1`

ATENÇÃO: o `STAGING=0` sozinho **não autoriza** o envio, que permanece fechado se `NAVEDOCS_REAL_DATA_APPROVED` não estiver em `1`.

Retirar “homologacao” do domínio é outra mudança, com atualização dos QR codes. **Não renomeie a URL sem plano de migração**.

## Rollback

Voltar o commit do patch, preservar `/data`, desabilitar uploads com `NAVEDOCS_REAL_DATA_APPROVED=0` e confirmar que o banco e os arquivos continuam acessíveis. O backup local da aplicação não é backup do SQLite ou dos documentos.
