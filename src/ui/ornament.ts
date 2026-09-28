// Thin gilt filigree for the UI: corner flourishes for frosted panels and
// a small divider for titles. Inline SVG in currentColor, so CSS sets the
// gilt (see .filigree and .divider in ui.css).

const CORNER =
  '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M1.5 30.5V11.5a10 10 0 0 1 10-10h19" stroke-width="1.1"/>' +
  '<path d="M5.5 23V13a7.5 7.5 0 0 1 7.5-7.5h10" stroke-width=".8" opacity=".55"/>' +
  '<path d="M9.5 18c0-4.7 3.8-8.5 8.5-8.5" stroke-width=".8" opacity=".8"/>' +
  '<path d="M18 9.5c1.7 0 2.7 1.3 2.2 2.5-.5 1.1-2.1 1.1-2.4.1" stroke-width=".8" opacity=".8"/>' +
  '<path d="M9.5 18c0 1.7 1.3 2.7 2.5 2.2 1.1-.5 1.1-2.1.1-2.4" stroke-width=".8" opacity=".8"/>' +
  '<path d="M5.5 3.2l2.3 2.3-2.3 2.3-2.3-2.3z" fill="currentColor" stroke="none"/>' +
  '</svg>'

const DIVIDER =
  '<svg viewBox="0 0 160 12" fill="none" stroke="currentColor" stroke-linecap="round">' +
  '<path d="M6 6h52M102 6h52" stroke-width=".8" opacity=".7"/>' +
  '<path d="M60 6c4-5 10-5 12-.5M100 6c-4-5-10-5-12-.5" stroke-width=".9"/>' +
  '<path d="M80 1.3l4.7 4.7-4.7 4.7-4.7-4.7z" fill="currentColor" stroke="none"/>' +
  '</svg>'

// Four corner flourishes; `el` must be position: relative (e.g. .panel).
export function addFiligree(el: HTMLElement): void {
  for (const corner of ['tl', 'tr', 'bl', 'br']) {
    const s = document.createElement('span')
    s.className = `filigree ${corner}`
    s.setAttribute('aria-hidden', 'true')
    s.innerHTML = CORNER
    el.appendChild(s)
  }
}

export function divider(): HTMLElement {
  const d = document.createElement('div')
  d.className = 'divider'
  d.setAttribute('aria-hidden', 'true')
  d.innerHTML = DIVIDER
  return d
}
