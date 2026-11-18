import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const repo=process.cwd();
test('pareceres tem rotas privadas e interface própria',()=>{
 const server=fs.readFileSync(path.join(repo,'server.js'),'utf8');
 const module=fs.readFileSync(path.join(repo,'pareceres','server.mjs'),'utf8');
 assert.match(server,/registerParecerRoutes\(\{app,db,auth,root,privateRoot\}\)/);
 assert.match(module,/app\.get\('\/pareceres',auth,/);
 for(const pathName of ["/api/pareceres","/api/pareceres/:id","/api/pareceres/:id/ait","/api/pareceres/:id/minuta.pdf"]){assert.ok(module.includes(pathName));}
});
test('menu de Pareceres presente na área administrativa',()=>{
 const html=fs.readFileSync(path.join(repo,'public','admin.html'),'utf8');assert.match(html,/href="\/pareceres"/);
});
test('minuta é identificada como não aprovada',()=>{
 const m=fs.readFileSync(path.join(repo,'pareceres','server.mjs'),'utf8');assert.match(m,/MINUTA - SEM APROVACAO/);
});
