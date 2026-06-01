/* =========================================================================
   flight-datepicker.js  v0.0.3  —  datum + čas picker (flatpickr) + validace
   -------------------------------------------------------------------------
   Vyžaduje flatpickr (Site Settings → Head Code):
     <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr@4/dist/themes/dark.css">
     <script src="https://cdn.jsdelivr.net/npm/flatpickr@4"></script>
     <script src="https://cdn.jsdelivr.net/npm/flatpickr@4/dist/l10n/cs.js"></script>

   Napojí flatpickr na <input class="flight-date-input">, dynamicky řeší
   minDate při otevření (depart→return, úsek N→N+1, vše ≥ teď). Exponuje
   FlightDatepicker.validate(form), které booking-form.js volá při Pokračovat
   a vrací { input, message } v případě chyby.
   ========================================================================= */
(function () {
  var DATE_FORMAT = 'd. m. Y H:i';

  function fpReady() { return typeof window !== 'undefined' && !!window.flatpickr; }

  // ---- získání Date hodnoty z inputu --------------------------------------
  function getInputDate(input) {
    if (!input) return null;
    if (input._flatpickr && input._flatpickr.selectedDates && input._flatpickr.selectedDates.length) {
      return input._flatpickr.selectedDates[0];
    }
    if (input.value && window.flatpickr && window.flatpickr.parseDate) {
      var d = window.flatpickr.parseDate(input.value, DATE_FORMAT);
      if (d) return d;
    }
    return null;
  }

  // ---- minDate podle kontextu inputu --------------------------------------
  function computeMinDateFor(input) {
    var now = new Date();
    var leg = input.closest('[data-leg]');
    var form = input.closest('[data-step1-form]') || document;
    if (!leg) return now;

    var name = input.getAttribute('name');

    // return-at musí být ≥ depart-at toho samého úseku (prvního, v "return" módu)
    if (name === 'return-at') {
      var depart = leg.querySelector('[name="depart-at"]');
      var dDate = getInputDate(depart);
      return (dDate && dDate > now) ? dDate : now;
    }

    // depart-at úseku N musí být ≥ depart-at úseku N-1
    if (name === 'depart-at') {
      var allLegs = form.querySelectorAll('[data-leg]');
      var legIndex = Array.prototype.indexOf.call(allLegs, leg);
      if (legIndex > 0) {
        var prevLeg = allLegs[legIndex - 1];
        var prevDepart = prevLeg.querySelector('[name="depart-at"]');
        var pDate = getInputDate(prevDepart);
        if (pDate && pDate > now) return pDate;
      }
      return now;
    }

    return now;
  }

  // ---- init flatpickru na jednom inputu -----------------------------------
  function init(input) {
    if (!input || input._fpReady || !fpReady()) return;
    input._fpReady = true;
    window.flatpickr(input, {
      enableTime: true,
      time_24hr: true,
      dateFormat: DATE_FORMAT,
      locale: (window.flatpickr.l10ns && window.flatpickr.l10ns.cs) || 'default',
      minDate: new Date(),
      minuteIncrement: 15,
      allowInput: false,
      disableMobile: false,
      onOpen: function (selectedDates, dateStr, instance) {
        // při každém otevření přepočítej minDate dle aktuálního kontextu
        instance.set('minDate', computeMinDateFor(input));
      },
    });
  }

  function attachAll(root) {
    if (!fpReady()) return;
    (root || document).querySelectorAll('.flight-date-input').forEach(init);
  }

  // ---- validace celé sekvence při Pokračovat ------------------------------
  // Vrací null pokud OK, nebo { input: Element, message: '...' }
  function validate(form) {
    if (!form) return null;
    var now = new Date();
    var legs = form.querySelectorAll('[data-leg]');

    var prevDepart = null;
    for (var i = 0; i < legs.length; i++) {
      var dInput = legs[i].querySelector('[name="depart-at"]');
      if (!dInput) continue;
      var d = getInputDate(dInput);
      if (!d) continue; // prázdné – HTML5 required to chytí samo

      if (d < now) {
        return { input: dInput, message: 'Datum a čas u úseku ' + (i + 1) + ' nesmí být v minulosti.' };
      }
      if (prevDepart && d < prevDepart) {
        return {
          input: dInput,
          message: 'Datum a čas u úseku ' + (i + 1) + ' musí být později než u úseku ' + i + '.',
        };
      }
      prevDepart = d;
    }

    // return-at – jen pokud je viditelný (return mód)
    var returnInput = form.querySelector('[name="return-at"]');
    var returnWrap = form.querySelector('[data-return-wrap]');
    var returnVisible = returnWrap && getComputedStyle(returnWrap).display !== 'none';

    if (returnInput && returnVisible) {
      var r = getInputDate(returnInput);
      if (r) {
        if (r < now) {
          return { input: returnInput, message: 'Datum a čas návratu nesmí být v minulosti.' };
        }
        var firstDepartInput = legs[0] ? legs[0].querySelector('[name="depart-at"]') : null;
        var firstDepart = getInputDate(firstDepartInput);
        if (firstDepart && r < firstDepart) {
          return {
            input: returnInput,
            message: 'Datum a čas návratu musí být později než datum a čas odletu.',
          };
        }
      }
    }

    return null;
  }

  // ---- napojení na lifecycle z booking-form.js ----------------------------
  document.addEventListener('legAdded', function (e) {
    if (e.detail && e.detail.leg) attachAll(e.detail.leg);
    else attachAll();
  });

  if (document.readyState !== 'loading') attachAll();
  else document.addEventListener('DOMContentLoaded', attachAll);

  window.FlightDatepicker = {
    attachAll: attachAll,
    init: init,
    validate: validate,
  };
})();
