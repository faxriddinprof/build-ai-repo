document.addEventListener('submit', function (e) {
  if (e.target.classList.contains('delete-form')) {
    const name = e.target.closest('tr')?.querySelector('td')?.textContent?.trim() || 'this document';
    if (!confirm('Delete "' + name + '"? This cannot be undone.')) {
      e.preventDefault();
    }
  }
});

(function () {
  const indexing = document.querySelector('[data-status="indexing"]');
  if (indexing) {
    setTimeout(function () { location.reload(); }, 4000);
  }
})();
