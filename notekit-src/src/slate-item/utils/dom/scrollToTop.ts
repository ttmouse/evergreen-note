export function scrollToTop(selector: string) {
  document.querySelector(selector)?.scrollTo(0, 0);
}
