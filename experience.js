'use strict';
(() => {
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let manualReduced = reduced.matches;
  const toggle = document.getElementById('motion-toggle');
  function setMotion(value) {
    manualReduced = value;
    root.classList.toggle('motion-reduced', value);
    toggle.setAttribute('aria-pressed', String(value));
    toggle.setAttribute('aria-label', value ? '모션 켜기' : '모션 줄이기');
    toggle.querySelector('span').textContent = value ? 'OFF' : 'ON';
  }
  setMotion(manualReduced);
  toggle.addEventListener('click', () => setMotion(!manualReduced));
  reduced.addEventListener('change', event => setMotion(event.matches));
  function setupExperience() {
    const observed = document.querySelectorAll('.method-grid,.limits,.improvement-list,.evidence-grid,.download-panel');
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('in-view'); observer.unobserve(entry.target); }
      }), {threshold:.08});
      observed.forEach(node => { node.classList.add('reveal-block'); observer.observe(node); });
    }
    if (window.matchMedia('(pointer:fine)').matches) document.querySelectorAll('.metric').forEach(card => {
      let frame;
      card.addEventListener('pointermove', event => {
        if (manualReduced) return;
        const x = event.clientX, y = event.clientY;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => { const box = card.getBoundingClientRect(); card.style.setProperty('--mx', (x-box.left)+'px'); card.style.setProperty('--my', (y-box.top)+'px'); });
      });
    });
  }
  document.addEventListener('qa:ready', setupExperience, {once:true});
  if (!document.getElementById('dashboard').hidden) setupExperience();
})();
