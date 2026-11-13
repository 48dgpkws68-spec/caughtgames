# Backlog Caught Games (bovenste eerst)

- og-afbeeldingen (art/og-*.jpg) opnieuw maken als een game er zichtbaar anders uit gaat zien.
- Glass Ascent (niet gelinkt) heeft mogelijk dezelfde tabblad-sprong; alleen relevant als Nick Glass ooit terugzet.
- SONAR/PEEK! how-to (eigen CSS, niet shell.css) op lage schermen (360x560, liggend) controleren op een onder-de-vouw-knop; SNEAK is gedaan (13 nov).
- Na een muis/touch-klik zou een eerste pijltoets de cursor op de laatst gehoverde tegel kunnen zetten i.p.v. de oude toetsenbordpositie (SONAR 3D en SONAR).
- Toetsentest uitbreiden: Escape sluit how-to/FAIR in de overige games (SNEAK/SONAR staan erin), en Tab-volgorde op 360px (knoppen niet onder de vouw).
- index: honeypot-pad laat de verzendknop uitgeschakeld en "Sending..." staan (alleen bots, formulier zelf niet aanraken).
- PEEK!-geschiedenischips (alleen "2.00×") een aria-label met "crash at" geven, zoals de andere games.
- Toetsentest: klik direct na rondestart bij crash 1.00× (testhook met vaste seed) mag niet uitbetalen.
- Reduced motion: andere games met een eenmalig getekende canvas-achtergrond nalopen op dezelfde lege achtergrond als SONAR had (resize wist het canvas).
- SONAR 3D: verifier-link met path/x end-to-end testen (headless speelt de 3D-duikanimatie niet af); how-to daar ook Tab in de dialoog houden.
- check.sh: index DOM-dump faalt soms onder hoge load ("geen DOM-dump", los 40 s en ok): tweede poging of ruimere waakhond.
- check.sh: tabwissel-test (verbergen/tonen 5x, daarna nog 1 renderloop per frame) voor SNEAK en een speelgoedgame; 13 nov alleen los gemeten op de nieuwe SNEAK.
- Renderloop in passit/skyline/freeze/sonar (eigen loops in de html) nalopen op dezelfde verdubbeling bij tabwissel.
- Codecheck-volgorde: goose is aan de beurt (sneak gedaan op 12 en 13 nov).
