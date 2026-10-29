#!/bin/zsh
# Headless rooktest van alle pagina's: screenshots desktop + mobiel en console-fouten.
# Gebruikt een losse Chrome-instantie (eigen profiel), raakt de Chrome-routines niet.
cd "${0:A:h}/.."
OUT=".routine/shots/$(date +%Y-%m-%d)"; mkdir -p "$OUT"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROF=$(mktemp -d)
PORT=$(python3 -c "import socket;s=socket.socket();s.bind(('',0));print(s.getsockname()[1])")
python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 & SRV=$!
sleep 1
FAIL=0
for p in index peek sonar; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/$p.html")
  [ "$code" != 200 ] && { echo "FOUT $p: HTTP $code"; FAIL=1; continue; }
  for size in "1440,900:desk" "390,844:mob" "360,780:mob360"; do
    wh=${size%%:*}; tag=${size##*:}
    URL="http://127.0.0.1:$PORT/$p.html"
    # smaller dan 500px kan headless Chrome niet: render dan in een iframe met de echte breedte
    [ "$tag" != desk ] && URL="http://127.0.0.1:$PORT/.routine/frame.html?p=$p&w=${wh%%,*}&h=${wh##*,}"
    for try in 1 2 3; do
      rm -rf "$PROF"; mkdir -p "$PROF"; rm -f "$OUT/$p-$tag.png"
      # virtuele tijd kan vastlopen op pagina's met meerdere game-iframes; derde poging met echte tijd
      TIME="--virtual-time-budget=6000"; [ $try = 3 ] && TIME="--timeout=12000"
      "$CHROME" --headless=new --user-data-dir="$PROF" --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars \
        --window-size=$wh $TIME --enable-logging=stderr --v=0 \
        --screenshot="$OUT/$p-$tag.png" "$URL" 2> "$OUT/$p-$tag.log" >/dev/null &
      CPID=$!
      # waakhond: headless Chrome blijft soms hangen (WebGL in iframes); na 90s afschieten en opnieuw (max 3x)
      for i in {1..90}; do kill -0 $CPID 2>/dev/null || break; sleep 1; done
      if kill -0 $CPID 2>/dev/null; then pkill -P $CPID 2>/dev/null; kill $CPID 2>/dev/null; sleep 1; fi
      [ -s "$OUT/$p-$tag.png" ] && break
    done
    [ -s "$OUT/$p-$tag.png" ] || { echo "FOUT $p ($tag): geen screenshot (Chrome hing of crashte)"; FAIL=1; continue; }
    errs=$(grep -E "CONSOLE.*(Error|Uncaught)|Failed to load" "$OUT/$p-$tag.log" | grep -v favicon)
    if [ -n "$errs" ]; then echo "FOUT $p ($tag):"; echo "$errs" | head -5; FAIL=1; else echo "ok   $p ($tag)"; fi
  done
  # DOM-inhoud na 6s (live-feed, tellers): zichtbare tekst mag geen undefined/NaN/[object Object] bevatten
  rm -rf "$PROF"; mkdir -p "$PROF"
  "$CHROME" --headless=new --user-data-dir="$PROF" --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1440,900 \
    --virtual-time-budget=6000 --dump-dom "http://127.0.0.1:$PORT/$p.html" > "$OUT/$p-dom.html" 2>/dev/null &
  CPID=$!; for i in {1..90}; do kill -0 $CPID 2>/dev/null || break; sleep 1; done
  if kill -0 $CPID 2>/dev/null; then pkill -P $CPID 2>/dev/null; kill $CPID 2>/dev/null; sleep 1; fi
  if [ ! -s "$OUT/$p-dom.html" ]; then echo "FOUT $p (dom): geen DOM-dump"; FAIL=1; continue; fi
  bad=$(python3 -c "import re,sys;t=open(sys.argv[1],encoding='utf-8',errors='replace').read();t=re.sub(r'(?is)<(script|style|template)\b.*?</\1>','',t);t=re.sub(r'<[^>]+>',' ',t);print('\n'.join(sorted(set(m.group(0) for m in re.finditer(r'.{0,40}\b(undefined|NaN|\[object Object\])\b.{0,20}',t)))))" "$OUT/$p-dom.html")
  if [ -n "$bad" ]; then echo "FOUT $p (dom):"; echo "$bad" | head -5; FAIL=1; else echo "ok   $p (dom)"; fi
done
# Vault-skin van PEEK! (#play-vault): screenshot + console + DOM, zelfde controles
rm -rf "$PROF"; mkdir -p "$PROF"; rm -f "$OUT/vault-desk.png"
"$CHROME" --headless=new --user-data-dir="$PROF" --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --window-size=1440,900 \
  --virtual-time-budget=6000 --enable-logging=stderr --v=0 --screenshot="$OUT/vault-desk.png" "http://127.0.0.1:$PORT/peek.html#play-vault" 2> "$OUT/vault-desk.log" >/dev/null &
CPID=$!; for i in {1..90}; do kill -0 $CPID 2>/dev/null || break; sleep 1; done
if kill -0 $CPID 2>/dev/null; then pkill -P $CPID 2>/dev/null; kill $CPID 2>/dev/null; sleep 1; fi
errs=$(grep -E "CONSOLE.*(Error|Uncaught)|Failed to load" "$OUT/vault-desk.log" 2>/dev/null | grep -v favicon)
if [ ! -s "$OUT/vault-desk.png" ]; then echo "FOUT vault (desk): geen screenshot"; FAIL=1
elif [ -n "$errs" ]; then echo "FOUT vault (desk):"; echo "$errs" | head -5; FAIL=1; else echo "ok   vault (desk)"; fi
rm -rf "$PROF"; mkdir -p "$PROF"
"$CHROME" --headless=new --user-data-dir="$PROF" --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1440,900 \
  --virtual-time-budget=6000 --dump-dom "http://127.0.0.1:$PORT/peek.html#play-vault" > "$OUT/vault-dom.html" 2>/dev/null &
CPID=$!; for i in {1..90}; do kill -0 $CPID 2>/dev/null || break; sleep 1; done
if kill -0 $CPID 2>/dev/null; then pkill -P $CPID 2>/dev/null; kill $CPID 2>/dev/null; sleep 1; fi
if [ ! -s "$OUT/vault-dom.html" ]; then echo "FOUT vault (dom): geen DOM-dump"; FAIL=1
else
  bad=$(python3 -c "import re,sys;t=open(sys.argv[1],encoding='utf-8',errors='replace').read();t=re.sub(r'(?is)<(script|style|template)\b.*?</\1>','',t);t=re.sub(r'<[^>]+>',' ',t);print('\n'.join(sorted(set(m.group(0) for m in re.finditer(r'.{0,40}\b(undefined|NaN|\[object Object\])\b.{0,20}',t)))))" "$OUT/vault-dom.html")
  grep -q "<title>Vault Heist" "$OUT/vault-dom.html" || bad="Vault-skin niet actief"
  if [ -n "$bad" ]; then echo "FOUT vault (dom):"; echo "$bad" | head -5; FAIL=1; else echo "ok   vault (dom)"; fi
fi
kill $SRV; rm -rf "$PROF"
echo "Screenshots: $OUT"
exit $FAIL
