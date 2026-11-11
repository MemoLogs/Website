'use strict';
const products = JSON.parse(document.getElementById('catalog').textContent);
const feature = document.getElementById('feature');
const find = document.getElementById('find');
const body = document.getElementById('rows');
function refreshComparison() {
  const term = find.value.trim().toLowerCase();
  const matches = products.filter(product => (product.name + ' ' + product.role).toLowerCase().includes(term));
  const fragment = document.createDocumentFragment();
  for (const product of matches) {
    const row = document.createElement('tr');
    const title = document.createElement('th');
    title.scope = 'row';
    const link = document.createElement('a');
    link.href = product.url;
    link.textContent = product.name;
    title.append(link);
    row.append(title);
    const role = document.createElement('td');
    role.textContent = product.role;
    const fact = document.createElement('td');
    fact.textContent = product.facts[feature.value];
    row.append(role, fact);
    fragment.append(row);
  }
  body.replaceChildren(fragment);
  document.getElementById('column').textContent = feature.selectedOptions[0].textContent;
  document.getElementById('result').textContent = matches.length
    ? matches.length + (matches.length === 1 ? ' product' : ' products') + ' · Reviewed November 11, 2026'
    : 'No matching tools. Try a different product name or role.';
}
feature.addEventListener('change', refreshComparison);
find.addEventListener('input', refreshComparison);
