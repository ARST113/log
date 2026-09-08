"""Lexical retrieval for OCR artifacts. Every candidate requires scan verification.
Usage: python tools/kazan_lexicon.py ARTIFACT_DIRECTORY
Requires: pip install rapidfuzz
"""
from pathlib import Path
from functools import lru_cache
import re, json, csv, sys
from rapidfuzz.distance import Levenshtein
from rapidfuzz import process

CONFUSABLES = str.maketrans({'a':'а','c':'с','e':'е','o':'о','p':'р','x':'х','y':'у','k':'к','m':'м','t':'т','b':'в','h':'н'})
FORMS = {}
for stem, lemma in [('поребрик','поребрик'),('бордюр','бордюр')]:
    for ending in ['', 'а','у','ом','е','и','ы','ов','ам','ами','ах']:
        FORMS[stem+ending] = lemma
    for ending in ['ный','ная','ное','ные','ного','ной','ному','ным','ными','ных','ном','ную']:
        FORMS[stem+ending] = lemma

def normalize(text):
    text=text.casefold().replace('ё','е').replace('ѣ','е').replace('і','и')
    text=re.sub(r'[a-zа-я]+',lambda m:m[0].translate(CONFUSABLES) if re.search('[а-я]',m[0]) else m[0],text)
    text=re.sub(r'(?<=[а-я])[-\u00ad]\s*\n\s*(?=[а-я])','',text)
    return re.sub(r'(?<![а-я])(?:[а-я][ \t]+){4,}[а-я](?![а-я])',lambda m:re.sub(r'\s+','',m[0]),text)

def term_hits(text):
    normalized=normalize(text);result=[]
    for term,pattern in [('поребрик',r'\bпоребр[а-я]*'),('бордюр',r'\bбордюр[а-я]*')]:
        for m in re.finditer(pattern,normalized):
            result.append(dict(term=term,normalized=m[0],start=m.start(),end=m.end(),distance=0,method='stem'))
    return sorted(result,key=lambda x:x['start'])

@lru_cache(maxsize=500000)
def closest(token):
    if not 4<=len(token)<=15:return None
    found=process.extractOne(token,tuple(FORMS),scorer=Levenshtein.distance,score_cutoff=2)
    return (found[0],int(found[1]),FORMS[found[0]]) if found else None

def candidate_words(text):
    normalized=normalize(text);result=term_hits(normalized)
    for lemma in ['поребрик','бордюр']:
        pattern=r'\b'+r'[\s\-\u00ad]*'.join(lemma)+r'[а-я]*'
        for m in re.finditer(pattern,normalized):
            if re.search(r'[\s\-\u00ad]',m[0]):
                result.append(dict(term=lemma,normalized=re.sub(r'[\s\-\u00ad]','',m[0]),start=m.start(),end=m.end(),distance=0,method='spaced'))
    used={(r['start'],r['end']) for r in result}
    for m in re.finditer(r'\b[а-я]{4,15}\b',normalized):
        if (m.start(),m.end()) in used:continue
        item=closest(m[0])
        if item:
            form,distance,term=item
            result.append(dict(term=term,normalized=m[0],target=form,start=m.start(),end=m.end(),distance=distance,method='fuzzy'))
    return sorted(result,key=lambda x:x['start'])

def boundary_hits(text):
    text=normalize(text);result=[]
    rules={
      'бортовой камень':r'\bбортов[а-я]*\W+(?:[а-я]+\W+){0,3}кам(?:ен[а-я]*|н[а-я]*)',
      'тротуарный камень':r'\bтротуарн[а-я]*\W+(?:[а-я]+\W+){0,2}кам(?:ен[а-я]*|н[а-я]*)',
      'краевой камень':r'\bкраев[а-я]*\W+(?:[а-я]+\W+){0,2}кам(?:ен[а-я]*|н[а-я]*)',
      'край тротуара':r'\b(?:кра[йяюе][а-я]*|кромк[а-я]*)\W+(?:[а-я]+\W+){0,3}тротуар[а-я]*',
      'камень на ребро':r'\bкам(?:ен[а-я]*|н[а-я]*)[^.!?]{0,50}\bна\s+ребро\b',
    }
    for term,pattern in rules.items():
        for m in re.finditer(pattern,text):result.append(dict(term=term,normalized=m[0],start=m.start(),end=m.end(),distance=0,method='phrase'))
    return result

def main(directory):
    root=Path(directory);results=[];seen=set()
    for mapping in sorted(root.glob('shard_*/map.json')):
        for meta in json.loads(mapping.read_text()):
            key=(meta['id'],meta['page'])
            if key in seen:raise ValueError('Duplicate source page')
            seen.add(key)
            txt=mapping.parent/f"{Path(meta['file']).stem}_p{meta['page']:02d}.txt"
            raw=txt.read_text();n=normalize(raw)
            for hit in candidate_words(raw)+boundary_hits(raw):
                results.append({'file':meta['file'],'page':meta['page'],'year':meta['year'],'source_url':f"https://drive.google.com/file/d/{meta['id']}/view",**hit,'context':n[max(0,hit['start']-220):hit['end']+220],'verification':'pending'})
    if len(seen)!=396 or len({x[0] for x in seen})!=129:raise ValueError('Incomplete source corpus')
    (root/'lexical_candidates.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    keys=list(dict.fromkeys(k for row in results for k in row))
    with (root/'lexical_candidates.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=keys);writer.writeheader();writer.writerows(results)
    print(json.dumps({'pages':len(seen),'issues':len({x[0] for x in seen}),'candidates':len(results),'warning':'Candidate matches are not verified historical attestations.'}))

if __name__=='__main__':
    if len(sys.argv)!=2:raise SystemExit('Usage: python tools/kazan_lexicon.py ARTIFACT_DIRECTORY')
    main(sys.argv[1])
