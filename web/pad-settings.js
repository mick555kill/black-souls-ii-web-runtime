(() => {
  const settings = document.querySelector('.pad-settings');
  const slider = document.getElementById('pad-transparency');
  const percent = document.getElementById('pad-percent');
  const pad = document.querySelector('.pad');
  const storageKey = 'bs2.padTransparency';

  function update(save) {
    const value = Number(slider.value);
    pad.style.opacity = String(1 - value / 100);
    percent.textContent = value + '%';
    if (save) {
      try { localStorage.setItem(storageKey, slider.value); } catch { /* Session only. */ }
    }
  }

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null && /^(?:100|[1-9]?[0-9])$/.test(saved)) slider.value = saved;
  } catch { /* Use the default. */ }
  update(false);
  settings.addEventListener('toggle', () => {
    document.body.classList.toggle('preview-pad', settings.open);
    if (!settings.open && document.body.classList.contains('playing') && settings.contains(document.activeElement)) {
      document.getElementById('screen').focus({preventScroll: true});
    }
  });
  slider.addEventListener('input', () => update(true));
  slider.addEventListener('change', () => update(true));
  for (const [id, step] of [['pad-clearer', -10], ['pad-fainter', 10]]) {
    document.getElementById(id).onclick = () => {
      slider.value = String(Math.min(100, Math.max(0, Number(slider.value) + step)));
      update(true);
    };
  }
})();
