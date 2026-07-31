const MAP_SVG = `
<svg class="ff-map-v6-world" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg" aria-label="Карта Фэнтези Феста 2026">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f1e5c9"/>
      <stop offset=".48" stop-color="#e7d7b7"/>
      <stop offset="1" stop-color="#d9c39f"/>
    </linearGradient>
    <filter id="paperNoise" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency=".018" numOctaves="3" seed="8" result="noise"/>
      <feColorMatrix in="noise" type="saturate" values="0" result="mono"/>
      <feComponentTransfer in="mono" result="faded"><feFuncA type="table" tableValues="0 .11"/></feComponentTransfer>
      <feBlend in="SourceGraphic" in2="faded" mode="multiply"/>
    </filter>
    <filter id="inkShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#493c27" flood-opacity=".2"/>
    </filter>
    <symbol id="tree" viewBox="0 0 90 120">
      <g fill="none" stroke="#342b20" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M45 112V66M45 87l-16-14M45 77l17-18"/>
        <path fill="#e9d9b8" d="M25 69c-16-8-17-27-4-36-4-17 11-29 26-21 11-14 34-4 30 14 17 5 15 30-2 34-2 17-23 24-34 13-5 5-10 5-16-4Z"/>
        <path d="M29 48c8-7 14-9 23-7M48 27c7 4 12 9 14 15M25 64c10-1 18 1 25 8" stroke-width="3" opacity=".7"/>
      </g>
    </symbol>
    <symbol id="tent" viewBox="0 0 140 100">
      <g fill="#e5d2ae" stroke="#342b20" stroke-width="5" stroke-linejoin="round">
        <path d="M12 86 68 15l60 71Z"/>
        <path d="M68 15v71M68 40 47 86M68 40l23 46" fill="none"/>
        <path d="M7 86h128" fill="none"/>
      </g>
    </symbol>
    <symbol id="stage" viewBox="0 0 190 140">
      <g fill="#e7d5b4" stroke="#342b20" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
        <path d="M15 118h160M26 118V54h138v64M20 54h150L148 25H43Z"/>
        <path d="M45 64v42M95 64v42M145 64v42"/>
        <path fill="#342b20" d="M38 76h18v24H38zM134 76h18v24h-18z"/>
        <path d="M76 96c12-18 25-26 38-5M96 62v36" fill="none"/>
        <path d="M27 47V25l18 7-18 7M162 48V26l18 7-18 7" fill="none"/>
      </g>
    </symbol>
    <symbol id="stall" viewBox="0 0 180 120">
      <g fill="#e7d5b4" stroke="#342b20" stroke-width="5" stroke-linejoin="round">
        <path d="M15 42h150l-18-24H33Z"/>
        <path d="M25 42v65M155 42v65M15 107h150" fill="none"/>
        <path d="M39 42v18M63 42v18M87 42v18M111 42v18M135 42v18"/>
        <path d="M40 82h100M55 72v28M90 72v28M125 72v28" fill="none"/>
      </g>
    </symbol>
    <symbol id="tower" viewBox="0 0 140 180">
      <g fill="#e6d3af" stroke="#342b20" stroke-width="5" stroke-linejoin="round">
        <path d="M25 160 43 55h54l18 105M35 96h70M30 128h80" fill="none"/>
        <path d="M30 55h80L91 24H49Z"/>
        <path d="M53 55v-22M87 55v-22M20 160h100" fill="none"/>
      </g>
    </symbol>
    <symbol id="cart" viewBox="0 0 160 110">
      <g fill="#e5d1ac" stroke="#342b20" stroke-width="5" stroke-linejoin="round">
        <path d="M25 28h105l-15 48H35Z"/>
        <path d="M30 28 17 14M130 28l18-12M45 76v14M105 76v14" fill="none"/>
        <circle cx="46" cy="91" r="13"/><circle cx="107" cy="91" r="13"/>
        <path d="M55 38h60M50 50h61M46 62h62" fill="none" stroke-width="3"/>
      </g>
    </symbol>
    <symbol id="target" viewBox="0 0 110 120">
      <g fill="#eadab9" stroke="#342b20" stroke-width="5" stroke-linejoin="round">
        <circle cx="55" cy="45" r="31"/><circle cx="55" cy="45" r="17"/><circle cx="55" cy="45" r="5" fill="#342b20"/>
        <path d="M40 74 28 112M70 74l12 38M21 112h68" fill="none"/>
      </g>
    </symbol>
    <symbol id="medical" viewBox="0 0 150 120">
      <g fill="#e7d5b4" stroke="#342b20" stroke-width="5" stroke-linejoin="round">
        <path d="M15 103 74 22l61 81Z"/>
        <path d="M74 22v81M41 103h67" fill="none"/>
        <path fill="#342b20" d="M67 45h15v39H67zM55 57h39v15H55z" stroke="none"/>
      </g>
    </symbol>
    <symbol id="boat" viewBox="0 0 240 130">
      <g fill="#dfc79e" stroke="#342b20" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
        <path d="M22 92c46 16 145 16 196 0-17 28-49 38-99 38S39 121 22 92Z"/>
        <path d="M78 89V18M78 18l74 42H78M154 60v27M30 92h180" fill="none"/>
        <path d="M81 23v62M93 30v55M106 37v48M119 44v41M132 50v35M145 57v28" stroke-width="3" fill="none"/>
      </g>
    </symbol>
    <symbol id="fire" viewBox="0 0 110 110">
      <g stroke="#342b20" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
        <path fill="#e3c593" d="M55 12c-1 17 14 18 9 38 12-8 20-1 19 13-1 21-17 33-30 33S24 84 25 63c1-14 10-21 20-29 7-5 9-12 10-22Z"/>
        <path d="M18 98 91 76M20 76l70 23" fill="none"/>
      </g>
    </symbol>
    <symbol id="camper" viewBox="0 0 200 120">
      <g fill="#e2cfaa" stroke="#342b20" stroke-width="5" stroke-linejoin="round">
        <path d="M20 95V33h119l31 31v31Z"/>
        <path d="M40 45h48v30H40zM105 45h27l24 23h-51z"/>
        <circle cx="58" cy="99" r="14"/><circle cx="145" cy="99" r="14"/>
      </g>
    </symbol>
    <symbol id="number" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r="21" fill="#efe1c4" stroke="#342b20" stroke-width="4"/>
    </symbol>
  </defs>

  <rect width="1080" height="1920" fill="url(#paper)"/>
  <rect width="1080" height="1920" fill="transparent" filter="url(#paperNoise)"/>

  <g id="terrain" fill="none" stroke="#8e7a59" stroke-width="3" opacity=".38" stroke-linecap="round">
    <path d="M24 318c180-73 320-45 477-9 168 39 337 18 555-69"/>
    <path d="M4 343c180-58 332-27 486 12 187 48 369 2 580-74"/>
    <path d="M48 1120c179-55 344-44 515 5 171 49 327 44 487-17"/>
    <path d="M35 1146c186-44 346-26 505 23 177 55 348 34 504-27"/>
    <path d="M72 1420c173-61 356-44 508 11 164 59 305 68 447 18"/>
    <path d="M70 1451c191-53 355-30 500 24 161 60 313 62 442 13"/>
  </g>

  <g id="forest-top" filter="url(#inkShadow)">
    <use href="#tree" x="18" y="18" width="104" height="138"/><use href="#tree" x="87" y="8" width="97" height="130"/>
    <use href="#tree" x="151" y="24" width="106" height="141"/><use href="#tree" x="223" y="4" width="94" height="126"/>
    <use href="#tree" x="301" y="17" width="105" height="140"/><use href="#tree" x="376" y="3" width="92" height="124"/>
    <use href="#tree" x="670" y="15" width="105" height="140"/><use href="#tree" x="747" y="0" width="95" height="126"/>
    <use href="#tree" x="823" y="21" width="104" height="138"/><use href="#tree" x="900" y="4" width="96" height="128"/>
    <use href="#tree" x="964" y="28" width="100" height="134"/>
  </g>

  <g id="parkings" filter="url(#inkShadow)">
    <use href="#cart" x="120" y="155" width="155" height="107"/>
    <text x="190" y="144" font-family="Georgia,serif" font-size="30" fill="#342b20">P</text>
    <use href="#cart" x="744" y="158" width="155" height="107"/>
    <text x="815" y="146" font-family="Georgia,serif" font-size="30" fill="#342b20">P</text>
    <g transform="translate(172 274)"><use href="#number" width="48" height="48"/><text x="24" y="33" text-anchor="middle" font-family="Georgia,serif" font-size="25" font-weight="700" fill="#342b20">2</text></g>
    <g transform="translate(786 278)"><use href="#number" width="48" height="48"/><text x="24" y="33" text-anchor="middle" font-family="Georgia,serif" font-size="25" font-weight="700" fill="#342b20">1</text></g>
  </g>

  <g id="upper-zone" filter="url(#inkShadow)">
    <use href="#medical" x="30" y="350" width="130" height="105"/>
    <g transform="translate(35 465)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">3</text></g>

    <use href="#stage" x="120" y="385" width="230" height="170"/>
    <g transform="translate(125 550)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">4</text></g>

    <use href="#stage" x="480" y="370" width="240" height="177"/>
    <g transform="translate(485 545)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">5</text></g>

    <use href="#tower" x="820" y="326" width="140" height="180"/><use href="#tower" x="920" y="326" width="140" height="180"/>
    <path d="M904 385h38" fill="none" stroke="#342b20" stroke-width="7"/>
    <g transform="translate(856 515)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">12</text></g>
  </g>

  <g id="activities-zone" filter="url(#inkShadow)">
    <g transform="translate(62 625)">
      <use href="#fire" x="0" y="0" width="90" height="90"/>
      <path d="M105 47c25-16 51-15 78 3M132 21v53M166 28v44" fill="none" stroke="#342b20" stroke-width="5"/>
      <g transform="translate(8 91)"><use href="#number" width="44" height="44"/><text x="22" y="30" text-anchor="middle" font-family="Georgia,serif" font-size="22" font-weight="700" fill="#342b20">6</text></g>
    </g>

    <g transform="translate(245 645)">
      <path d="M8 148h205V26H8Z" fill="#e8d8b8" stroke="#342b20" stroke-width="6"/>
      <path d="M40 26v122M180 26v122M17 52h188" fill="none" stroke="#342b20" stroke-width="4"/>
      <path d="M55 110c24-34 55-44 87-7M102 66v72" fill="none" stroke="#342b20" stroke-width="6"/>
      <g transform="translate(-8 155)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">7</text></g>
    </g>

    <g transform="translate(568 635)">
      <path d="M20 126V46h190v80M30 46l27-29h116l27 29" fill="#e5d3af" stroke="#342b20" stroke-width="6"/>
      <path d="M64 62v52M112 62v52M160 62v52" fill="none" stroke="#342b20" stroke-width="4"/>
      <path d="M15 126h205" fill="none" stroke="#342b20" stroke-width="6"/>
      <g transform="translate(-5 132)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">8</text></g>
    </g>

    <use href="#target" x="820" y="620" width="92" height="102"/><use href="#target" x="900" y="605" width="98" height="107"/>
    <path d="M953 720c-24 32-37 72-30 112M942 739l33 18-25 25" fill="none" stroke="#342b20" stroke-width="6"/>
    <g transform="translate(818 735)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">11</text></g>
  </g>

  <g id="market-zone" filter="url(#inkShadow)">
    <use href="#stall" x="55" y="880" width="205" height="136"/>
    <g transform="translate(58 1014)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">9</text></g>

    <use href="#stall" x="275" y="885" width="205" height="136"/>
    <g transform="translate(278 1017)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">10</text></g>

    <use href="#stage" x="650" y="850" width="235" height="174"/>
    <g transform="translate(653 1021)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">13</text></g>

    <use href="#fire" x="910" y="885" width="90" height="90"/>
    <path d="M875 912h28M882 937h32M896 870v33" fill="none" stroke="#342b20" stroke-width="5"/>
  </g>

  <g id="literary-zone" filter="url(#inkShadow)">
    <path d="M300 1125h110v70H300z" fill="#e8d7b6" stroke="#342b20" stroke-width="6"/>
    <path d="m300 1125 55-45 55 45M355 1080v115" fill="none" stroke="#342b20" stroke-width="5"/>
    <g transform="translate(282 1195)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">14</text></g>

    <path d="M510 1195v-105h180v105M500 1090l36-43h129l35 43" fill="#e8d7b6" stroke="#342b20" stroke-width="6"/>
    <path d="M548 1120h28v75M624 1120h28v75" fill="none" stroke="#342b20" stroke-width="4"/>
    <g transform="translate(502 1195)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">15</text></g>

    <use href="#medical" x="790" y="1075" width="150" height="120"/>
    <g transform="translate(790 1195)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">16</text></g>
  </g>

  <g id="food-zone" filter="url(#inkShadow)">
    <use href="#stall" x="160" y="1260" width="310" height="205"/>
    <path d="M210 1363h210M240 1322h45v40M350 1322h45v40" fill="none" stroke="#342b20" stroke-width="5"/>
    <g transform="translate(156 1458)"><use href="#number" width="48" height="48"/><text x="24" y="33" text-anchor="middle" font-family="Georgia,serif" font-size="24" font-weight="700" fill="#342b20">17</text></g>

    <use href="#stall" x="595" y="1260" width="310" height="205"/>
    <path d="M645 1363h210M675 1322h45v40M785 1322h45v40" fill="none" stroke="#342b20" stroke-width="5"/>
  </g>

  <g id="camp-zone" filter="url(#inkShadow)">
    <use href="#tent" x="65" y="1500" width="155" height="112"/><use href="#tent" x="195" y="1518" width="135" height="98"/>
    <use href="#fire" x="145" y="1600" width="75" height="75"/>
    <g transform="translate(58 1635)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">18</text></g>

    <use href="#camper" x="382" y="1510" width="175" height="105"/>
    <path d="M470 1625h90M520 1592v33" fill="none" stroke="#342b20" stroke-width="5"/>
    <g transform="translate(382 1635)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">20</text></g>

    <use href="#tent" x="630" y="1495" width="138" height="100"/><use href="#tent" x="755" y="1518" width="126" height="91"/><use href="#tent" x="850" y="1488" width="145" height="105"/>
    <g transform="translate(635 1635)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">21</text></g>
    <g transform="translate(910 1630)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">22</text></g>

    <use href="#tent" x="60" y="1690" width="130" height="94"/><use href="#tent" x="180" y="1710" width="120" height="87"/>
    <g transform="translate(58 1792)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">23</text></g>

    <use href="#tent" x="830" y="1690" width="130" height="94"/><use href="#tent" x="930" y="1715" width="110" height="80"/>
    <g transform="translate(900 1793)"><use href="#number" width="46" height="46"/><text x="23" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#342b20">24</text></g>
  </g>

  <g id="pier-zone" filter="url(#inkShadow)">
    <path d="M0 1810c145-29 283-24 428 12 169 43 348 48 652-12v110H0Z" fill="#cdbd99" stroke="#342b20" stroke-width="5"/>
    <path d="M0 1842c177-34 342-12 495 26 185 45 355 37 585-12M0 1878c191-31 363-5 515 30" fill="none" stroke="#6d5b3d" stroke-width="3" opacity=".7"/>
    <use href="#boat" x="85" y="1770" width="225" height="122"/><use href="#boat" x="395" y="1790" width="210" height="114"/><use href="#boat" x="690" y="1765" width="250" height="135"/>
    <g transform="translate(28 1815)"><use href="#number" width="50" height="50"/><text x="25" y="34" text-anchor="middle" font-family="Georgia,serif" font-size="25" font-weight="700" fill="#342b20">19</text></g>
  </g>

  <g id="labels" fill="#342b20" font-family="Georgia,'Times New Roman',serif" font-size="21" font-weight="700">
    <text x="110" y="345">Медпункт</text><text x="155" y="590">Сцена «Былина»</text><text x="510" y="585">Сцена «Берег»</text>
    <text x="844" y="570">Зона досмотра</text><text x="260" y="845">Танцы и сражения</text><text x="806" y="815">Лучная секция</text>
    <text x="60" y="1080">Антуражная торговля</text><text x="665" y="1080">Круг Света</text>
    <text x="285" y="1255">Литературная секция</text><text x="555" y="1255">Лекторий</text><text x="785" y="1255">Медпункт</text>
    <text x="230" y="1485">Ярмарка и еда</text><text x="650" y="1485">Таверна</text>
    <text x="58" y="1675">Антуражный лагерь</text><text x="385" y="1675">Авто и мото кемпинг</text><text x="640" y="1675">Палаточная гостиница</text>
    <text x="55" y="1830">Шумный лагерь</text><text x="820" y="1830">Тихий лагерь</text>
  </g>
</svg>
`;
