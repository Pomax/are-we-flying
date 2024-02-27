const toc = document.getElementById(`markdown-toc`);
const nav = document.getElementById(`nav-menu`);
const copied = toc.cloneNode(true);
copied.id = `nav-toc`;
nav.appendChild(copied);

document.querySelector(`h1.table-of-contents`).remove();
toc.remove();
