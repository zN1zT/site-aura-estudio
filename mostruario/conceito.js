/* Projeto conceito (mostruário da Aura): nenhum contato aqui é real.
   Toque em WhatsApp, telefone ou envio de formulário abre um aviso com o caminho para a Aura.
   Não envia nada a lugar nenhum e não carrega rastreadores. */
(function () {
  'use strict';
  var slug = (location.pathname.match(/\/mostruario\/([^\/]+)/) || [])[1] || 'conceito';
  var destino = '../../?utm_source=mostruario&utm_medium=conceito&utm_campaign=' + encodeURIComponent(slug) + '#investimento';
  var dlg;
  function criar() {
    dlg = document.createElement('dialog');
    dlg.className = 'cn-dlg';
    dlg.setAttribute('aria-labelledby', 'cn-t');
    dlg.innerHTML = '<div class="cn-card"><b id="cn-t">Este é um projeto conceito da Aura</b>' +
      '<p>O negócio é fictício e este contato não existe. Quer um site assim para o seu negócio? A Aura faz o seu a partir de R$ 650.</p>' +
      '<div class="cn-btns"><a href="' + destino + '">Quero um site assim</a><button type="button" data-fechar>Continuar vendo</button></div></div>';
    dlg.addEventListener('click', function (e) { if (e.target === dlg || (e.target.closest && e.target.closest('[data-fechar]'))) dlg.close(); });
    document.body.appendChild(dlg);
  }
  function aviso() {
    if (!dlg) criar();
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href*="wa.me"],a[href^="tel:"],a[href*="google.com/maps"]') : null;
    if (!a) return;
    e.preventDefault(); e.stopPropagation(); aviso();
  }, true);
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f && f.matches && f.matches('form[data-wa]')) { e.preventDefault(); e.stopPropagation(); aviso(); }
  }, true);
})();
