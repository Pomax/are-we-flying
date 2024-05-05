const nav = document.getElementById(`nav-menu`);
const toc = document.getElementById(`markdown-toc`);
if (toc) {
  // move title
  const heading = document.querySelector(`h1#table-of-contents`);
  if (heading) {
    heading.id = `nav-toc-title`;
    nav.appendChild(heading);
  }

  // move content
  toc.id = `nav-toc`;
  nav.appendChild(toc);
}
