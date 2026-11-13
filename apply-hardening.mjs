/** Executar na raiz atual do repositório NAVEDOCS: node apply-hardening.mjs */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const target=resolve(process.cwd(),'server.js');
const source=readFileSync(target,'utf8');
const helper="import { assessUpload, validNewAdminPassword } from './production-policy.mjs';\n";
if(!source.includes("import express from 'express';"))throw Error('Este não parece ser o servidor esperado: nenhuma alteração realizada.');
if(source.includes(helper))throw Error('Correção já presente; nenhuma alteração realizada.');
const originalAdmin="extraAdminPassword.length<(process.env.STAGING==='1'?8:14)";
if(!source.includes(originalAdmin))throw Error('Trecho de credencial não encontrado; nenhuma alteração realizada.');
const start=source.indexOf("app.post('/api/requests', (req,res,next)=>{");
const end=source.indexOf('},publicLimit,upload.array(',start);
if(start<0||end<0)throw Error('Trecho da rota de envio não encontrado; nenhuma alteração realizada.');
const originalRoute=source.slice(start,end);
if(!originalRoute.includes('NAVEDOCS_REAL_DATA_APPROVED')||!originalRoute.includes('internalPilot'))throw Error('Rota de envio inesperada; nenhuma alteração realizada.');
let patched=source.replace("import express from 'express';", "import express from 'express';\n"+helper.trimEnd());
patched=patched.replace(originalAdmin,"(!db.prepare('SELECT id FROM users WHERE username=?').get(extraAdminUser) && !validNewAdminPassword(extraAdminPassword))");
const replacement=`app.post('/api/requests', (req,res,next)=>{\n const access=assessUpload({\n   staging:process.env.STAGING==='1',\n   enableTestUploads:process.env.ENABLE_TEST_UPLOADS==='1',\n   internalTests:process.env.NAVEDOCS_INTERNAL_TESTS==='1',\n   realDataApproved:process.env.NAVEDOCS_REAL_DATA_APPROVED==='1',\n   userRole:currentUser(req)?.role\n });\n if(!access.allowed)return res.status(access.status).json({error:access.error});\n if(access.internal)req.user=currentUser(req);\n next();\n`;
patched=patched.replace(originalRoute,replacement);
if(patched===source)throw Error('Nenhuma alteração realizada.');
const originalHash=createHash('sha256').update(source).digest('hex');
const output=target+'.pre-hardening-'+originalHash.slice(0,10)+'.bak';
if(existsSync(output))throw Error('Backup já existe: verifique antes de executar novamente.');
// O backup fica LOCAL. Não incluir no Git (pode conter informações operacionais).
writeFileSync(output,source,{flag:'wx',mode:0o600});
writeFileSync(target,patched);
console.log('Correção aplicada. Backup local:',output);
