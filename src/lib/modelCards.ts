export const NANO_BANANA_4_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#05060a"/>
      <stop offset="0.55" stop-color="#0b0d18"/>
      <stop offset="1" stop-color="#130a17"/>
    </linearGradient>
    <radialGradient id="glow" cx="35%" cy="30%" r="70%">
      <stop offset="0" stop-color="#00f5ff" stop-opacity="0.22"/>
      <stop offset="0.55" stop-color="#ff3df2" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#ff3df2" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="banana" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFE36A"/>
      <stop offset="0.55" stop-color="#FFD000"/>
      <stop offset="1" stop-color="#FF8A00"/>
    </linearGradient>
  </defs>

  <rect width="1600" height="900" fill="url(#bg)"/>
  <rect width="1600" height="900" fill="url(#glow)"/>

  <!-- Simple banana mark (no filters) -->
  <g transform="translate(1180 140) rotate(10)">
    <path d="M110 70c-70 120-95 235-70 345 17 76 69 138 145 165 65 23 127 18 186-11"
      fill="none" stroke="url(#banana)" stroke-width="28" stroke-linecap="round"/>
    <path d="M115 86c-54 94-78 176-63 252 10 52 38 92 88 116 44 21 94 22 148 2"
      fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="10" stroke-linecap="round"/>
  </g>

  <text x="110" y="500" fill="#e9eefc" font-size="92" font-weight="900" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">
    Nano Banana 4
  </text>
  <text x="110" y="570" fill="rgba(233,238,252,0.62)" font-size="34" font-weight="700" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">
    Imagen • clean backgrounds
  </text>

  <rect x="44" y="44" width="1512" height="812" rx="34" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
</svg>`;

export const REMOTION_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#05060a"/>
      <stop offset="0.65" stop-color="#0a0f1b"/>
      <stop offset="1" stop-color="#0c0610"/>
    </linearGradient>
    <radialGradient id="glow" cx="70%" cy="35%" r="80%">
      <stop offset="0" stop-color="#00f5ff" stop-opacity="0.18"/>
      <stop offset="0.55" stop-color="#7c5cff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#ff3df2" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1600" height="900" fill="url(#bg)"/>
  <rect width="1600" height="900" fill="url(#glow)"/>

  <!-- Timeline bars (no filters) -->
  <g opacity="0.65">
    <rect x="150" y="190" width="1080" height="18" rx="9" fill="rgba(0,245,255,0.24)"/>
    <rect x="150" y="244" width="860" height="18" rx="9" fill="rgba(255,61,242,0.14)"/>
    <rect x="150" y="298" width="990" height="18" rx="9" fill="rgba(124,92,255,0.18)"/>
    <rect x="150" y="352" width="740" height="18" rx="9" fill="rgba(233,238,252,0.10)"/>
  </g>

  <!-- Play mark -->
  <g transform="translate(1240 300)">
    <rect x="0" y="0" width="240" height="240" rx="44" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.14)" stroke-width="2"/>
    <path d="M95 72l86 48-86 48V72z" fill="rgba(0,245,255,0.9)"/>
  </g>

  <text x="110" y="560" fill="#e9eefc" font-size="104" font-weight="900" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">
    Remotion
  </text>
  <text x="110" y="632" fill="rgba(233,238,252,0.62)" font-size="34" font-weight="700" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">
    templates • motion • typography
  </text>

  <rect x="44" y="44" width="1512" height="812" rx="34" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
</svg>`;

export const VEO_3_1_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#05060a"/>
      <stop offset="0.55" stop-color="#0c0a18"/>
      <stop offset="1" stop-color="#060a12"/>
    </linearGradient>
    <radialGradient id="glow" cx="35%" cy="40%" r="85%">
      <stop offset="0" stop-color="#ff3df2" stop-opacity="0.18"/>
      <stop offset="0.5" stop-color="#7c5cff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#00f5ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="lens" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#00f5ff"/>
      <stop offset="0.5" stop-color="#7c5cff"/>
      <stop offset="1" stop-color="#ff3df2"/>
    </linearGradient>
  </defs>

  <rect width="1600" height="900" fill="url(#bg)"/>
  <rect width="1600" height="900" fill="url(#glow)"/>

  <!-- Camera body (no filter shadow) -->
  <g transform="translate(1020 230)">
    <rect x="0" y="70" width="470" height="300" rx="54" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)" stroke-width="2"/>
    <rect x="70" y="0" width="210" height="130" rx="40" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)" stroke-width="2"/>
    <circle cx="240" cy="220" r="118" fill="rgba(0,0,0,0.22)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
    <circle cx="240" cy="220" r="92" fill="url(#lens)" opacity="0.9"/>
    <circle cx="240" cy="220" r="46" fill="rgba(0,0,0,0.35)"/>
    <circle cx="355" cy="150" r="16" fill="rgba(233,238,252,0.55)"/>
  </g>

  <text x="110" y="560" fill="#e9eefc" font-size="104" font-weight="900" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">
    Veo 3.1
  </text>
  <text x="110" y="632" fill="rgba(233,238,252,0.62)" font-size="34" font-weight="700" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">
    video generation • cinematic motion
  </text>

  <rect x="44" y="44" width="1512" height="812" rx="34" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
</svg>`;

