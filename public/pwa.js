// O serviço offline armazena somente ícones, CSS e a página de indisponibilidade.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', {scope:'/'}).catch(error => {
    console.warn('NAVEDOCS: service worker indisponível', error);
  }));
}
const installButton = document.getElementById('pwa-install');
let installEvent;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (installButton && !isStandalone) {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installEvent = event;
    installButton.hidden = false;
  });
  installButton.addEventListener('click', async () => {
    if (!installEvent) return;
    const prompt = installEvent;
    installEvent = null;
    installButton.disabled = true;
    try { await prompt.prompt(); await prompt.userChoice; } catch(error) { console.warn('Instalação não disponível', error); }
    finally { installButton.hidden = true; installButton.disabled = false; }
  });
  window.addEventListener('appinstalled', () => { installEvent = null; installButton.hidden = true; });
}
