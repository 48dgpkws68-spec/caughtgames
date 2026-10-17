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
for p in index peek glass sonar; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/$p.html")
  [ "$code" != 200 ] && { echo "FOUT $p: HTTP $code"; FAIL=1; continue; }
  for size in "1440,900:desk" "390,844:mob"; do
    wh=${size%%:*}; tag=${size##*:}
    "$CHROME" --headless=new --user-data-dir="$PROF" --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars \
      --window-size=$wh --virtual-time-budget=6000 --enable-logging=stderr --v=0 \
      --screenshot="$OUT/$p-$tag.png" "http://127.0.0.1:$PORT/$p.html" 2> "$OUT/$p-$tag.log" >/dev/null
    errs=$(grep -E "CONSOLE.*(Error|Uncaught)|Failed to load" "$OUT/$p-$tag.log" | grep -v favicon)
    if [ -n "$errs" ]; then echo "FOUT $p ($tag):"; echo "$errs" | head -5; FAIL=1; else echo "ok   $p ($tag)"; fi
  done
done
kill $SRV; rm -rf "$PROF"
echo "Screenshots: $OUT"
exit $FAIL
