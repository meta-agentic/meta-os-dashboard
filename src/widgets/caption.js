// What a card title adds after its first " — " or " · ": the window, the state, what
// a mark means. The name before it is the widget frame's header, so it is not repeated.
export const captionOf = (title) => {
  const m = /\s(?:—|·)\s(.+)$/.exec(title ?? '')
  return m ? m[1] : null
}
