# Terminal font

Noto Sans Mono CJK TC Regular, from the official Noto CJK repository:
https://github.com/notofonts/noto-cjk/blob/main/Sans/Mono/NotoSansMonoCJKtc-Regular.otf

License: SIL Open Font License 1.1, included as OFL.txt.

The font uses 500-unit ASCII advances and 1000-unit CJK/box drawing advances.
`../unicode-width-data.js` is generated from its actual OpenType advance widths
and Unicode fallback properties by `../../scripts/generate-unicode-widths.py`.
This keeps the font and xterm cell allocation in agreement. xterm customGlyphs
is disabled because its box drawing replacement assumes a single-cell width.
