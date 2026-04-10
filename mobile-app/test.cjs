const fs = require('fs');
const lines = fs.readFileSync('src/MobileExperienceRefresh.vue', 'utf8').split('\n');
lines.forEach((l, i) => { if (/[^\x00-\x7F]/.test(l)) console.log(i + 1 + ': ' + l.trim()); });
