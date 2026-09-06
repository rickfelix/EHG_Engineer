import json,sys
lines=open('.artifacts/prd-full.txt',encoding='utf-8',errors='replace').read().split('\n')
field=sys.argv[1]
for i,l in enumerate(lines):
    if l.strip()=='--- FIELD: '+field:
        payload=lines[i+1]
        try:
            d=json.loads(payload)
            print(json.dumps(d,indent=1)[:30000])
        except Exception as e:
            print(payload[:30000])
        break
