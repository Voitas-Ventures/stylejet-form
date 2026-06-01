/* =========================================================================
   flight-datepicker.js  v0.0.3  —  datum + čas picker (flatpickr)
                                    s úplnou časovou validací
   -------------------------------------------------------------------------
   Vyžaduje flatpickr (Site Settings → Custom Code → Head Code):
     <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr@4/dist/themes/dark.css">
     <script src="https://cdn.jsdelivr.net/npm/flatpickr@4"></script>
     <script src="https://cdn.jsdelivr.net/npm/flatpickr@4/dist/l10n/cs.js"></script>

   Validační pravidla:
     1) Žádný úsek nemůže mít datum/čas v minulosti (minDate = teď).
     2) Datum návratu ≥ datum odletu prvního úseku (v módu Zpáteční).
     3) Každý další úsek ≥ datum odletu předchozího úseku (multi-leg řetěz).
   Změna jakékoli hodnoty řetěz přepočítá; navazující neplatné hodnoty se
   vyčistí, ať uživatel vidí, že je třeba znovu vybrat.
   ========================================================================= */
(function () {
  var FORM_SELECTOR  = '[data-step1-form]';
  var DATE_SELECTOR  = '.flight-date-input';
  var DEPART_NAME    = 'depart-at';
  var RETURN_NAME    = 'return-at';

  function ready() { return typeof window !== 'undefined' && !!window.flatpickr; }

  // ---- init / attach ------------------------------------------------------
  function initPicker(input) {
    if (!input || input._fpReady || !ready()) return;
    input._fpReady = true;
    window.flatpickr(input, {
      enableTime: true,
      time_24hr: true,
      dateFormat: 'd. m. Y H:i',           // 01. 06. 2026 14:30
      locale: (window.flatpickr.l10ns && window.flatpickr.l10ns.cs) || 'default',
      minDate: new Date(),                  // teď (datum + čas) – pravidlo 1
      minuteIncrement: 15,
      allowInput: false,
      onChange: function (selectedDates, dateStr, instance) {
        var form = instance.input.closest(FORM_SELECTOR);
        if (form) recompute(form);
      },
    });
  }

  function attachAll(root) {
    if (!ready()) return;
    (root || document).querySelectorAll(DATE_SELECTOR).forEach(initPicker);
    var form = (root && root.closest ? root.closest(FORM_SELECTOR) : null)
            || document.querySelector(FORM_SELECTOR);
    if (form) recompute(form);
  }

  // ---- recompute (řetězení minDate napříč všemi pickery) -----------------
  var recomputing = false;

  function recompute(form) {
    if (recomputing || !form) return;
    recomputing = true;
    try {
      var now = new Date();
      var prev = now;

      // pravidlo 1 + 3: minDate každého depart-at = max(teď, předchozí depart-at)
      form.querySelectorAll('[data-leg]').forEach(function (leg) {
        var inp = leg.querySelector('[name="' + DEPART_NAME + '"]');
        if (!inp || !inp._flatpickr) return;
        var fp = inp._flatpickr;
        fp.set('minDate', prev);

        var cur = fp.selectedDates[0];
        if (cur && cur < prev) {
          fp.clear();                       // neplatná hodnota → vyčistit
        } else if (cur) {
          prev = cur;                        // posunout dolní hranici dál
        }
      });

      // pravidlo 2: return-at ≥ první depart-at (v "return" módu)
      var returnInp = form.querySelector('[name="' + RETURN_NAME + '"]');
      if (returnInp && returnInp._flatpickr) {
        var firstDep = form.querySelector('[data-leg] [name="' + DEPART_NAME + '"]');
        var minR = (firstDep && firstDep._flatpickr && firstDep._flatpickr.selectedDates[0]) || now;
        var rfp = returnInp._flatpickr;
        rfp.set('minDate', minR);
        var rcur = rfp.selectedDates[0];
        if (rcur && rcur < minR) rfp.clear();
      }
    } finally {
      recomputing = false;
    }
  }

  // ---- event listenery od booking-form.js --------------------------------
  // Registrujeme okamžitě (ne v DOMContentLoaded), aby případné legAdded
  // dispatchnuté během restoreState v booking-form.js neproletělo nezachycené.
  document.addEventListener('legAdded', function (e) {
    if (e.detail && e.detail.leg) attachAll(e.detail.leg);
    else attachAll();
  });

  document.addEventListener('legRemoved', function (e) {
    var form = (e.detail && e.detail.form) || document.querySelector(FORM_SELECTOR);
    if (form) recompute(form);
  });

  document.addEventListener('tripTypeChanged', function (e) {
    var form = (e.detail && e.detail.form) || document.querySelector(FORM_SELECTOR);
    if (!form) return;
    // přepnutí do oneway → return-at picker řádně vyčistit (i interní stav)
    if (e.detail && e.detail.mode === 'oneway') {
      var returnInp = form.querySelector('[name="' + RETURN_NAME + '"]');
      if (returnInp && returnInp._flatpickr) returnInp._flatpickr.clear();
    }
    recompute(form);
  });

  if (document.readyState !== 'loading') attachAll();
  else document.addEventListener('DOMContentLoaded', attachAll);

  window.FlightDatepicker = { attachAll: attachAll, init: initPicker, recompute: recompute };
})();
