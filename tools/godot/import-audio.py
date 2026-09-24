"""Restore downloadable audio from pinned archives and verify bundled recordings."""
import hashlib, io, json, pathlib, struct, urllib.request, urllib.parse, wave, zipfile
ROOT = pathlib.Path(__file__).resolve().parents[2]
BANK = ROOT / 'godot/assets/audio'

def pcm16(raw):
    with wave.open(io.BytesIO(raw)) as source:
        width, channels, rate = source.getsampwidth(), source.getnchannels(), source.getframerate()
        frames = source.readframes(source.getnframes())
    samples = []
    for offset in range(0, len(frames), width * channels):
        values = [int.from_bytes(frames[offset+c*width:offset+(c+1)*width], 'little', signed=True) for c in range(channels)]
        samples.append(sum(values) / channels)
    mean = sum(samples) / max(1, len(samples)); samples = [x - mean for x in samples]
    peak = max(abs(x) for x in samples) or 1
    out = io.BytesIO()
    with wave.open(out, 'wb') as dest:
        dest.setnchannels(1); dest.setsampwidth(2); dest.setframerate(rate)
        dest.writeframes(b''.join(struct.pack('<h', round(x / peak * 16422)) for x in samples))
    return out.getvalue()

def restore(manifest):
    cache = ROOT / '.native-run/audio-packs'; cache.mkdir(parents=True, exist_ok=True)
    archives = {}
    for key, source in manifest['sources'].items():
        if source.get('bundled'): continue
        cached = cache / (key + (pathlib.PurePosixPath(urllib.parse.urlparse(source['download']).path).suffix if source.get('direct') else '.zip'))
        if not cached.exists():
            with urllib.request.urlopen(source['download'], timeout=60) as response:
                cached.write_bytes(response.read())
        raw = cached.read_bytes()
        if hashlib.sha256(raw).hexdigest() != source['sha256']: raise ValueError('Source hash mismatch: ' + key)
        archives[key] = raw if source.get('direct') else zipfile.ZipFile(io.BytesIO(raw))
    for name, entry in manifest['files'].items():
        if manifest['sources'][entry['source']].get('bundled'):
            target = BANK / name
            if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != entry['sha256']:
                raise ValueError('Restore bundled audio from Git: ' + name)
            continue
        source = archives[entry['source']]
        raw = source if isinstance(source, bytes) else source.read(entry['member'])
        if entry.get('convert') == 'mono-pcm16-peak-6db': raw = pcm16(raw)
        if entry.get('sha256') and hashlib.sha256(raw).hexdigest() != entry['sha256']: raise ValueError('Output hash mismatch: ' + name)
        target = BANK / name
        if not target.resolve().is_relative_to(BANK.resolve()): raise ValueError('Invalid target')
        target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(raw)
    print('AUDIO_RESTORED', len(manifest['files']))

if __name__ == '__main__': restore(json.loads((BANK / 'manifest.json').read_text()))
