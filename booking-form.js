/* =========================================================================
   booking-form.js  v0.0.2  —  multi-leg poptávkový formulář
   -------------------------------------------------------------------------
   Hostuj vedle airport-autocomplete.js. Spolupracuje s ním.
   Pracuje s formulářem [data-step1-form] a řeší:
     - přepínač Jednosměrný / Zpáteční
     - tlačítko swap (Odkud ↔ Kam) – viditelné jen v "return"
     - přidat / odebrat úsek v "oneway" (max 5)
     - serializaci stavu do sessionStorage (strukturovaný JSON)
     - obnovení stavu při návratu (i na "libovolné stránce s formulářem")

   Datový model v sessionStorage (klíč "formStep1"):
   {
     tripType: "return" | "oneway",
     legs: [ { from, fromCode, to, toCode, pax, departAt }, ... ],
     returnAt: "..."    // jen pro return
   }
   ========================================================================= */
(function () {
  var STORAGE_KEY = 'formStep1';
  var STEP2_URL   = '/krok-2';
  var MAX_LEGS    = 5;

  function $(sel, ctx)  { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return (ctx || document).querySelectorAll(sel); }
  function val(ctx, sel)        { var el = ctx.querySelector(sel); return el ? el.value : ''; }
  function setVal(ctx, sel, v)  { var el = ctx.querySelector(sel); if (el) el.value = (v != null ? v : ''); }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);

  function init() {
    var form = $('[data-step1-form]');
    if (!form) return;

    var nextBtn = $('[data-step1-next]', form);
    var addBtn  = $('[data-add-leg]', form);
    if (!nextBtn) return;

    // 1) Obnovit stav (mód, úseky, hodnoty) ze sessionStorage
    restoreState(form);

    // 2) Sladit UI s režimem (datum návratu, swap, add-leg, remove na úsecích)
    syncMode(form);

    // 3) Změna režimu
    $$('input[type="radio"][name="trip-type"]', form).forEach(function (r) {
      r.addEventListener('change', function () { onModeChange(form); });
    });

    // 4) Přidat úsek
    if (addBtn) addBtn.addEventListener('click', function (e) {
      e.preventDefault();
      addLeg(form);
    });

    // 5) Delegace: Odstranit úsek + swap (kvůli dynamicky přidaným úsekům)
    form.addEventListener('click', function (e) {
      var remove = e.target.closest('[data-remove-leg]');
      if (remove && form.contains(remove)) {
        e.preventDefault();
        removeLeg(remove, form);
        return;
      }
      var swap = e.target.closest('[data-swap-route]');
      if (swap && form.contains(swap)) {
        e.preventDefault();
        swapRoute(swap);
      }
    });

    // 6) Pokračovat
    nextBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      saveState(form);
      window.location.href = STEP2_URL;
    });
  }

  // ---- režim ---------------------------------------------------------------
  function getMode(form) {
    var r = form.querySelector('input[type="radio"][name="trip-type"]:checked');
    return r ? r.value : 'return';
  }
  function setMode(form, mode) {
    var r = form.querySelector('input[type="radio"][name="trip-type"][value="' + mode + '"]');
    if (r) r.checked = true;
  }

  // ---- UI sync podle režimu -----------------------------------------------
  function syncMode(form) {
    var isReturn = getMode(form) === 'return';
    var legs = $$('[data-leg]', form);

    // Datum návratu – jen v return
    $$('[data-return-wrap]', form).forEach(function (el) {
      el.style.display = isReturn ? '' : 'none';
    });
    // Swap – jen v return
    $$('[data-swap-route]', form).forEach(function (el) {
      el.style.display = isReturn ? '' : 'none';
    });
    // Přidat úsek – jen v oneway a jen pokud máme < MAX
    var addBtn = $('[data-add-leg]', form);
    if (addBtn) addBtn.style.display = (!isReturn && legs.length < MAX_LEGS) ? '' : 'none';
    // Odstranit – na prvním úseku skrýt, na ostatních ukázat
    legs.forEach(function (leg, i) {
      $$('[data-remove-leg]', leg).forEach(function (btn) {
        btn.style.display = (i === 0) ? 'none' : '';
      });
    });
  }

  function onModeChange(form) {
    if (getMode(form) === 'return') {
      // přepnutí do "return" → zachovat jen první úsek
      var legs = $$('[data-leg]', form);
      for (var i = legs.length - 1; i > 0; i--) legs[i].remove();
    } else {
      // přepnutí do "oneway" → vynulovat return-at (v oneway nepoužíváme)
      $$('[name="return-at"]', form).forEach(function (el) { el.value = ''; });
    }
    syncMode(form);
  }

  // ---- swap ---------------------------------------------------------------
  function swapRoute(btn) {
    var leg = btn.closest('[data-leg]');
    if (!leg) return;
    swapValues(leg.querySelector('[name="from"]'),      leg.querySelector('[name="to"]'));
    swapValues(leg.querySelector('[name="from-code"]'), leg.querySelector('[name="to-code"]'));
  }
  function swapValues(a, b) {
    if (!a || !b) return;
    var tmp = a.value; a.value = b.value; b.value = tmp;
  }

  // ---- add / remove leg ---------------------------------------------------
  function addLeg(form) {
    cloneLeg(form);
    if (window.AirportAutocomplete && window.AirportAutocomplete.attachAll) {
      window.AirportAutocomplete.attachAll();
    }
    syncMode(form);
  }

  function removeLeg(btn, form) {
    var leg = btn.closest('[data-leg]');
    if (!leg) return;
    if ($$('[data-leg]', form).length <= 1) return; // nesmí zbýt 0
    leg.remove();
    syncMode(form);
  }

  // klonuje první úsek na konec (bez následného syncMode, volaný společně)
  function cloneLeg(form) {
    var legs = $$('[data-leg]', form);
    if (legs.length >= MAX_LEGS) return null;
    var first = legs[0];
    if (!first) return null;

    var clone = first.cloneNode(true);

    // klon nikdy nemá datum návratu (to patří jen k prvnímu úseku v "return")
    var rw = clone.querySelector('[data-return-wrap]');
    if (rw) rw.remove();

    // vyčistit všechny hodnoty v klonu
    $$('input, select, textarea', clone).forEach(function (inp) {
      if (inp.type === 'checkbox' || inp.type === 'radio') inp.checked = false;
      else inp.value = '';
    });

    var lastLeg = legs[legs.length - 1];
    lastLeg.parentNode.insertBefore(clone, lastLeg.nextSibling);
    return clone;
  }

  // ---- save / restore -----------------------------------------------------
  function saveState(form) {
    var mode = getMode(form);
    var state = { tripType: mode, legs: [] };

    $$('[data-leg]', form).forEach(function (leg) {
      state.legs.push({
        from:     val(leg, '[name="from"]'),
        fromCode: val(leg, '[name="from-code"]'),
        to:       val(leg, '[name="to"]'),
        toCode:   val(leg, '[name="to-code"]'),
        pax:      val(leg, '[name="pax"]'),
        departAt: val(leg, '[name="depart-at"]'),
      });
    });

    if (mode === 'return') {
      state.returnAt = val(form, '[name="return-at"]');
    }

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function restoreState(form) {
    var raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    var state;
    try { state = JSON.parse(raw); } catch (e) { return; }
    if (!state || !state.legs) return;

    setMode(form, state.tripType === 'oneway' ? 'oneway' : 'return');

    // zajistit potřebný počet úseků v DOM
    var needed = Math.min(state.legs.length, MAX_LEGS);
    while ($$('[data-leg]', form).length < needed) {
      if (!cloneLeg(form)) break;
    }

    // naplnit hodnoty
    var legs = $$('[data-leg]', form);
    state.legs.forEach(function (l, i) {
      var leg = legs[i];
      if (!leg) return;
      setVal(leg, '[name="from"]',      l.from);
      setVal(leg, '[name="from-code"]', l.fromCode);
      setVal(leg, '[name="to"]',        l.to);
      setVal(leg, '[name="to-code"]',   l.toCode);
      setVal(leg, '[name="pax"]',       l.pax);
      setVal(leg, '[name="depart-at"]', l.departAt);
    });

    if (state.tripType === 'return' && state.returnAt) {
      setVal(form, '[name="return-at"]', state.returnAt);
    }
  }
})();
