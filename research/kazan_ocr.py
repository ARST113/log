"""Auditable OCR batches for the supplied Kazan newspaper corpus."""
from pathlib import Path
import argparse, csv, hashlib, io, json, re, time

FOLDERS = {
    1937: ('1I6ECRjuFhZb_n13QC4E8MBv6pPiC7Sku', 32),
    1945: ('1QeSvCIwxLN_kc3M54SDHjTFhp3rpPEEn', 60),
    1953: ('1RpIfqv6iZ2H8fDTRE0um80g9OPtE5jpb', 37),
}

def partition(rows, index, count):
    if not 0 <= index < count:
        raise ValueError('Invalid partition')
    return rows[index::count]

def split_pages(text, count):
    pages = text.split('\f')
    if len(pages) == count + 1 and not pages[-1].strip():
        pages.pop()
    if len(pages) != count:
        raise ValueError(f'Text/page count mismatch: {len(pages)} != {count}')
    return pages

def normalize(text):
    text = text.lower().replace('ё', 'е')
    return re.sub(r'(?<=[а-я])[-\u00ad]\s*\n\s*(?=[а-я])', '', text)

def inventory():
    import gdown
    rows = []
    for year, (folder, expected) in FOLDERS.items():
        files = gdown.download_folder(id=folder, skip_download=True, quiet=True)
        files = [f for f in files if f.path.lower().endswith('.pdf')]
        if len(files) != expected:
            raise ValueError(f'{year}: expected {expected} files, got {len(files)}')
        rows.extend(dict(year=year, id=f.id, file=Path(f.path).name) for f in files)
    rows.sort(key=lambda r: (r['year'], r['file'][-11:-4], r['file']))
    if len({r['id'] for r in rows}) != 129:
        raise ValueError('Inventory is not 129 unique provider files')
    Path('inventory.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    print(json.dumps({'issues': len(rows), 'shards': 32}))

def prepare(index):
    import fitz, gdown
    from PIL import Image, ImageOps
    source = json.loads(Path('inventory.json').read_text())
    rows = partition(source, index, 32)
    work = Path('work'); work.mkdir(exist_ok=True)
    dest = Path('out') / f'shard_{index:02d}'; dest.mkdir(parents=True, exist_ok=True)
    pages = []
    for row in rows:
        pdf = work / row['file']
        for attempt in range(3):
            try:
                result = gdown.download(id=row['id'], output=str(pdf), quiet=True)
                if not result or pdf.read_bytes()[:5] != b'%PDF-':
                    raise ValueError('Download did not return a PDF')
                break
            except Exception:
                if attempt == 2: raise
                time.sleep(3 * (attempt + 1))
        sha = hashlib.sha256(pdf.read_bytes()).hexdigest()
        with fitz.open(pdf) as doc:
            for page in doc:
                images = page.get_images(full=True)
                if len(images) == 1 and page.rotation == 0:
                    image = Image.open(io.BytesIO(doc.extract_image(images[0][0])['image'])).convert('L')
                else:
                    pix = page.get_pixmap(matrix=fitz.Matrix(3,3), colorspace=fitz.csGRAY, alpha=False)
                    image = Image.frombytes('L', (pix.width,pix.height), pix.samples)
                native = image.size
                scale = max(1.0, 3000 / image.width)
                if scale > 1:
                    image = image.resize((round(image.width*scale),round(image.height*scale)), Image.Resampling.LANCZOS)
                image = ImageOps.autocontrast(image, cutoff=0.1); image.info.clear()
                target = work / f'{pdf.stem}_p{page.number+1:02d}.png'
                image.save(target, compress_level=1)
                pages.append({**row, 'page':page.number+1, 'pdf_pages':len(doc), 'sha256':sha,
                              'image':str(target.resolve()), 'width':image.width, 'height':image.height,
                              'native_width':native[0], 'native_height':native[1]})
    (dest/'map.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2))
    Path('batch.list').write_text('\n'.join(p['image'] for p in pages)+'\n')
    print(f'SHARD {index}: {len(rows)} issues, {len(pages)} pages')

def finish(index):
    dest = Path('out') / f'shard_{index:02d}'
    mapping = json.loads((dest/'map.json').read_text())
    text = split_pages((dest/'batch.txt').read_text(),len(mapping))
    output = []
    for meta, raw in zip(mapping,text):
        name = f"{Path(meta['file']).stem}_p{meta['page']:02d}.txt"
        (dest/name).write_text(raw)
        output.append({**meta, 'text':name, 'chars':len(raw), 'nonempty':bool(raw.strip())})
    # Tesseract TSV contains literal quotation marks, not CSV-quoted fields.
    with (dest/'batch.tsv').open() as f:
        tsv_pages = {int(r['page_num']) for r in csv.DictReader(f,delimiter='\t',quoting=csv.QUOTE_NONE) if r['level']=='1'}
    if tsv_pages != set(range(1,len(mapping)+1)):
        raise ValueError('TSV page coverage is incomplete')
    (dest/'coverage.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
    print(f'VALIDATED {len(output)} text pages')

def collect():
    coverage=[]
    for file in sorted(Path('out').glob('shard_*/coverage.json')):
        coverage.extend(json.loads(file.read_text()))
    keys={(r['id'],r['page']) for r in coverage}
    if len(coverage)!=396 or len(keys)!=396 or len({r['id'] for r in coverage})!=129:
        raise ValueError(f'Incomplete corpus: {len(coverage)} records, {len(keys)} unique pages')
    if not all(r['nonempty'] for r in coverage):
        raise ValueError('At least one page has empty OCR')
    Path('out/coverage_all.json').write_text(json.dumps(coverage,ensure_ascii=False,indent=2))
    print('VERIFIED: 129 issues / 396 unique nonempty text pages')

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('command',choices=['inventory','prepare','finish','collect']); parser.add_argument('--shard',type=int,default=0)
    args=parser.parse_args()
    if args.command=='inventory': inventory()
    elif args.command=='prepare': prepare(args.shard)
    elif args.command=='finish': finish(args.shard)
    else: collect()
