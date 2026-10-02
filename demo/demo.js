document.querySelector('#add-row').addEventListener('click', () => {
  const row = document.querySelector('tbody tr').cloneNode(true);
  row.id = 'dynamic-row'; row.querySelector('a').textContent = 'dynamic-screenshot.png';
  document.querySelector('tbody').append(row);
});
document.querySelector('#remove-row').addEventListener('click', () => document.querySelector('tbody tr').remove());

document.querySelector('#show-attachments').addEventListener('click', event => {
  if (event.currentTarget.getAttribute('aria-expanded') === 'true') return;
  const attachment = document.createElement('div');
  attachment.className = 'emailuiAttachment';
  attachment.dataset.attachmentId = '069000000000016';
  attachment.innerHTML = '<span class="icon">▧</span><a href="javascript:void(0)" title="extra-screenshot.png">extra-screenshot.png</a>';
  document.querySelector('.email-attachments').append(attachment);
  event.currentTarget.setAttribute('aria-expanded', 'true');
  event.currentTarget.textContent = 'All 6 attachments shown';
});
