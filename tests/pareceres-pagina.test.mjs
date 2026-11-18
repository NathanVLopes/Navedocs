import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('página de Pareceres existe e expõe os controles usados pelo JS',()=>{
  const html=readFileSync(new URL('../public/pareceres.html',import.meta.url),'utf8');
  for(const id of ['fields','editor','motivo','resultado','requerente-tipo','notice','items','editing-title','ait-download','upload-status','history','audit','new','use-name','save','upload-button','ait-upload','extract','ait-text','pdf']){
    assert.match(html,new RegExp(`id="${id}"`),`Faltando elemento #${id}`);
  }
  for(const field of ['requestId','relatorio','tese','fundamentacao','conclusao','observacoes'])assert.match(html,new RegExp(`name="${field}"`));
  assert.match(html,/src="\/pareceres\.js"/);
  assert.match(html,/href="\/pareceres\.css"/);
});
