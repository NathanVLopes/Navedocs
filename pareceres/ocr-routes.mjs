import { readFileSync } from 'node:fs';
import path from 'node:path';
import { recognizeAit } from './ocr.mjs';
import { extractAitFields } from './ocr-fields.mjs';

/** Rotas restritas a usuários autenticados do NAVEDOCS. */
export function registerAitOcrRoutes({ app, auth, lookup, privateRoot, directory, audit }) {
  const busy = new Set();
  const attempts = new Map();
  const MAX_PER_MINUTE = 3;
  app.post('/api/pareceres/:id/extrair-ait', auth, lookup, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    const userId = req.user.id;
    if (!req.parecer.ait_filename || !['image/jpeg','image/png','application/pdf'].includes(req.parecer.ait_mime)) {
      return res.status(400).json({ error: 'Anexe um AIT em PDF, JPG ou PNG antes de extrair os dados.' });
    }
    if (busy.has(userId) || busy.size >= 2) {
      return res.status(429).json({ error: 'Outra leitura de AIT está em andamento. Conclua-a antes de iniciar outra.' });
    }
    const now = Date.now();
    const recent = (attempts.get(userId) || []).filter(t => now - t < 60000);
    if (recent.length >= MAX_PER_MINUTE) {
      return res.status(429).json({ error: 'Limite temporário de leituras atingido. Tente novamente mais tarde.' });
    }
    attempts.set(userId, [...recent, now]);
    if (attempts.size > 10000) for (const [id, times] of attempts) if (times.every(t => now - t >= 60000)) attempts.delete(id);
    busy.add(userId);
    try {
      const bytes = readFileSync(path.join(directory, req.parecer.ait_filename));
      const result = await recognizeAit(bytes, req.parecer.ait_mime, { privateRoot });
      const campos = extractAitFields(result.text);
      audit(req.parecer.id, userId, 'ocr_ait_solicitado');
      return res.json({
        campos, metodo: result.method, paginas: result.pages,
        aviso: Object.keys(campos).length
          ? 'Dados sugeridos pela leitura do AIT. Confira cada informação antes de aplicar; os campos não foram alterados automaticamente.'
          : 'Não foi possível reconhecer campos com segurança. Confira a legibilidade do AIT e preencha manualmente.'
      });
    } catch (error) {
      // Não registrar texto extraído nem dados pessoais em logs.
      const known = /mais de 3 páginas|Arquivo AIT inválido|Tipo de AIT não aceito/.test(error.message);
      if (!known) console.error('Falha técnica na leitura local do AIT:', error.name);
      return res.status(known ? 422 : 503).json({ error: known ? error.message : 'Leitura automática indisponível para este arquivo. Confira o AIT e preencha manualmente.' });
    } finally {
      busy.delete(userId);
    }
  });
}
