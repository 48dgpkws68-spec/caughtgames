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
