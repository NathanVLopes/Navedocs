import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAitFields } from '../pareceres/ocr-fields.mjs';
import { recognizeAit } from '../pareceres/ocr.mjs';
import fs from 'node:fs';
import path from 'node:path';

const sample = `CÓDIGO DO ÓRGÃO 282210
NÚMERO DO AUTO N010162492
IDENTIFICAÇÃO DO VEÍCULO
MARCA/MODELO DAFRA/NH 190
PLACA RXT6D10
IDENTIFICAÇÃO DO PROPRIETÁRIO
PROPRIETÁRIO JOSE DA CONCEICAO COELHO
IDENTIFICAÇÃO DA INFRAÇÃO
TIPIFICAÇÃO 5819-6
DATA DA INFRAÇÃO 08/06/2026
ART. 193 DO CTB`;

test('reconhece campos objetivos do AIT de exemplo e não inventa o processo',()=>{
  const d=extractAitFields(sample);
  assert.equal(d.ait,'N010162492');
  assert.equal(d.placa,'RXT6D10');
  assert.equal(d.tipificacao,'5819-6');
  assert.equal(d.data,'08/06/2026');
  assert.equal(d.marcaModelo,'DAFRA/NH 190');
  assert.equal(d.proprietario,'JOSE DA CONCEICAO COELHO');
  assert.equal(d.baseLegal,'Art. 193 do CTB');
  assert.equal(d.processo,undefined);
  assert.equal(d.requerente,undefined);
  assert.equal(d.resultado,undefined);
});

test('não deduz campos do AIT em texto ilegível',()=>{
  assert.deepEqual(extractAitFields('IDENTIFICAÇÃ0 D0 VEICUL0\n--123@??'),{});
});

test('bloqueia arquivo acima do limite antes de chamar bibliotecas de reconhecimento',async()=>{
 await assert.rejects(()=>recognizeAit(Buffer.alloc(10*1024*1024+1),'image/png'),/acima de 10 MB/);
});

test('faz OCR de imagem e usa apenas a imagem no trabalhador simulado',async()=>{
 let count=0,terminated=false;
 const mockCanvas={
   loadImage:async()=>({width:1200,height:800}),
   createCanvas:()=>({getContext:()=>({drawImage:()=>{}}),encode:async()=>Buffer.from('PNG')})
 };
 const tesseract={createWorker:async()=>({
   recognize:async(image)=>{assert.equal(image.toString(),'PNG');count++;return{data:{text:sample}}},
   terminate:async()=>{terminated=true;}
 })};
 const result=await recognizeAit(Buffer.from('image'),'image/png',{adapters:{canvas:mockCanvas,tesseract}});
 assert.equal(result.method,'ocr_imagem');
 assert.equal(result.pages,1);
 assert.equal(count,1);
 assert.ok(terminated);
});

test('PDF pesquisável usa camada de texto sem chamar OCR',async()=>{
 const content='NÚMERO DO AUTO N010162492. '.repeat(7);
 const pdfjs={getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[{str:content,transform:[0,0,0,0,0,1]}]})}),destroy:async()=>{}})})};
 const result=await recognizeAit(Buffer.from('%PDF-test'),'application/pdf',{adapters:{canvas:{},pdfjs}});
 assert.equal(result.method,'pdf_texto');
 assert.equal(result.scannedPages,0);
 assert.ok(result.text.includes('N010162492'));
});

test('PDF digitalizado usa renderização e OCR simulado',async()=>{
 let recognized=0;
 const pdfjs={getDocument:()=>({promise:Promise.resolve({numPages:1,
   getPage:async()=>({
     getTextContent:async()=>({items:[]}),
     getViewport:({scale})=>({width:400*scale,height:600*scale}),
     render:()=>({promise:Promise.resolve()}),cleanup:()=>{}
   }),destroy:async()=>{}})})};
 const canvas={createCanvas:()=>({getContext:()=>({}),encode:async()=>Buffer.from('png')})};
 const tesseract={createWorker:async()=>({recognize:async()=>{recognized++;return{data:{text:sample}}},terminate:async()=>{}})};
 const result=await recognizeAit(Buffer.from('%PDF-scan'),'application/pdf',{adapters:{canvas,pdfjs,tesseract}});
 assert.equal(result.method,'pdf_com_ocr');
 assert.equal(recognized,1);
 assert.equal(result.pages,1);
});

test('PDFs com mais de três páginas são recusados',async()=>{
 const pdfjs={getDocument:()=>({promise:Promise.resolve({numPages:4,destroy:async()=>{}})})};
 await assert.rejects(()=>recognizeAit(Buffer.from('%PDF-many'),'application/pdf',{adapters:{canvas:{},pdfjs}}),/mais de 3 páginas/);
});

test('a interface exige revisão antes de aplicar os campos',()=>{
 const html=fs.readFileSync(path.join(process.cwd(),'public/pareceres.html'),'utf8');
 const js=fs.readFileSync(path.join(process.cwd(),'public/pareceres-ocr.js'),'utf8');
 assert.match(html,/id="ocr-review"/);
 assert.match(js,/if \(!cb.checked\) continue/);
 assert.match(js,/campos/);
});
