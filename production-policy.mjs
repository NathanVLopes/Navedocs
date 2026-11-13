/** Política de envio: nega por padrão, sempre. Não interpreta nomes de ambiente como autorização. */
export function assessUpload({staging, enableTestUploads, internalTests, realDataApproved, userRole}) {
  if (staging) {
    if (!enableTestUploads || !internalTests) return {allowed:false, status:503, error:'Recebimento de documentos desativado neste ambiente.'};
    if (!['admin','atendente'].includes(userRole)) return {allowed:false, status:401, error:'Acesse sua conta de funcionário para realizar o teste interno.'};
    return {allowed:true, internal:true};
  }
  if (!realDataApproved) return {allowed:false, status:503, error:'Recebimento ainda não autorizado.'};
  return {allowed:true, internal:false};
}

/** Apenas credenciais novas são validadas; antigas precisam ser trocadas pelo usuário. */
export function validNewAdminPassword(password) {
  return typeof password === 'string' && password.length >= 16 && password.length <= 128
    && /[a-z]/.test(password) && /[A-Z]/.test(password)
    && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
}
