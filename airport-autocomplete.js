/* =========================================================================
   airport-autocomplete.js  v0.0.2  —  sdílený našeptávač letišť
   -------------------------------------------------------------------------
   Změna oproti 0.0.1: kódové pole se hledá v rámci nejbližšího [data-leg]
   rodiče (s fallbackem na document), aby fungovaly i opakované úseky.
   ⚡ PŘECHOD NA AVINODE = upravíš JEN funkci fetchAirports() níže.
   ========================================================================= */
(function () {
  // --- konfigurace --------------------------------------------------------
  var AIRPORTS_URL = 'https://cdn.jsdelivr.net/gh/VikyExp/stylejet@0.0.2/airports.json';
  var MAX_RESULTS  = 8;
  var MIN_CHARS    = 2;

  // --- načtení dat (jednou, s cache) -------------------------------------
  var _airportsPromise = null;
  function loadAirports() {
    if (!_airportsPromise) {
      _airportsPromise = fetch(AIRPORTS_URL)
        .then(function (r) { return r.json(); })
        .catch(function () { return []; });
    }
    return _airportsPromise;
  }

  /* =======================================================================
     ⬇⬇⬇  JEDINÁ ČÁST, KTEROU POZDĚJI VYMĚNÍŠ ZA AVINODE  ⬇⬇⬇
     Musí vracet Promise pole ve tvaru: [{code, name, city, country}, ...]
     ======================================================================= */
  async function fetchAirports(query) {
    var q = query.trim().toLowerCase();
    if (q.length < MIN_CHARS) return [];
    var data = await loadAirports();
    var res = [];
    for (var i = 0; i < data.length && res.length < MAX_RESULTS; i++) {
      var a = data[i];
      var hay = (a.code + ' ' + a.name + ' ' + a.city + ' ' + a.country).toLowerCase();
      if (hay.indexOf(q) !== -1) res.push(a);
    }
    return res;
  }

  // --- minimální styl seznamu (klidně přepiš vlastním CSS ve Webflow) -----
  function injectStyles() {
    if (document.getElementById('airport-ac-styles')) return;
    var s = document.createElement('style');
    s.id = 'airport-ac-styles';
    s.textContent =
      '.airport-suggestions{position:absolute;z-index:60;left:0;right:0;top:100%;' +
      'background:#1c1c1c;border:1px solid #333;border-radius:8px;margin-top:4px;' +
      'max-height:260px;overflow:auto;display:none;box-shadow:0 8px 24px rgba(0,0,0,.4)}' +
      '.airport-suggestions.is-open{display:block}' +
      '.airport-suggestion{padding:10px 14px;cursor:pointer;color:#eee;font-size:14px;line-height:1.35}' +
      '.airport-suggestion small{color:#9a9a9a}' +
      '.airport-suggestion.is-active,.airport-suggestion:hover{background:#2a2a2a}';
    document.head.appendChild(s);
  }

  // --- debounce -----------------------------------------------------------
  function debounce(fn, ms) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  // --- napojení na jeden input -------------------------------------------
  function attach(input) {
    if (input._acReady) return;
    input._acReady = true;

    var wrap = input.parentNode;
    if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';

    // ZMĚNA v 0.0.2: kód hledáme uvnitř nejbližšího [data-leg], jinak v dokumentu
    var scope = input.closest('[data-leg]') || document;
    var codeField = input.dataset.codeField
      ? scope.querySelector('[name="' + input.dataset.codeField + '"]')
      : null;

    var list = document.createElement('div');
    list.className = 'airport-suggestions';
    wrap.appendChild(list);

    var items = [], active = -1;

    function close() {
      list.classList.remove('is-open');
      list.innerHTML = '';
      items = [];
      active = -1;
    }
    function setActive(i) {
      if (!items.length) return;
      active = (i + items.length) % items.length;
      items.forEach(function (el, idx) { el.classList.toggle('is-active', idx === active); });
      items[active].scrollIntoView({ block: 'nearest' });
    }
    function choose(a) {
      input.value = (a.city ? a.city + ' ' : '') + '(' + a.code + ')';
      if (codeField) codeField.value = a.code;
      close();
    }

    var run = debounce(function () {
      fetchAirports(input.value).then(function (matches) {
        list.innerHTML = '';
        items = [];
        active = -1;
        if (!matches.length) { close(); return; }
        matches.forEach(function (a) {
          var el = document.createElement('div');
          el.className = 'airport-suggestion';
          var sub = (a.name && a.city ? a.name + ' \u00b7 ' : '') + (a.country || '');
          el.innerHTML = (a.city || a.name) + ' (' + a.code + ') <small>' + sub + '</small>';
          el.addEventListener('mousedown', function (e) { e.preventDefault(); choose(a); });
          list.appendChild(el);
          items.push(el);
        });
        list.classList.add('is-open');
      });
    }, 200);

    input.addEventListener('input', function () {
      if (codeField) codeField.value = '';
      run();
    });
    input.addEventListener('keydown', function (e) {
      if (!list.classList.contains('is-open')) return;
      if (e.key === 'ArrowDown')    { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter' && active > -1) {
        e.preventDefault();
        items[active].dispatchEvent(new MouseEvent('mousedown', { cancelable: true }));
      }
      else if (e.key === 'Escape')  { close(); }
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
  }

  function attachAll() {
    injectStyles();
    document.querySelectorAll('.airport-input').forEach(attach);
  }

  if (document.readyState !== 'loading') attachAll();
  else document.addEventListener('DOMContentLoaded', attachAll);

  // pro dynamicky přidané úseky volej: window.AirportAutocomplete.attachAll()
  window.AirportAutocomplete = { attachAll: attachAll, fetchAirports: fetchAirports };
})();
