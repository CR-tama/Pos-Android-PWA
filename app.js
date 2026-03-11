let db, cart = [], editModeId = null, html5QrCode = null;
const DB_NAME = "pos_ultra_v1_db";

async function init() {
    const SQL = await initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${f}` });
    const saved = localStorage.getItem(DB_NAME);
    db = saved ? new SQL.Database(Uint8Array.from(atob(saved), c => c.charCodeAt(0))) : new SQL.Database();
    db.run(`CREATE TABLE IF NOT EXISTS produk (id INTEGER PRIMARY KEY AUTOINCREMENT, kode_produk TEXT UNIQUE, nama TEXT, harga_jual REAL, stok INTEGER DEFAULT 0);
            CREATE TABLE IF NOT EXISTS penjualan (id INTEGER PRIMARY KEY AUTOINCREMENT, tgl DATETIME, total REAL, bayar REAL);
            CREATE TABLE IF NOT EXISTS pembelian (id INTEGER PRIMARY KEY AUTOINCREMENT, id_produk INTEGER, qty INTEGER, h_beli REAL, tgl DATETIME);`);
    refreshAll();
}

function saveToLocal() {
    const data = db.export();
    localStorage.setItem(DB_NAME, btoa(String.fromCharCode.apply(null, data)));
}

function showPage(pId, el) {
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.getElementById('page-' + pId).style.display = 'block';
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(el) el.classList.add('active');
    document.getElementById('pageTitle').innerText = pId.toUpperCase();
    refreshAll();
}

// FUNGSI PRODUK & EDIT
function simpanProduk() {
    const k = document.getElementById('prod_kode').value, n = document.getElementById('prod_nama').value, h = document.getElementById('prod_harga').value;
    if(!n || !h) return alert("Nama & Harga wajib!");
    if(editModeId) {
        db.run("UPDATE produk SET kode_produk=?, nama=?, harga_jual=? WHERE id=?", [k, n, h, editModeId]);
        editModeId = null; 
        document.getElementById('btnSimpanProduk').innerText = "Simpan Produk";
    } else {
        db.run("INSERT INTO produk (kode_produk, nama, harga_jual, stok) VALUES (?,?,?,0)", [k, n, h]);
    }
    saveToLocal(); refreshAll();
    document.querySelectorAll('#page-produk input').forEach(i => i.value = '');
}

function prepareEdit(id, nama, harga, kode) {
    document.getElementById('prod_kode').value = (kode === 'null' || !kode) ? '' : kode;
    document.getElementById('prod_nama').value = nama;
    document.getElementById('prod_harga').value = harga;
    editModeId = id;
    document.getElementById('btnSimpanProduk').innerText = "Update Produk";
    window.scrollTo({top: 0, behavior: 'smooth'});
}

// KASIR & NOTA
function handleScan(val) {
    const res = db.exec("SELECT id, nama, harga_jual, stok FROM produk WHERE kode_produk = ?", [val]);
    if(res[0]) {
        tambahKeCart(res[0].values[0][0], res[0].values[0][1], res[0].values[0][2]);
        document.getElementById('scan_input').value = '';
    }
}

function tambahKeCart(id, nama, harga) {
    const ada = cart.find(x => x.id === id);
    ada ? ada.qty++ : cart.push({id, nama, harga, qty: 1});
    renderCart();
}

function updateQty(idx, d) { cart[idx].qty += d; if(cart[idx].qty <= 0) cart.splice(idx,1); renderCart(); }

function renderCart() {
    let total = 0;
    document.getElementById('cartKasir').innerHTML = cart.map((i, idx) => {
        total += (i.harga * i.qty);
        return `<div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span>${i.nama}</span>
            <span><button onclick="updateQty(${idx},-1)" style="width:25px; padding:2px;">-</button> ${i.qty} <button onclick="updateQty(${idx},1)" style="width:25px; padding:2px;">+</button></span>
            <span>${(i.harga*i.qty).toLocaleString()}</span>
        </div>`;
    }).join('') || "Keranjang Kosong";
    document.getElementById('totalKasir').innerText = "Total: Rp " + total.toLocaleString();
    hitungKembalian();
}

function hitungKembalian() {
    const total = cart.reduce((a, b) => a + (b.harga * b.qty), 0);
    const bayar = parseFloat(document.getElementById('bayar_tunai').value) || 0;
    document.getElementById('teks_kembalian').innerText = "Rp " + (bayar - total < 0 ? 0 : bayar - total).toLocaleString();
}

function checkoutPenjualan() {
    const total = cart.reduce((a, b) => a + (b.harga * b.qty), 0);
    const bayar = parseFloat(document.getElementById('bayar_tunai').value) || 0;
    if(bayar < total || cart.length === 0) return alert("Uang kurang / Keranjang kosong!");

    cart.forEach(i => db.run("UPDATE produk SET stok = stok - ? WHERE id = ?", [i.qty, i.id]));
    db.run("INSERT INTO penjualan (tgl, total, bayar) VALUES (datetime('now','localtime'), ?, ?)", [total, bayar]);
    
    // NOTA LOGIC (Left-Right Layout)
    document.getElementById('nota-tgl').innerText = new Date().toLocaleString();
    document.getElementById('nota-items').innerHTML = cart.map(i => `
        <div class="nota-row"><span>${i.nama}</span><span>${(i.harga*i.qty).toLocaleString()}</span></div>
        <div class="item-detail">${i.qty} x ${i.harga.toLocaleString()}</div>
    `).join('');
    document.getElementById('nota-total').innerText = total.toLocaleString();
    document.getElementById('nota-bayar').innerText = bayar.toLocaleString();
    document.getElementById('nota-kembalian').innerText = (bayar - total).toLocaleString();

    saveToLocal();
    if(confirm("Cetak Nota?")) window.print();
    cart = []; document.getElementById('bayar_tunai').value = ''; renderCart(); refreshAll();
}

// SCANNER & STOK
async function startScanner(tid) {
    document.getElementById('reader-container').style.display = 'block';
    html5QrCode = new Html5Qrcode("reader");
    await html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (txt) => {
        document.getElementById(tid).value = txt;
        if(tid === 'scan_input') handleScan(txt);
        stopScanner();
    });
}
function stopScanner() { if(html5QrCode) html5QrCode.stop().then(() => document.getElementById('reader-container').style.display='none'); }

function simpanPembelian() {
    const id = document.getElementById('buy_id_produk').value, q = document.getElementById('buy_qty').value, hb = document.getElementById('buy_harga_beli').value;
    db.run("INSERT INTO pembelian (id_produk, qty, h_beli, tgl) VALUES (?,?,?,datetime('now'))", [id, q, hb]);
    db.run("UPDATE produk SET stok = stok + ? WHERE id = ?", [q, id]);
    saveToLocal(); refreshAll(); alert("Stok Berhasil Masuk!");
}

function refreshAll() {
    const res = db.exec("SELECT * FROM produk ORDER BY nama ASC");
    if(res[0]) {
        document.getElementById('listProduk').innerHTML = "<table><tr><th>Produk</th><th>Stok</th><th>Edit</th></tr>" + res[0].values.map(r => `<tr><td>${r[2]}</td><td>${r[4]}</td><td><button onclick="prepareEdit(${r[0]},'${r[2]}',${r[3]},'${r[1]}')" style="padding:4px; background:var(--y)">✏️</button></td></tr>`).join('') + "</table>";
        document.getElementById('buy_id_produk').innerHTML = res[0].values.map(r => `<option value="${r[0]}">${r[2]}</option>`).join('');
    }
    const jual = db.exec("SELECT SUM(total) FROM penjualan")[0]?.values[0][0] || 0;
    const beli = db.exec("SELECT SUM(qty*h_beli) FROM pembelian")[0]?.values[0][0] || 0;
    document.getElementById('laporanSummary').innerHTML = `<h3>Summary Keuangan</h3><p>Total Omzet: Rp ${jual.toLocaleString()}</p><p>Total Belanja: Rp ${beli.toLocaleString()}</p><h2>Net Profit: Rp ${(jual-beli).toLocaleString()}</h2>`;
}

function resetSemua() { if(confirm("Hapus semua database?")) { localStorage.clear(); location.reload(); } }
window.onload = init;