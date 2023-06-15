const XMLNS = "http://www.w3.org/2000/svg";

export const element = (tag, attributes = []) => {
  const e = document.createElementNS(XMLNS, tag);
  Object.entries(attributes).forEach(([key, value]) => set(e, key, value));
  return e;
};

export const set = (e, key, value) => e.setAttribute(key, value);
