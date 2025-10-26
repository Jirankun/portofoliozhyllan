const modalProfil = document.getElementById('modalProfil');
const modalPendidikan = document.getElementById('modalPendidikan');
const audio = document.getElementById('bgMusic');

function bukaProfil() {
  modalProfil.style.display = 'flex';
  setTimeout(() => modalProfil.classList.add('active'), 10);
  document.body.style.overflow = 'hidden';
}

function tutupProfil() {
  modalProfil.classList.remove('active');
  setTimeout(() => {
    modalProfil.style.display = 'none';
    document.body.style.overflow = '';
  }, 400);
}

function bukaPendidikan(e) {
  e.preventDefault();
  modalPendidikan.style.display = 'flex';
  setTimeout(() => modalPendidikan.classList.add('active'), 10);
  document.body.style.overflow = 'hidden';
}

function tutupPendidikan() {
  modalPendidikan.classList.remove('active');
  setTimeout(() => {
    modalPendidikan.style.display = 'none';
    document.body.style.overflow = '';
  }, 400);
}

// Tutup popup saat klik di luar konten
window.onclick = function(event) {
  if (event.target === modalProfil) tutupProfil();
  if (event.target === modalPendidikan) tutupPendidikan();
};

// Musik
function toggleMusic() {
  const btn = document.querySelector('.music-btn');
  if (audio.paused) {
    audio.play().then(() => {
      btn.textContent = 'Jeda Musik';
    }).catch(e => {
      alert('Gagal memutar musik. Pastikan file bg.mp3 ada di folder music/ dan formatnya valid.');
    });
  } else {
    audio.pause();
    btn.textContent = 'Putar Musik';
  }
}