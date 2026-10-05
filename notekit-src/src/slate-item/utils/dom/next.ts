export const next = (ele: Element, selector: string) => {
  let nxt = ele.nextElementSibling;
  while (nxt) {
    if (nxt.matches(selector)) {
      return nxt;
    }
    nxt = nxt.nextElementSibling;
  }
  return null;
};

export const nextAll = (ele: Element, selector: string) => {
  const res: Element[] = [];
  let nxt = ele.nextElementSibling;
  while (nxt) {
    if (nxt.matches(selector)) {
      res.push(nxt);
    }
    nxt = nxt.nextElementSibling;
  }
  return res;
};
