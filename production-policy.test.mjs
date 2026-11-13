import test from 'node:test';
import assert from 'node:assert/strict';
import {assessUpload, validNewAdminPassword} from '../production-policy.mjs';
const testSettings={staging:true,enableTestUploads:true,internalTests:true,realDataApproved:false};
test('homologação sem permissão bloqueia qualquer envio',()=>{
 for(const testUploads of [true,false])for(const pilot of [true,false]){
  if(testUploads&&pilot)continue;
  for(const role of [undefined,'admin','atendente'])assert.equal(assessUpload({...testSettings,enableTestUploads:testUploads,internalTests:pilot,userRole:role}).allowed,false);
 }
});
test('piloto interno bloqueia visitantes e permite funcionário',()=>{
 assert.equal(assessUpload({...testSettings}).status,401);
 assert.equal(assessUpload({...testSettings,userRole:'admin'}).allowed,true);
 assert.equal(assessUpload({...testSettings,userRole:'atendente'}).allowed,true);
 assert.equal(assessUpload({...testSettings,userRole:'visitante'}).allowed,false);
});
test('produção permanece fechada sem liberação explícita',()=>{
 for(const role of [undefined,'admin'])assert.equal(assessUpload({staging:false,enableTestUploads:true,internalTests:true,realDataApproved:false,userRole:role}).status,503);
});
test('produção aprovada permite envio público',()=>{
 assert.equal(assessUpload({staging:false,enableTestUploads:false,internalTests:false,realDataApproved:true}).allowed,true);
});
test('não aceita novas senhas administrativas fracas',()=>{
 for(const p of ['', 'cabrita32', 'aaaaaaaaaaaaaaaa', 'Aaaaaaaa11111111','Aaaaaaaa!!!!!!!!!'])assert.equal(validNewAdminPassword(p),false);
 assert.equal(validNewAdminPassword('UmaSenhaForte#2026!'),true);
});
