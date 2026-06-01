/* =========================================================================
   booking-form.js  v0.0.3  —  multi-leg poptávkový formulář
   -------------------------------------------------------------------------
   Změny oproti 0.0.2:
   - restoreState() volá AirportAutocomplete.attachAll() po naklonování úseků
     (fix: našeptávač se po návratu z kroku 2 nepřipojil na obnovené úseky).
   - cloneLeg / restoreState dispatchují CustomEvent 'legAdded' na formuláři,
     aby další funkce (flight-datepicker apod.) mohly inicializovat své
     widgety na nově vzniklých úsecích.
   - Při kliku na "Pokračovat" se navíc volá FlightDatepicker.validate(),
     které zkontroluje sekvenci datumů (≥ teď, sekvenční úseky, return ≥ depart)
     a v případě chyby ukáže nativní validační tooltip u problematického inputu.
   ========================================================================= */
(function () {
  var STORAGE_KEY = 'formStep1';
  var STEP2_URL   = '/krok-2';
  var MAX_LEGS    = 5;

  function $(sel, ctx)  { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return (ctx || document).querySelectorAll(sel); }
  function val(ctx, sel)       { var el = ctx.querySelector(sel); return el ? el.value : ''; }
  function setVal(ctx, sel, v) { var el = ctx.querySelector(sel); if (el) el.value = (v != null ? v : ''); }

  function dispatchLegAdded(form, leg) {
    form.dispatchEvent(new CustomEvent('legAdded', {
      detail: { leg: leg, form: form },
      bubbles: true,
    }));
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);

  function init() {
    var form = $('[data-step1-form]');
    if (!form) return;

    var nextBtn = $('[data-step1-next]', form);
    var addBtn  = $('[data-add-leg]', form);
    if (!nextBtn) return;

    restoreState(form);
    syncMode(form);

    $$('input[type="radio"][name="trip-type"]', form).forEach(function (r) {
      r.addEventListener('change', function () { onModeChange(form); });
    });

    if (addBtn) addBtn.addEventListener('click', function (e) {
      e.preventDefault();
      addLeg(form);
    });

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

    nextBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;

      // v0.0.3: validace sekvence datumů
      if (window.FlightDatepicker && window.FlightDatepicker.validate) {
        var err = window.FlightDatepicker.validate(form);
        if (err && err.input) {
          err.input.setCustomValidity(err.message);
          form.reportValidity();
          // při další úpravě toho inputu chybu zase odstraň, ať se dá pokračovat
          var clearOnce = function () {
            err.input.setCustomValidity('');
            err.input.removeEventListener('input', clearOnce);
            err.input.removeEventListener('change', clearOnce);
          };
          err.input.addEventListener('input', clearOnce);
          err.input.addEventListener('change', clearOnce);
          return;
        }
      }

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
    if (getMode(form) === 'return') {
      var legs = $$('[data-leg]', form);
      for (var i = legs.length - 1; i > 0; i--) legs[i].remove();
    } else {
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
    var clone = cloneLeg(form);
    if (!clone) return;
    if (window.AirportAutocomplete && window.AirportAutocomplete.attachAll) {
      window.AirportAutocomplete.attachAll();
    }
    dispatchLegAdded(form, clone);
    syncMode(form);
  }

  function removeLeg(btn, form) {
    var leg = btn.closest('[data-leg]');
    if (!leg) return;
    if ($$('[data-leg]', form).length <= 1) return;
    leg.remove();
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

    if (legs.length > 1 && window.AirportAutocomplete && window.AirportAutocomplete.attachAll) {
      window.AirportAutocomplete.attachAll();
    }

    legs.forEach(function (leg, i) {
      if (i === 0) return;
      dispatchLegAdded(form, leg);
    });
  }
})();
