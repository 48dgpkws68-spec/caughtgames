# Logboek nachtrondes

## 2026-10-18
- Gevonden: rooktest hing op index mobiel (headless Chrome bleef eindeloos draaien); mobiele screenshots waren schijnbaar rechts afgesneden omdat headless Chrome minimaal 500px breed rendert (backlogpunt "Glass loopt buiten beeld" was deels een meetfout); Glass-paneel kon op echte smalle schermen toch niet krimpen (grid zonder minmax); leeg geschiedenisbolletje rechtsboven in Glass; peek.html zonder hash stond in het Nederlands met NL-getalnotatie (1.000,00) op een Engelse site.
- Gedaan: check.sh met waakhond (90s), vers profiel per render, 3 pogingen (derde met echte tijd) en echte 390/360px viewport via .routine/frame.html; nu ook 360px getest.
- Gedaan: Glass Ascent mobiel: panel-kolommen minmax(0,1fr), compacter onder 380px, statusmelding boven het paneel i.p.v. eroverheen (met aria-live), leeg geschiedenisvak verborgen.
- Gedaan: PEEK! standaard Engels (Nederlands alleen via #nl) en getallen in en-US notatie bij Engels.
- Idee voor later: SONAR-uitlegvenster iets lager op 360px; og:image per game; spanning boven 10x in PEEK!.
- Voor Nick: niets

## 2026-10-19
- Gevonden: SONAR-uitlegvenster raakte op 360px de "Caught Games"-knop; SONAR-bord alleen met muis/touch te spelen (canvas zonder toetsenbord); en-dash als lege score in de SONAR-debrief; index-navigatie brak op ~1200px breed ("CAUGHT GAMES" en "Book a demo" over twee regels); PEEK! had Nederlandse aria-labels en een kaal "…" als lege geschiedenis op de Engelse pagina; game-pagina's hadden geen og-tags (peek en glass ook geen meta description, glass-titel zonder merknaam); og:image op index was webp (LinkedIn toont dat niet goed).
- Gedaan: SONAR uitlegvenster op telefoons lager en scrollbaar, raakt de terugknop niet meer.
- Gedaan: SONAR met toetsenbord speelbaar: pijltjes bewegen een cursor, Enter duikt (of pingt), spatie cast uit; schermlezer krijgt tegelstatus en toasts via aria-live; uitlegvenster is een echte dialoog met focus op de startknop. Headless getest (cursor, duik, inzet afgeschreven), testpagina weer verwijderd.
- Gedaan: og:image (1200x630 jpg, screenshot van de echte game), og/twitter-tags, canonical en description voor peek, glass en sonar; index og:image nu jpg. Waarom: casino-eigenaren delen links via LinkedIn/WhatsApp.
- Gedaan: index-nav toont tussen 1180 en 1360px 7 links en breekt niet meer; PEEK! labels Engels (NL via #nl), lege geschiedenis "No rounds yet"; en-dash in SONAR vervangen door middot.
- Idee voor later: spanning boven 10x in PEEK!/Vault; toegankelijkheid PEEK! en Glass; art/*.webp kleiner.
- Voor Nick: niets

## 2026-10-20
- Gevonden: rooktest volledig ok (12/12), geen console-fouten; peek.html zonder hash toonde de hele pitch (KPI's, rekenmodel, simulatie, waarom spelers blijven) nog in het Nederlands op de Engelse site; ongebruikte variabele q in SONAR-debrief.
- Gedaan: PEEK! en Vault Heist krijgen mijlpalen bij 10x, 25x, 50x, 100x ... 5.000x: oplopend akkoord (hoger per mijlpaal), gouden flits, muntenregen en een "25×!"-stempel onder de multiplier, plus een glans die vanaf 25x over de multiplier trekt (uit bij reduced motion). Waarom: spanning bleef boven 10x gelijk omdat de intensiteit al rond 25x maximaal was. Headless getest met geforceerde ronde, testpagina verwijderd. RTP ongewijzigd.
- Gedaan: pitch op peek.html in het Engels (cijfers gelijk aan de game sheet op index), Nederlandse versie blijft via #nl (template), simulatie-uitkomst tweetalig en aria-live.
- Gedaan: SONAR ongebruikte variabele q verwijderd. Backlogpunt webp-verkleinen geschrapt: art is al ~1 MB totaal op weergavemaat, herencoderen scheelt maar ~17% met extra kwaliteitsverlies.
- Idee voor later: mijlpalen ook in Glass Ascent; terugknop op kale peek.html; mijlpalen aankondigen voor schermlezers.
- Voor Nick: niets

## 2026-10-20 (handmatige eindcheck, dagsessie)
- Gedaan: claims eerlijk gemaakt voor studio-partners: "certified math core" weg (nog niets gecertificeerd), 4 titels i.p.v. 3, integratie/compliance-teksten als ontwerp i.p.v. bestaand product, nep-subdomein verify.caughtgames.com weg.
- Gedaan: formulier toont geen valse "Thanks" meer als FormSubmit niet geactiveerd is (success "false"), knop blokkeert dubbel verzenden, fallback mailto nick@4neon.nl; optie "Publishing or distribution partner".
- Gedaan: PEEK!, Vault Heist en Glass betalen altijd uit bij 10.000x; leeg speelgeld wordt automatisch aangevuld (ook SONAR); Glass cash-knop toont exact uitbetaalbedrag; terugknop op kale peek.html; SONAR-tegel bij game sheets; 404.html.
- Voor Nick: FormSubmit activeren (nu nick@caughtgames.com).

## 2026-10-21
- Gevonden: rooktest volledig ok (9/9), geen console-fouten, screenshots netjes. Codecheck index: game sheet noemde "Instant bust (1.00×) 3.0%" terwijl de echte kans op een 1.00×-crash 3.96% is (de math lab op dezelfde pagina toonde al 3.96%); tegenstrijdig voor een casino-wiskundige. PEEK!: geen meldingen voor schermlezers bij rondestart, mijlpalen of crash; spatietoets kaapte ook gefocuste knoppen (bijv. Sound) en auto-repeat.
- Gedaan: game sheet PEEK!/Vault instant bust 3.96% (= 1 - 0.97/1.01, RTP ongewijzigd). Waarom: cijfers moeten onderling kloppen voor een operator.
- Gedaan: PEEK! toegankelijkheid: verborgen aria-live-regel meldt "Betting is open", "Round started", mijlpalen ("25× reached") en het einde van de ronde (NL via #nl); canvas role=img, geschiedenis als lijst; spatie start/cash alleen buiten knoppen/velden en zonder auto-repeat. Headless getest (melding verschijnt), geen testhooks achtergelaten.
- Idee voor later: aria-labels op inzetknoppen PEEK!; nav-link Vault Heist eigen doel; SONAR-uitlegvenster op 360px compacter (past nu net).
- Voor Nick: niets
