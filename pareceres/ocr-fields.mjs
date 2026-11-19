/** Reconhecimento conservador: não deduz nomes, decisões nem dados ilegíveis. */
const trim = s => String(s || '').replace(/\s+/g, ' ').trim();
const clean = s => trim(s).replace(/^[\s:#\-–]+/, '').slice(0, 240);

export function extractAitFields(text) {
  const raw = String(text || '').slice(0, 100000);
  const normal = raw.normalize('NFKC').replace(/\r/g, '');
  const lines = normal.split('\n').map(trim).filter(Boolean);
  const upper = normal.toUpperCase();
  const fields = {};
  const patterns = {
    ait: /\b[A-Z]{1,2}\s?\d{7,12}\b/g,
    placa: /\b[A-Z]{3}[0-9][A-Z0-9][0-9]{2}\b/g,
    tipificacao: /\b\d{4}[-–]\d\b/g,
    data: /\b(?:0[1-9]|[12]\d|3[01])\/(?:0[1-9]|1[0-2])\/20\d{2}\b/g,
  };
  // Localiza informações perto dos rótulos; se há múltiplas candidatas, deixa em branco.
  const labels = {
    ait: /(?:N[ÚU]MERO\s+DO\s+AUTO|AUTO\s+DE\s+INFRA[ÇC][ÃA]O|AUTO\s+N[º°])/i,
    placa: /\bPLACA\b/i,
    tipificacao: /(?:ENQUADRAMENTO|TIPIFICA[ÇC][ÃA]O|C[ÓO]DIGO\s+DA\s+INFRA[ÇC][ÃA]O)/i,
    data: /(?:DATA\s+DA\s+INFRA[ÇC][ÃA]O|DATA\s+DO\s+COMETIMENTO)/i,
  };
  for (const [field, regex] of Object.entries(patterns)) {
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      if (!labels[field].test(lines[i])) continue;
      const near = lines.slice(i, i + 2).join(' ').toUpperCase();
      const candidates = [...near.matchAll(regex)].map(m => m[0].replace(/\s/g, ''));
      if (candidates.length === 1) hits.push(candidates[0]);
    }
    const unique = [...new Set(hits)];
    if (unique.length === 1) fields[field] = unique[0];
    else if (unique.length === 0) {
      const all = [...upper.matchAll(regex)].map(m => m[0].replace(/\s/g, ''));
      const single = [...new Set(all)];
      if (single.length === 1) fields[field] = single[0];
    }
  }
  function labelled(re) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (!m) continue;
      const possible = clean(lines[i].slice(m.index + m[0].length)) || clean(lines[i+1] || '');
      if (possible.length < 4 || possible.length > 100 || /^(CPF|CNPJ|CNH|RENAVAM|PLACA|N[ÚU]MERO|DATA|IDENTIFICA)/i.test(possible)) continue;
      if (/\d{5,}/.test(possible)) continue;
      return possible;
    }
    return null;
  }
  const names = {
    proprietario: /(?:NOME\s+DO\s+PROPRIET[ÁA]RIO|^PROPRIET[ÁA]RIO\s*[:\-]?)/i,
    condutor: /(?:NOME\s+DO\s+CONDUTOR|^CONDUTOR\s*[:\-]?)/i,
    marcaModelo: /(?:MARCA\s*\/\s*MODELO|MARCA\s+MODELO)/i,
  };
  for (const [field, label] of Object.entries(names)) {
    const v = labelled(label);
    if (v) fields[field] = v;
  }
  const legal = normal.match(/\b(?:ART(?:IGO)?\.?\s*)(\d{1,3}(?:\s*[-,]\s*\d{1,3})?)\s*(?:DO\s+CTB)?\b/i);
  if (legal) fields.baseLegal = `Art. ${legal[1]} do CTB`;
  // Nome do requerente e número do processo não aparecem necessariamente no AIT.
  return fields;
}
