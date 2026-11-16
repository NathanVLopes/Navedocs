from pathlib import Path
import sys, subprocess
root=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else None
if root is None:raise SystemExit('Passe o diretório do repositório atualizado')
for file in ['server.js','public/admin.js']:
 result=subprocess.run(['node','--check',str(root/file)],capture_output=True,text=True)
 assert result.returncode==0,(file,result.stderr)
s=(root/'server.js').read_text()
h=(root/'public/admin.html').read_text()
j=(root/'public/admin.js').read_text()
assert h.count('id="tab-profile"')==1
assert h.count('id="password-form"')==1
assert h.count('id="presentation-toggle"')==1
assert h.count('id="print-report"')==1
assert "function superOnly(req,res,next)" in s and "req.user?.role!=='superadmin'" in s
assert "CREATE TABLE IF NOT EXISTS paper_appeal_receipts" in s
assert "CREATE TABLE IF NOT EXISTS privileged_request_actions" in s
assert "CREATE TABLE IF NOT EXISTS detran_contingencies" in s
assert "['admin','superadmin'].includes(state.role)" in j
assert (root/'public'/'navetran.svg').exists()
assert (root/'public'/'Protocolo_NAVETRAN_Caixas_Clicaveis_Corrigido.docx').exists()
print('PASSOU: sintaxe JS e verificações estáticas de integração. Testes dinâmicos pendentes.')
