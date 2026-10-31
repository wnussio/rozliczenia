// Paragon-chan – maskotka aplikacji (autorska postać chibi: paragon z wielkimi oczami anime).
// Rysowana w SVG, kolory z motywu (CSS var), więc pasuje do trybu jasnego i ciemnego.
// Nastroje: happy (zwykła), wow (skanuje), proud (wszystko się zgadza), worried (coś nie gra), sleepy (pusto).

const EYES = {
  open: (x) => `
    <ellipse cx="${x}" cy="52" rx="7.2" ry="9" fill="var(--m-eye)"/>
    <ellipse cx="${x}" cy="54.5" rx="5.2" ry="6" fill="var(--m-iris)"/>
    <ellipse cx="${x - 2.2}" cy="48.5" rx="2.6" ry="3.2" fill="#fff"/>
    <circle cx="${x + 2.6}" cy="57" r="1.3" fill="#fff" opacity=".9"/>`,
  star: (x) => `
    <ellipse cx="${x}" cy="52" rx="7.2" ry="9" fill="var(--m-eye)"/>
    <ellipse cx="${x}" cy="54.5" rx="5.2" ry="6" fill="var(--m-iris)"/>
    <path d="M${x} 46.5l1.4 3.4 3.6.3-2.8 2.3.9 3.5-3.1-1.9-3.1 1.9.9-3.5-2.8-2.3 3.6-.3z" fill="#fff"/>
    <circle cx="${x + 3}" cy="58" r="1.2" fill="#fff" opacity=".9"/>`,
  smile: (x) => `<path d="M${x - 6.5} 54q6.5-8 13 0" fill="none" stroke="var(--m-eye)" stroke-width="2.6" stroke-linecap="round"/>`,
  closed: (x) => `<path d="M${x - 6.5} 53q6.5 5 13 0" fill="none" stroke="var(--m-eye)" stroke-width="2.4" stroke-linecap="round"/>`,
};
const MOUTH = {
  happy: `<path d="M44.5 66q5.5 5 11 0" fill="none" stroke="var(--m-eye)" stroke-width="2.2" stroke-linecap="round"/>`,
  wow: `<ellipse cx="50" cy="67.5" rx="3.6" ry="4.2" fill="var(--m-mouth)" stroke="var(--m-eye)" stroke-width="1.6"/>`,
  proud: `<path d="M43 64.5q7 9 14 0z" fill="var(--m-mouth)" stroke="var(--m-eye)" stroke-width="1.8" stroke-linejoin="round"/>`,
  worried: `<path d="M44 68q2-3 4 0t4 0 4 0" fill="none" stroke="var(--m-eye)" stroke-width="2" stroke-linecap="round"/>`,
  sleepy: `<path d="M46.5 67h7" stroke="var(--m-eye)" stroke-width="2" stroke-linecap="round"/>`,
};

export function mascot(mood = "happy", cls = "") {
  const eyes = { happy: "open", wow: "star", proud: "smile", worried: "open", sleepy: "closed" }[mood] || "open";
  const armsUp = mood === "proud" || mood === "wow";
  const extra = {
    worried: `<path d="M72 34q4 6 0 9.5q-4-3.5 0-9.5z" fill="var(--m-drop)" stroke="var(--m-eye)" stroke-width="1"/>
              <path d="M31 41l9 3M69 41l-9 3" stroke="var(--m-eye)" stroke-width="2" stroke-linecap="round"/>`,
    sleepy: `<text x="74" y="30" font-size="11" font-weight="800" fill="var(--m-iris)">z</text><text x="82" y="21" font-size="8" font-weight="800" fill="var(--m-iris)">z</text>`,
    wow: `<path d="M17 28l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="var(--m-spark)"/><path d="M84 46l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="var(--m-spark)"/>`,
    proud: `<path d="M15 40l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="var(--m-spark)"/><path d="M86 30l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="var(--m-spark)"/>`,
  }[mood] || "";
  return `<svg class="mascot ${cls} mood-${mood}" viewBox="0 0 100 112" role="img" aria-label="Paragon-chan">
  <g class="m-body">
    <!-- ahoge i kokardka -->
    <path d="M50 14q-3-11 7-12q-8 4-4 12" fill="none" stroke="var(--m-hair)" stroke-width="3" stroke-linecap="round"/>
    <path d="M62 17l9-6v12zM62 17l-1 0" fill="var(--m-bow)"/><path d="M62 17l-9-6v12z" fill="var(--m-bow)"/><circle cx="62" cy="17" r="2.6" fill="var(--m-bow2)"/>
    <!-- ręce -->
    ${armsUp
      ? `<path d="M24 62q-10-8-8-20" fill="none" stroke="var(--m-line)" stroke-width="5" stroke-linecap="round"/><path d="M76 62q10-8 8-20" fill="none" stroke="var(--m-line)" stroke-width="5" stroke-linecap="round"/>`
      : `<path d="M24 66q-9 4-10 12" fill="none" stroke="var(--m-line)" stroke-width="5" stroke-linecap="round"/><path d="M76 66q9 4 10 12" fill="none" stroke="var(--m-line)" stroke-width="5" stroke-linecap="round"/>`}
    <!-- paragon: zaokrąglona góra, ząbkowany dół -->
    <path d="M28 18h44a6 6 0 0 1 6 6v76l-5.5-4.5-5.5 4.5-5.5-4.5-5.5 4.5-5.5-4.5-5.5 4.5-5.5-4.5-5.5 4.5-5.5-4.5-6 4.5V24a6 6 0 0 1 6-6z"
      fill="var(--m-paper)" stroke="var(--m-line)" stroke-width="2.6" stroke-linejoin="round"/>
    <!-- grzywka -->
    <path d="M22 30q4-14 28-13q24-1 28 13q-6-6-12-4q-4-6-10-1q-6-5-12 1q-7-3-12 4q-5-2-10 0z" fill="var(--m-hair)"/>
    ${EYES[eyes](39)}${EYES[eyes](61)}
    <ellipse cx="31" cy="64" rx="5" ry="3" fill="var(--m-blush)" opacity=".75"/>
    <ellipse cx="69" cy="64" rx="5" ry="3" fill="var(--m-blush)" opacity=".75"/>
    ${MOUTH[mood] || MOUTH.happy}
    <!-- „wydruk” na brzuszku -->
    <path d="M36 80h28M40 87h20" stroke="var(--m-print)" stroke-width="2.4" stroke-linecap="round"/>
    ${extra}
  </g>
</svg>`;
}

// Co mówi Paragon-chan na ekranie głównym.
export function homeLine({ empty, balance, debtor, creditor, amount }) {
  if (empty) return { mood: "sleepy", text: "Pusto tu… Zeskanuj pierwszy paragon, a ja go przeczytam! ✨" };
  if (!balance) return { mood: "proud", text: "Jesteście kwita! Nikt nikomu nic nie oddaje~ ✨" };
  return { mood: "happy", text: `${debtor} → ${creditor}: ${amount} do oddania. Rozliczymy się? 💸` };
}
