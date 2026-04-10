const fs = require('fs');
let file = fs.readFileSync('src/MobileExperienceRefresh.vue', 'utf8');

const genericMusicNote = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
const profileSvg = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
const gearSvg = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="100%" height="100%"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
const gridSvg = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="24" height="24"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect></svg>`;

const cPlaylist = `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M15 4v12.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V8h6V4h-8z"/></svg>`;
const cCollab = `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`;
const cMix = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><line x1="4" y1="20" x2="20" y2="20"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="4" x2="20" y2="4"></line><circle cx="8" cy="4" r="2" fill="currentColor"></circle><circle cx="16" cy="12" r="2" fill="currentColor"></circle><circle cx="10" cy="20" r="2" fill="currentColor"></circle></svg>`;
const cFusion = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6" stroke-dasharray="2 2"/></svg>`;
const cJam = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="24" height="24"><circle cx="12" cy="12" r="9"></circle><path d="M12 12V4"></path><path d="M12 12l5.5 5.5"></path></svg>`;

file = file.replace(/>\\s*♪\\s*<\/div>/g, `>\n                    ${genericMusicNote}\n                  </div>`);
file = file.replace(/>\\s*♪\\s*<\/span>/g, `>\n                    ${genericMusicNote}\n                  </span>`);
file = file.replace(/>\s*♪\s*<\/div>/g, `>${genericMusicNote}</div>`);
file = file.replace(/>\s*♪\s*<\/span>/g, `>${genericMusicNote}</span>`);
// Sometimes it sits alone
file = file.replace(/([>\s])♪([<\s])/g, `$1<div style="width:50%;height:50%;margin:auto;">${genericMusicNote}</div>$2`);

file = file.replace(/>\s*◫\s*</g, `>${gridSvg}<`);
file = file.replace(/>\s*♫\s*</g, `>${profileSvg}<`);
file = file.replace(/>\s*⚙️\s*</g, `>${gearSvg}<`);

file = file.replace(/<div class="create-option__icon">♪<\/div>/g, `<div class="create-option__icon">${cPlaylist}</div>`);
file = file.replace(/<div class="create-option__icon">👥<\/div>/g, `<div class="create-option__icon">${cCollab}</div>`);
file = file.replace(/<div class="create-option__icon">≋<\/div>/g, `<div class="create-option__icon">${cMix}</div>`);
file = file.replace(/<div class="create-option__icon">◌<\/div>/g, `<div class="create-option__icon">${cFusion}</div>`);
file = file.replace(/<div class="create-option__icon">◔<\/div>/g, `<div class="create-option__icon">${cJam}</div>`);

fs.writeFileSync('src/MobileExperienceRefresh.vue', file, 'utf8');
console.log('Replacements completed.');
