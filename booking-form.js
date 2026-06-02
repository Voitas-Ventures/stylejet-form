/* =========================================================================
   booking-form.js  v0.0.9  —  multi-leg poptávkový formulář
   -------------------------------------------------------------------------
   Změny oproti 0.0.8:
   - Smart pre-fill při přidání nového úseku: nový úsek dědí
     `Odkud` = `Kam` předchozího úseku (včetně IATA code) a `Počet cestujících`
     ze stejného úseku. Uživatel může pre-fill kdykoli přepsat.

   Změny oproti 0.0.7:
   - `itinerary-readable` používá `<br>` místo `\n` jako oddělovač řádků,
     aby se v HTML e-mailové notifikaci vykreslovaly jednotlivé úseky
     na samostatných řádcích.

   Změny oproti 0.0.6:
   - Nové hidden pole `itinerary-readable`: lidsky čitelný itinerář pro
     e-mailovou notifikaci.
   - Strojové pole `itinerary` už neobsahuje interní `currentStep` —
     v JSONu zůstává jen tripType / legs / returnAt.

   Změny oproti 0.0.4 (předchozí deployed verze):
   - One-page režim: pokud jsou step 1 i step 2 wrapper na stejné stránce
     (detekce přes [data-step="1"] a [data-step="2"]), Pokračovat / Zpět už
     dělají in-page toggle místo redirectu.
   - Cross-page fallback: pokud step 2 wrapper na aktuální stránce není,
     Pokračovat uloží stav a redirectne na /poptavka.
   - Logika dříve v krok-2-custom-code.html je vstřebána sem.
   - currentStep ('step1'|'step2') v sessionStorage pro refresh-persistenci.
   ========================================================================= */
(function () {
  var STORAGE_KEY  = 'formStep1';
  var POPTAVKA_URL = '/poptavka';  // stránka, kde žije step 2
  var MAX_LEGS     = 5;

  function $(sel, ctx)  { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return (ctx || document).querySelectorAll(sel); }
  function val(ctx, sel)       { var el = ctx.querySelector(sel); return el ? el.value : ''; }
  function setVal(ctx, sel, v) { var el = ctx.querySelector(sel); if (el) el.value = (v != null ? v : ''); }

  function emit(form, type, detail) {
    form.dispatchEvent(new CustomEvent(type, {
      detail: Object.assign({ form: form }, detail || {}),
      bubbles: true,
    }));
  }

  // ---- currentStep helper (uložen vedle tripType/legs/returnAt) ----------
  function readState() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function writeCurrentStep(step) {
    var s = readState();
    if (!s || typeof s !== 'object') return;
    s.currentStep = step;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  // ---- step toggle (in-page mode) ----------------------------------------
  function showStep(step1Wrap, step2Wrap, n) {
    if (!step1Wrap || !step2Wrap) return;
    if (n === 2) {
      step1Wrap.style.display = 'none';
      step2Wrap.style.display = '';
    } else {
      step1Wrap.style.display = '';
      step2Wrap.style.display = 'none';
    }
  }

  function scrollToWrap(wrap) {
    if (wrap && typeof wrap.scrollIntoView === 'function') {
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ---- populace skrytých polí kroku 2 ------------------------------------
  function populateStep2Hidden(step2Form) {
    if (!step2Form) return;
    var saved = sessionStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    var s;
    try { s = JSON.parse(saved); } catch (e) { return; }
    if (!s) return;

    // strojový JSON — bez interního currentStep (čistá data poptávky)
    var clean = { tripType: s.tripType, legs: s.legs || [] };
    if (s.tripType === 'return' && s.returnAt) clean.returnAt = s.returnAt;

    setIfExists(step2Form, '[name="itinerary"]', JSON.stringify(clean));
    setIfExists(step2Form, '[name="trip-type-readable"]',
      s.tripType === 'return' ? 'Zpáteční' : 'Jednosměrný');
    setIfExists(step2Form, '[name="legs-count"]',
      String(s.legs ? s.legs.length : ''));
    setIfExists(step2Form, '[name="itinerary-readable"]', buildReadable(s));
  }

  // sestaví lidsky čitelný itinerář pro e-mailovou notifikaci
  function buildReadable(s) {
    var lines = [];
    lines.push('Let: ' + (s.tripType === 'return' ? 'Zpáteční' : 'Jednosměrný'));
    (s.legs || []).forEach(function (leg, i) {
      var parts = [
        'cestujících: ' + (leg.pax || '?'),
        'odlet: '       + (leg.departAt || '?'),
      ];
      // datum návratu náleží jen prvnímu úseku Zpáteční cesty
      if (i === 0 && s.tripType === 'return' && s.returnAt) {
        parts.push('návrat: ' + s.returnAt);
      }
      lines.push(
        'Úsek ' + (i + 1) + ': ' +
        (leg.from || '?') + ' -> ' + (leg.to || '?') +
        ' | ' + parts.join(' | ')
      );
    });
    return lines.join('<br>');
  }
  function setIfExists(ctx, sel, v) {
    if (!ctx) return;
    var el = ctx.querySelector(sel);
    if (el) el.value = v;
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);

  function init() {
    var form = $('[data-step1-form]');
    if (!form) return;

    var nextBtn = $('[data-step1-next]', form);
    var addBtn  = $('[data-add-leg]', form);
    if (!nextBtn) return;

    // Detekce in-page módu
    var step1Wrap  = form.closest('[data-step="1"]');
    var step2Wrap  = document.querySelector('[data-step="2"]');
    var step2Form  = document.querySelector('#step2-form');
    var inPageMode = !!(step1Wrap && step2Wrap);

    // 1) Obnovit stav kroku 1 (mód, úseky, hodnoty)
    restoreState(form);
    syncMode(form);

    // 2) V in-page módu: rozhodnout, který krok ukázat při loadu
    if (inPageMode) {
      populateStep2Hidden(step2Form);
      var cs = readState().currentStep;
      showStep(step1Wrap, step2Wrap, cs === 'step2' ? 2 : 1);
    }

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
      writeCurrentStep('step2');
      if (inPageMode) {
        populateStep2Hidden(step2Form);
        showStep(step1Wrap, step2Wrap, 2);
        scrollToWrap(step2Wrap);
      } else {
        window.location.href = POPTAVKA_URL;
      }
    });

    // 7) Zpět (tlačítko žije v step-2 formu → listen na document)
    document.addEventListener('click', function (e) {
      var back = e.target.closest('[data-step1-back]');
      if (!back) return;
      e.preventDefault();
      writeCurrentStep('step1');
      if (inPageMode) {
        showStep(step1Wrap, step2Wrap, 1);
        scrollToWrap(step1Wrap);
      } else {
        // cross-page: vrátit na stránku s krokem 1 (= /poptavka)
        window.location.href = POPTAVKA_URL;
      }
    });

    // 8) Po odeslání kroku 2: vyčistit sessionStorage (anti-duplicita při refresh)
    if (step2Form) {
      step2Form.addEventListener('submit', function () {
        setTimeout(function () {
          sessionStorage.removeItem(STORAGE_KEY);
        }, 600);
      });
    }
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

  function syncMode(form) {
    var isReturn = getMode(form) === 'return';
    var legs = $$('[data-leg]', form);

    $$('[data-return-wrap]', form).forEach(function (el) {
      el.style.display = isReturn ? '' : 'none';
    });
    $$('[data-swap-route]', form).forEach(function (el) {
      el.style.display = isReturn ? '' : 'none';
    });
    var addBtn = $('[data-add-leg]', form);
    if (addBtn) addBtn.style.display = (!isReturn && legs.length < MAX_LEGS) ? '' : 'none';
    legs.forEach(function (leg, i) {
      $$('[data-remove-leg]', leg).forEach(function (btn) {
        btn.style.display = (i === 0) ? 'none' : '';
      });
    });
  }

  function onModeChange(form) {
    var mode = getMode(form);
    if (mode === 'return') {
      var legs = $$('[data-leg]', form);
      for (var i = legs.length - 1; i > 0; i--) legs[i].remove();
    } else {
      $$('[name="return-at"]', form).forEach(function (el) { el.value = ''; });
    }
    syncMode(form);
    emit(form, 'tripTypeChanged', { mode: mode });
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
    // zachytíme předchozí poslední úsek PŘED klonováním, ať z něj přebíráme hodnoty
    var legsBefore = $$('[data-leg]', form);
    var prev = legsBefore[legsBefore.length - 1];

    var clone = cloneLeg(form);
    if (!clone) return;

    // smart pre-fill: nový úsek dědí Kam→Odkud + pax z předchozího
    if (prev) {
      setVal(clone, '[name="from"]',      val(prev, '[name="to"]'));
      setVal(clone, '[name="from-code"]', val(prev, '[name="to-code"]'));
      setVal(clone, '[name="pax"]',       val(prev, '[name="pax"]'));
    }

    if (window.AirportAutocomplete && window.AirportAutocomplete.attachAll) {
      window.AirportAutocomplete.attachAll();
    }
    emit(form, 'legAdded', { leg: clone });
    syncMode(form);
  }

  function removeLeg(btn, form) {
    var leg = btn.closest('[data-leg]');
    if (!leg) return;
    if ($$('[data-leg]', form).length <= 1) return;
    leg.remove();
    emit(form, 'legRemoved', {});
    syncMode(form);
  }

  function cloneLeg(form) {
    var legs = $$('[data-leg]', form);
    if (legs.length >= MAX_LEGS) return null;
    var first = legs[0];
    if (!first) return null;

    var clone = first.cloneNode(true);

    var rw = clone.querySelector('[data-return-wrap]');
    if (rw) rw.remove();

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
    var mode  = getMode(form);
    var prev  = readState();
    var state = {
      tripType: mode,
      legs: [],
      // currentStep neresetujeme — bude přepsán z volajícího (writeCurrentStep)
      currentStep: prev.currentStep || 'step1',
    };

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

    var needed = Math.min(state.legs.length, MAX_LEGS);
    while ($$('[data-leg]', form).length < needed) {
      if (!cloneLeg(form)) break;
    }

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

    // znovu napojit našeptávač na klonované úseky
    if (legs.length > 1 && window.AirportAutocomplete && window.AirportAutocomplete.attachAll) {
      window.AirportAutocomplete.attachAll();
    }

    // oznámit legAdded pro každý klonovaný úsek (kromě prvního)
    legs.forEach(function (leg, i) {
      if (i === 0) return;
      emit(form, 'legAdded', { leg: leg });
    });
  }
})();
