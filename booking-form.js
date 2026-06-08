/* =========================================================================
   booking-form.js  v0.0.21  —  multi-leg poptávkový formulář
   -------------------------------------------------------------------------
   Změny oproti 0.0.20:
   - Klik "+ Přidat úsek" v Zpátečním módu teď nový úsek vyplní jako
     "návratovou trasu": převrátí from/to z úseku 1 do to/from úseku 2,
     a do depart-at úseku 2 zkopíruje původní hodnotu return-at z úseku 1.
     Smart pre-fill v addLeg už zajišťoval pax + from = předchozí to;
     v0.0.21 dotahuje to + to-code (převrácení) a depart-at (z return-at).
     UX: zákazník měl Praha→Londýn + návrat 15. 6., klik → Praha→Londýn
     → Londýn→Praha (15. 6.), s automatickým pax & IATA codes. Pokud chce
     trasu úseku 2 změnit, snadno přepíše.
     Pro datum použito flatpickr.setDate() (ne jen .value=), ať si
     flatpickr datum vzal i do interního stavu pro kalendář popup.

   Změny oproti 0.0.19:
   - Tlačítko "+ Přidat úsek" viditelné i v Zpátečním módu.

   Změny oproti 0.0.18:
   - Fix Zpět tlačítka v step 2 (dva defenzivní fixy: scoped query +
     explicit display:flex).

   Změny oproti 0.0.17:
   - Multi-form support: skript najde a inicializuje VŠECHNY `[data-step1-form]`.

   Změny oproti 0.0.16:
   - Chip-group multi-select pattern.

   Změny oproti 0.0.15:
   - Fix: `<select>` elementy se po refreshi neobnovovaly z draftu.
     restoreStep2Draft měl pojistku `!el.value` (nepřepisovat to, co je),
     ale po refreshi má select default option s NON-empty hodnotou
     (např. `value="question"` u placeholderu „Jaký typ letu poptáváte?"),
     takže `!el.value` byl false a restore přeskočil. Fix: draft restore
     teď vždy přepíše (na page-loadu uživatel ještě nic nenapsal, není
     co chránit). Pojistka zůstává v restoreStep2Contact, ať draft má
     přednost nad localStorage contact subsetem.

   Změny oproti 0.0.14:
   - Step 2 má teď DVĚ úložiště s různým životním cyklem:
       (a) `formStep2Draft` v sessionStorage — VŠECHNA pole kroku 2
           (jméno, e-mail, telefon, typ-služby, letadlo, doplňkové, poznámka).
           Auto-save při psaní, mizí po Submit-u nebo zavření tabu.
           Slouží k ochraně rozdělaného draftu před refreshem.
       (b) `formStep2Contact` v localStorage — JEN kontakt
           (jméno, e-mail, telefon). Drží napříč session-y, slouží jako
           returning-customer prefill při příští poptávce.
     Dříve existovalo jen (b), takže refresh během psaní kroku 2 smazal
     všechno kromě toho, co už bylo Submit-nuté dříve.

   Změny oproti 0.0.13:
   - Auto-save kontaktu kroku 2 do localStorage při každé změně pole
     (ne jen při Submit-u). Refresh mid-fill zachová rozepsaný kontakt.

   Změny oproti 0.0.9 (předchozí deployed verze) — dvě věci najednou:

   1) Auto-save kroku 1 do sessionStorage při každé změně (debounce 300 ms).
      Dosud se stav ukládal až při kliku na Pokračovat — refresh mid-fill
      znamenal ztrátu rozdělaných dat a fallback na defaulty. Teď přežije
      refresh, navigaci v rámci karty i prostoje.

   2) Persistence základního kontaktu (name / email / phone) přes
      localStorage napříč session-y. Při Submit-u uložíme do localStoragu,
      při dalším loadu kroku 2 se prázdná pole prefillnou. Cíleně NEpouštíme
      do paměti GDPR souhlas (checkbox) — vždy se re-confirmuje.

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
  var STORAGE_KEY      = 'formStep1';
  var STEP2_DRAFT_KEY  = 'formStep2Draft';     // sessionStorage — všechna pole kroku 2 pro refresh-protection
  var CONTACT_KEY      = 'formStep2Contact';   // localStorage — kontakt mezi poptávkami (returning customer)
  var POPTAVKA_URL     = '/poptavka';          // stránka, kde žije step 2
  var MAX_LEGS         = 5;

  // všechna text/select pole kroku 2 (kromě GDPR checkboxu, který se re-confirmuje)
  var STEP2_DRAFT_FIELDS = ['name', 'email', 'phone', 'typ-sluzby', 'aircraft', 'doplnkove-sluzby', 'note'];
  // jen základní kontakt — pro returning-customer prefill napříč session-y
  var CONTACT_FIELDS     = ['name', 'email', 'phone'];

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

  // ---- auto-save (debounced) ---------------------------------------------
  // Timer drží na samotném form elementu (form._saveTimer), aby dva formuláře
  // na téže stránce (např. hero + footer na homepage) neperaly o jediný
  // sdílený timer a netriggrovaly si vzájemné cancelace debouncu.
  function scheduleSave(form) {
    if (form._saveTimer) clearTimeout(form._saveTimer);
    form._saveTimer = setTimeout(function () { saveState(form); }, 300);
  }

  // analogický debounce pro step 2 — jeden timer, dva zápisy
  // (sessionStorage draft = vše, localStorage contact = jen kontakt subset)
  var step2SaveTimer = null;
  function scheduleStep2Save(step2Form) {
    if (step2SaveTimer) clearTimeout(step2SaveTimer);
    step2SaveTimer = setTimeout(function () {
      persistStep2Draft(step2Form);     // sessionStorage — všechna pole, pro refresh-protection
      persistStep2Contact(step2Form);   // localStorage — kontakt subset, pro returning customer
    }, 300);
  }

  // ---- step 2 draft: sessionStorage (refresh-protection, mizí po Submit-u) ---
  function persistStep2Draft(step2Form) {
    if (!step2Form) return;
    var data = {};
    STEP2_DRAFT_FIELDS.forEach(function (name) {
      var el = step2Form.querySelector('[name="' + name + '"]');
      if (el) data[name] = el.value || '';
    });
    try { sessionStorage.setItem(STEP2_DRAFT_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function restoreStep2Draft(step2Form) {
    if (!step2Form) return;
    var raw;
    try { raw = sessionStorage.getItem(STEP2_DRAFT_KEY); } catch (e) { return; }
    if (!raw) return;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data) return;
    Object.keys(data).forEach(function (name) {
      var el = step2Form.querySelector('[name="' + name + '"]');
      // Vždy přepíšeme — na page-loadu uživatel ještě nic nenapsal, není co chránit.
      // Důležité hlavně pro <select>: default option má často NON-empty value
      // (např. placeholder s value="question"), takže `!el.value` by tu nepomohl.
      if (el && data[name]) el.value = data[name];
    });
  }

  // ---- chip-group multi-select (vizuální chipy → skryté pole) -----------
  // Hledá ve formě [data-chip-group="<name>"] containery; každý chip uvnitř
  // má [data-chip-value]. Toggle stavu se promítá do hidden inputu se
  // stejným name jako comma-separated string. Po refreshi syncChipsFromHidden
  // obnoví vizuální stav podle hodnoty obnovené v restoreStep2Draft.
  function initChipGroups(form) {
    if (!form) return;
    form.querySelectorAll('[data-chip-group]').forEach(function (group) {
      var name   = group.getAttribute('data-chip-group');
      var hidden = form.querySelector('[name="' + name + '"]');
      if (!hidden) return;

      // 1) sync z hidden hodnoty (po restoreStep2Draft už tam může být obsah)
      syncChipsFromHidden(group, hidden);

      // 2) klik na chip → toggle .is-selected + update hidden
      group.addEventListener('click', function (e) {
        var chip = e.target.closest('[data-chip-value]');
        if (!chip || !group.contains(chip)) return;
        e.preventDefault();
        chip.classList.toggle('is-selected');
        writeHiddenFromChips(group, hidden);
      });

      // 3) keyboard support: Enter / Space na fokus-ovaném chipu
      group.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var chip = e.target.closest('[data-chip-value]');
        if (!chip || !group.contains(chip)) return;
        e.preventDefault();
        chip.classList.toggle('is-selected');
        writeHiddenFromChips(group, hidden);
      });
    });
  }

  function syncChipsFromHidden(group, hidden) {
    var saved = (hidden.value || '')
      .split(',')
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    group.querySelectorAll('[data-chip-value]').forEach(function (chip) {
      var val = chip.getAttribute('data-chip-value');
      chip.classList.toggle('is-selected', saved.indexOf(val) !== -1);
    });
  }

  function writeHiddenFromChips(group, hidden) {
    var values = [];
    group.querySelectorAll('.is-selected[data-chip-value]').forEach(function (chip) {
      values.push(chip.getAttribute('data-chip-value'));
    });
    hidden.value = values.join(', ');
    // bubble change event → form-level listener spustí scheduleStep2Save
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---- step 2 kontakt: localStorage (returning customer, drží napříč session-y) ---
  function persistStep2Contact(step2Form) {
    if (!step2Form) return;
    var data = {};
    CONTACT_FIELDS.forEach(function (name) {
      var el = step2Form.querySelector('[name="' + name + '"]');
      if (el && el.value) data[name] = el.value;
    });
    try { localStorage.setItem(CONTACT_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function restoreStep2Contact(step2Form) {
    if (!step2Form) return;
    var raw;
    try { raw = localStorage.getItem(CONTACT_KEY); } catch (e) { return; }
    if (!raw) return;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data) return;
    Object.keys(data).forEach(function (name) {
      var el = step2Form.querySelector('[name="' + name + '"]');
      // jen pokud je pole prázdné — uživatel, který si už něco rozepsal
      // (např. při návratu Zpět z error stavu) má přednost
      if (el && !el.value) el.value = data[name];
    });
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
  // POZNÁMKA: 'flex' (ne '') je úmyslné — oba wrappery jsou w-layout-vflex,
  // takže layoutově sedí flex. Explicit hodnota navíc přebije případný
  // class CSS s `display: none` (Webflow Style panel, media query, …),
  // kde by `display = ''` fallbacknulo na hidden default.
  function showStep(step1Wrap, step2Wrap, n) {
    if (!step1Wrap || !step2Wrap) return;
    if (n === 2) {
      step1Wrap.style.display = 'none';
      step2Wrap.style.display = 'flex';
    } else {
      step1Wrap.style.display = 'flex';
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
    // === Page-level setup (runs once per page load) ============================

    var step2Wrap = document.querySelector('[data-step="2"]');
    var step2Form = document.querySelector('#step2-form');

    // Krok 2: pre-fill (draft + contact + chips), auto-save listenery, submit handler.
    // Vše se týká té jedné step-2 instance na stránce, ne per step-1 form.
    if (step2Form) {
      restoreStep2Draft(step2Form);
      restoreStep2Contact(step2Form);
      initChipGroups(step2Form);
      step2Form.addEventListener('input',  function () { scheduleStep2Save(step2Form); });
      step2Form.addEventListener('change', function () { scheduleStep2Save(step2Form); });
      step2Form.addEventListener('submit', function () {
        persistStep2Contact(step2Form);                // synchronně, dokud máme hodnoty v DOM
        setTimeout(function () {
          sessionStorage.removeItem(STORAGE_KEY);       // step 1 draft
          sessionStorage.removeItem(STEP2_DRAFT_KEY);   // step 2 draft
          // localStorage formStep2Contact ZŮSTÁVÁ — pro příští poptávku
        }, 600);
      });
    }

    // Zpět tlačítko žije uvnitř step-2 formu (nebo na něj může mířit odkud­koli).
    // Listener na document = jedna registrace pokryje všechna [data-step1-back]
    // tlačítka napříč stránkou.
    document.addEventListener('click', function (e) {
      var back = e.target.closest('[data-step1-back]');
      if (!back) return;
      e.preventDefault();
      writeCurrentStep('step1');
      if (step2Wrap) {
        // in-page mode: schovat step 2, ukázat odpovídající step 1.
        // KLÍČOVÉ: hledáme step 1 v parentu step 2 wrapperu, ne globálně.
        // Když je na stránce víc `[data-step="1"]` (footer hero/footer entry
        // pointů z homepage), globální `document.querySelector` by mohl najít
        // špatný element. Parent-scoped query zajistí, že najdeme step 1,
        // který je opravdu párovaný se step 2 v tom samém containeru.
        var step1Wrap = step2Wrap.parentElement
          ? step2Wrap.parentElement.querySelector('[data-step="1"]')
          : null;
        if (step1Wrap) {
          showStep(step1Wrap, step2Wrap, 1);
          scrollToWrap(step1Wrap);
        }
      } else {
        // cross-page: vrátit na stránku s krokem 1 (= /poptavka)
        window.location.href = POPTAVKA_URL;
      }
    });

    // === Per-form setup (runs ONCE per step 1 form on page) ====================
    // Na homepage bývá víc forem (hero + footer); na /poptavka jen jeden.
    document.querySelectorAll('[data-step1-form]').forEach(function (form) {
      initStep1Form(form, step2Wrap, step2Form);
    });
  }

  function initStep1Form(form, step2Wrap, step2Form) {
    var nextBtn = form.querySelector('[data-step1-next]');
    var addBtn  = form.querySelector('[data-add-leg]');
    if (!nextBtn) return;

    var step1Wrap  = form.closest('[data-step="1"]');
    var inPageMode = !!(step1Wrap && step2Wrap);

    // 1) Obnovit stav (mód, úseky, hodnoty) ze sessionStorage do TOHOTO formu.
    //    Když je na stránce víc formů, oba dostanou stejný obsah ze sdílené storage.
    restoreState(form);
    syncMode(form);

    // 2) In-page režim: rozhodnout, který krok zobrazit při loadu.
    //    Cross-page formy (hero, footer) tento blok přeskočí — step 2 wrapper neexistuje.
    if (inPageMode) {
      populateStep2Hidden(step2Form);
      var cs = readState().currentStep;
      showStep(step1Wrap, step2Wrap, cs === 'step2' ? 2 : 1);
    }

    // 3) Změna režimu Jednosměrný/Zpáteční (scoped na tento form)
    form.querySelectorAll('input[type="radio"][name="trip-type"]').forEach(function (r) {
      r.addEventListener('change', function () { onModeChange(form); });
    });

    // 4) Přidat úsek
    //    V Jednosměrném: prostě přidat další úsek (addLeg už dělá smart pre-fill
    //    from = leg(n-1).to + pax).
    //    V Zpátečním: zachytíme leg 1.from/from-code + return-at PŘED přepnutím
    //    módu (onModeChange totiž return-at vyčistí). Po addLeg dotáhneme:
    //      - to + to-code = saved from (převrácená trasa)
    //      - depart-at    = saved return-at (přes flatpickr.setDate API,
    //                        aby si flatpickr datum vzal i do interního stavu)
    if (addBtn) addBtn.addEventListener('click', function (e) {
      e.preventDefault();

      var wasReturn = getMode(form) === 'return';
      var savedFrom = '', savedFromCode = '', savedReturnAt = '';

      if (wasReturn) {
        var leg1 = $('[data-leg]', form);
        if (leg1) {
          savedFrom     = val(leg1, '[name="from"]');
          savedFromCode = val(leg1, '[name="from-code"]');
        }
        savedReturnAt = val(form, '[name="return-at"]');

        var oneWayRadio = form.querySelector(
          'input[type="radio"][name="trip-type"][value="oneway"]'
        );
        if (oneWayRadio) {
          oneWayRadio.checked = true;     // programové = nefire-uje DOM change event
          onModeChange(form);              // ručně spustíme mode-switch logiku
        }
      }

      addLeg(form);

      if (wasReturn) {
        var allLegs = $$('[data-leg]', form);
        var newLeg  = allLegs[allLegs.length - 1];
        if (newLeg) {
          if (savedFrom)     setVal(newLeg, '[name="to"]',      savedFrom);
          if (savedFromCode) setVal(newLeg, '[name="to-code"]', savedFromCode);
          if (savedReturnAt) {
            var depInp = newLeg.querySelector('[name="depart-at"]');
            if (depInp && depInp._flatpickr) {
              // setDate(value, triggerChange=true) → flatpickr přepočítá vnitřní
              // selectedDates a spustí onChange → recompute v chain validaci.
              depInp._flatpickr.setDate(savedReturnAt, true);
            } else if (depInp) {
              // fallback: pokud by flatpickr ještě nebyl attachnutý (timing edge),
              // alespoň zapíšeme do .value, flatpickr ho při příštím openu načte.
              depInp.value = savedReturnAt;
            }
          }
          saveState(form);   // jistota: zachytit ve storage upravený stav po manuálním pre-fillu
        }
      }
    });

    // 5) Delegace pro dynamické úseky (Odstranit + swap), scoped na tento form
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

    // 6) Pokračovat — in-page toggle nebo cross-page redirect
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

    // 7) Auto-save (debounce 300 ms na input/change, okamžitě na strukturální změny)
    form.addEventListener('input',  function () { scheduleSave(form); });
    form.addEventListener('change', function () { scheduleSave(form); });
    form.addEventListener('legAdded',         function () { saveState(form); });
    form.addEventListener('legRemoved',       function () { saveState(form); });
    form.addEventListener('tripTypeChanged',  function () { saveState(form); });
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
    // v0.0.20: addBtn viditelný v obou módech. V Zpátečním je tam vždy 1 úsek,
    // takže limit < MAX_LEGS je automaticky splněn. Klik v Zpátečním je
    // ošetřen v initStep1Form: nejdřív přepne na Jednosměrný, pak přidá úsek.
    if (addBtn) addBtn.style.display = (legs.length < MAX_LEGS) ? '' : 'none';
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
