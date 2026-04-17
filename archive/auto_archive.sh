#!/usr/bin/env bash
# Lavira Media Engine — Auto Archive Hook
# Usage: ./auto_archive.sh <jobId> <destination> <theme>
JOB_ID="${1:-unknown}"
DESTINATION="${2:-general}"
THEME="${3:-auto}"
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S")
DATE=$(date +"%Y-%m-%d")
OUTDIR=~/lavira-media-engine/home/kamau/lavira-media-engine/outputs
ARCHIVE=~/lavira-media-engine/archive

D=$(echo "$DESTINATION" | tr '[:upper:]' '[:lower:]' | tr ' ' '_')
if   echo "$D" | grep -q 'mt_kenya\|mount_kenya'; then FOLDER=mt_kenya
elif echo "$D" | grep -q 'masai_mara'; then FOLDER=masai_mara
elif echo "$D" | grep -q 'amboseli';   then FOLDER=amboseli
elif echo "$D" | grep -q 'samburu';    then FOLDER=samburu
elif echo "$D" | grep -q 'tsavo';      then FOLDER=tsavo
elif echo "$D" | grep -q 'nakuru';     then FOLDER=nakuru
elif echo "$D" | grep -q 'ol_pejeta';  then FOLDER=ol_pejeta
else FOLDER=posts; fi

mkdir -p "$ARCHIVE/$FOLDER"

N=0
for f in "$OUTDIR"/*.jpg "$OUTDIR"/*.png "$OUTDIR"/*.mp4; do
  [ -f "$f" ] || continue
  MTIME=$(stat -c %Y "$f")
  NOW=$(date +%s)
  AGE=$((NOW - MTIME))
  [ $AGE -lt 300 ] || continue
  FNAME=$(basename "$f")
  cp "$f" "$ARCHIVE/$FOLDER/${DATE}_${FNAME}" && N=$((N+1))
done

ENTRY="{\"jobId\":\"$JOB_ID\",\"dest\":\"$DESTINATION\",\"theme\":\"$THEME\",\"folder\":\"$FOLDER\",\"files\":$N,\"ts\":\"$TIMESTAMP\"}"
echo "$ENTRY" >> "$ARCHIVE/logs/${DATE}_jobs.ndjson"

python3 - << PYEOF
import json
path = '$ARCHIVE/logs/manifest.json'
try:
    m = json.load(open(path))
except:
    m = {'jobs': []}
m['jobs'].append(json.loads('$ENTRY'))
json.dump(m, open(path,'w'), indent=2)
print(f"Manifest: {len(m['jobs'])} jobs total")
PYEOF

echo "[archive] $JOB_ID -> $FOLDER ($N files copied)"
