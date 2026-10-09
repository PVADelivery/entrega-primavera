const fs = require('fs');
const path = require('path');

const targetFiles = [
  path.join(__dirname, 'node_modules', '@radix-ui', 'react-select', 'dist', 'index.mjs'),
  path.join(__dirname, 'node_modules', '@radix-ui', 'react-select', 'dist', 'index.js')
];

let patchedCount = 0;

targetFiles.forEach((filePath) => {
  if (fs.existsSync(filePath)) {
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      const target = 'setTimeout(() => nextItem.ref.current.focus());';
      const replacement = 'setTimeout(() => nextItem?.ref?.current?.focus?.());';

      if (content.includes(target)) {
        content = content.replace(target, replacement);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[patch-select] Successfully patched: ${filePath}`);
        patchedCount++;
      } else if (content.includes(replacement)) {
        console.log(`[patch-select] Already patched: ${filePath}`);
        patchedCount++;
      } else {
        console.warn(`[patch-select] Target pattern not found in: ${filePath}`);
      }
    } catch (err) {
      console.warn(`[patch-select] Error reading/writing ${filePath}:`, err.message);
    }
  }
});

console.log(`[patch-select] Complete. Total files verified/patched: ${patchedCount}`);
