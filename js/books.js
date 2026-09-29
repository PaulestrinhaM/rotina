// ═══ BOOKS (Materiais) ═══
const BOOK_STATUS = {
  quero:    { label:'Quero ler',  color:'var(--muted2)',  bg:'rgba(100,100,130,.15)' },
  lendo:    { label:'Lendo',      color:'var(--accent)',  bg:'rgba(232,197,71,.12)'  },
  concluido:{ label:'Concluído',  color:'var(--green)',   bg:'rgba(168,224,90,.12)'  },
  pausado:  { label:'Pausado',    color:'var(--blue)',    bg:'rgba(122,180,255,.12)' },
};

let books        = [];
let booksFilter  = 'todos';
let editingBookId = null;

async function loadBooks() {
  try { const r = await store.get('books_data'); books = r ? JSON.parse(r) : []; }
  catch { books = []; }
}
async function saveBooks() { await store.set('books_data', JSON.stringify(books)); }

function renderBooks() {
  const filters = document.getElementById('booksFilters');
  const opts = [
    { key:'todos',     label:'Todos'         },
    { key:'lendo',     label:'📖 Lendo'      },
    { key:'quero',     label:'📚 Quero ler'  },
    { key:'concluido', label:'✅ Concluídos' },
    { key:'pausado',   label:'⏸ Pausados'   },
  ];
  filters.innerHTML = '';
  opts.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'bfilter' + (booksFilter === f.key ? ' active' : '');
    btn.textContent = f.label;
    btn.onclick = () => { booksFilter = f.key; renderBooks(); };
    filters.appendChild(btn);
  });

  const list     = document.getElementById('booksList');
  const filtered = booksFilter === 'todos' ? books : books.filter(b => b.status === booksFilter);
  list.innerHTML = '';

  if (!filtered.length) {
    list.innerHTML = `<div class="books-empty">NENHUM LIVRO AQUI<br>${booksFilter === 'todos' ? 'Clica em + Livro para adicionar' : 'Nenhum livro nesta categoria'}</div>`;
    return;
  }

  const order  = { lendo:0, quero:1, pausado:2, concluido:3 };
  const sorted = [...filtered].sort((a,b) => (order[a.status]||0) - (order[b.status]||0));

  sorted.forEach(book => {
    const st    = BOOK_STATUS[book.status] || BOOK_STATUS.quero;
    const stars = book.rating > 0 ? '★'.repeat(book.rating) + '☆'.repeat(5-book.rating) : '';
    const card  = document.createElement('div');
    card.className = 'book-card';
    card.innerHTML = `
      <div class="book-status-dot" style="background:${st.color};"></div>
      <div class="book-info">
        <div class="book-title">${sanitize(book.title)}</div>
        ${book.author ? `<div class="book-author">${sanitize(book.author)}</div>` : ''}
        <div class="book-meta">
          <span class="book-badge" style="color:${st.color};background:${st.bg};">${st.label}</span>
          ${stars ? `<span class="book-rating">${stars}</span>` : ''}
        </div>
        ${book.notes ? `<div class="book-notes">${sanitize(book.notes)}</div>` : ''}
      </div>
      <div class="book-actions">
        <button class="book-act-btn" onclick="openBookForm('${book.id}')" title="Editar">✏</button>
        <button class="book-act-btn del" onclick="deleteBook('${book.id}')" title="Excluir">✕</button>
      </div>`;
    list.appendChild(card);
  });
}

function openBookForm(id) {
  editingBookId = id || null;
  const book = id ? books.find(b => b.id === id) : null;
  document.getElementById('bookModalTitle').textContent = book ? 'Editar livro' : 'Adicionar livro';
  document.getElementById('bfTitle').value  = book ? book.title  : '';
  document.getElementById('bfAuthor').value = book ? book.author : '';
  document.getElementById('bfStatus').value = book ? book.status : 'quero';
  document.getElementById('bfRating').value = book ? book.rating : 0;
  document.getElementById('bfNotes').value  = book ? book.notes  : '';
  document.getElementById('bookModal').classList.add('open');
  setTimeout(() => document.getElementById('bfTitle').focus(), 100);
}

async function saveBook() {
  const title = document.getElementById('bfTitle').value.trim();
  if (!title) { document.getElementById('bfTitle').focus(); return; }
  const data = {
    id:        editingBookId || 'book_' + Date.now(),
    title,
    author:    document.getElementById('bfAuthor').value.trim(),
    status:    document.getElementById('bfStatus').value,
    rating:    parseInt(document.getElementById('bfRating').value) || 0,
    notes:     document.getElementById('bfNotes').value.trim(),
    updatedAt: Date.now(),
  };

  // Um livro em leitura por vez (SDD 6.4): marcar este como "lendo" move
  // automaticamente o anterior para "pausado", com aviso — não bloqueia.
  let livroMovido = null;
  if (data.status === 'lendo') {
    const anterior = books.find(b => b.status === 'lendo' && b.id !== data.id);
    if (anterior) { anterior.status = 'pausado'; livroMovido = anterior.title; }
  }

  if (editingBookId) {
    const idx = books.findIndex(b => b.id === editingBookId);
    if (idx >= 0) books[idx] = data;
  } else {
    books.unshift(data);
  }
  await saveBooks();
  document.getElementById('bookModal').classList.remove('open');
  renderBooks();
  showToast(
    (editingBookId ? 'Livro atualizado' : 'Livro adicionado') +
    (livroMovido ? ` · "${livroMovido}" movido para pausado` : '')
  );
  editingBookId = null;
}

async function deleteBook(id) {
  books = books.filter(b => b.id !== id);
  await saveBooks();
  renderBooks();
  showToast('Livro removido');
}

function closeBookModal(e) {
  if (!e || e.target === document.getElementById('bookModal'))
    document.getElementById('bookModal').classList.remove('open');
}
