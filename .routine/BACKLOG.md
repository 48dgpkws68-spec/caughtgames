# Backlog Caught Games (bovenste eerst)

- og-afbeeldingen (art/og-*.jpg) opnieuw maken als een game er zichtbaar anders uit gaat zien.
- Glass Ascent (niet gelinkt) heeft mogelijk dezelfde tabblad-sprong; alleen relevant als Nick Glass ooit terugzet.
- SONAR/PEEK! how-to (eigen CSS, niet shell.css) op lage schermen (360x560, liggend) controleren op een onder-de-vouw-knop; SNEAK is gedaan (13 nov).
- Na een muis/touch-klik zou een eerste pijltoets de cursor op de laatst gehoverde tegel kunnen zetten i.p.v. de oude toetsenbordpositie (SONAR 3D en SONAR).
- Toetsentest: Tab-volgorde op 360px (knoppen niet onder de vouw); how-to Escape/Tab-val ook in LAST REEL en SONAR 3D (sluiten al op Escape, maar zonder Tab-val en focus terug); FAIR Escape-test.
- index: honeypot-pad laat de verzendknop uitgeschakeld en "Sending..." staan (alleen bots, formulier zelf niet aanraken).
- PEEK!-geschiedenischips (alleen "2.00×") een aria-label met "crash at" geven, zoals de andere games.
- Toetsentest: klik direct na rondestart bij crash 1.00× (testhook met vaste seed) mag niet uitbetalen.
- Reduced motion: andere games met een eenmalig getekende canvas-achtergrond nalopen op dezelfde lege achtergrond als SONAR had (resize wist het canvas).
- SONAR 3D: verifier-link met path/x end-to-end testen (headless speelt de 3D-duikanimatie niet af); how-to daar ook Tab in de dialoog houden.
- check.sh: index DOM-dump faalt soms onder hoge load ("geen DOM-dump", los 40 s en ok): tweede poging of ruimere waakhond.
- check.sh: tabwissel-test (verbergen/tonen 5x, daarna nog 1 renderloop per frame) voor SNEAK en een speelgoedgame; 13 nov alleen los gemeten op de nieuwe SNEAK.
- Renderloop in passit/skyline/freeze/sonar (eigen loops in de html) nalopen op dezelfde verdubbeling bij tabwissel.
- GOOSE 63: ei kraken met Space/Enter (14 nov) end-to-end testen; headless komt een worp niet voorbij de dobbelanimatie (virtuele tijd), dus testhook of echte-tijd-run nodig.
- check.sh: mobiele how-to-screenshot van GOOSE 63 op 360px toont een lege startknop; dat is een artefact van virtuele tijd (DOM en echte-tijd-screenshot tonen LET'S GO). Eventueel 360px-screenshots in echte tijd nemen.
- Codecheck-volgorde: freeze is aan de beurt (goose gedaan op 14 nov).
