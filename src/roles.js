window.roles.onTabs(state => {
  const list = document.getElementById('role-tabs'); list.replaceChildren();
  for (const tab of state.tabs) {
    const row = document.createElement('div'); row.className = 'role-tab' + (tab.id === state.active ? ' active' : '');
    const select = document.createElement('button'); select.textContent = tab.name; select.setAttribute('role','tab'); select.setAttribute('aria-selected',String(tab.id === state.active)); select.disabled = tab.closing;
    select.onclick = () => window.roles.action('select',tab.id);
    const close = document.createElement('button'); close.className = 'close-role'; close.textContent = '×'; close.setAttribute('aria-label','關閉角色 ' + tab.name); close.disabled = tab.closing;
    close.onclick = () => window.roles.action('close',tab.id);
    row.append(select,close); list.append(row);
  }
});
document.getElementById('add-role').onclick = () => window.roles.action('add');
window.roles.action('list');
