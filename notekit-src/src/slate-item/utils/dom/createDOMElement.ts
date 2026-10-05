// Create a document fragment from a string of HTML
export function createDOMElement(
  html: string,
  tagName = 'div',
  props: any = {}
) {
  const temp = document.createElement(tagName);
  temp.innerHTML = html;
  // set attributes
  Object.keys(props).forEach((key) => {
    temp.setAttribute(key, props[key]);
  });
  return temp;
}
