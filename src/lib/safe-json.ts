// JSON egy <script type="application/json"> blokkba (Astro set:html).
//
// A sima JSON.stringify nem escape-eli a `<`-t: ha egy cégnév, ügyfélnév vagy LLM-szöveg
// `</script><script>…` részt tartalmaz, kitör a blokkból (tárolt XSS — pl. a ranglistán más
// játékosok cégneve minden látogatónál lefutott volna). A < stb. alakot a JSON.parse
// ugyanúgy visszaadja, tehát a kliensoldali kód változatlan.
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
