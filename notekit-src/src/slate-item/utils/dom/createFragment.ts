/**
 * Create a document fragment from a string of HTML
 * @param html
 * @returns 
 */
export function createFragment(html: string | Element) {
  const frag = document.createDocumentFragment();
  const temp = document.createElement('div');
  if (typeof html === 'string') {
    temp.innerHTML = html;
  } else {
    temp.appendChild(html);
  }

  while (temp.firstChild) {
    frag.appendChild(temp.firstChild);
  }
  return frag;
}
