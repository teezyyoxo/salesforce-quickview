"""Create a reproducible, extension-only archive, without development fixtures."""
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
root = Path(__file__).resolve().parent.parent
source = root / 'extension'
version = json.loads((source / 'manifest.json').read_text())['version']
output = root / 'dist' / f'quickview-for-salesforce-{version}.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for file in sorted(source.rglob('*')):
        if file.is_file():
            info = ZipInfo(file.relative_to(source).as_posix(), (2026, 10, 2, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, file.read_bytes())
print(output)
