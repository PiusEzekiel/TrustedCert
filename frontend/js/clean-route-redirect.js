const targetPath = document.currentScript?.dataset.target || "/";
const targetUrl = new URL(targetPath, window.location.origin);

targetUrl.search = window.location.search;
targetUrl.hash = window.location.hash;
window.location.replace(targetUrl.toString());
