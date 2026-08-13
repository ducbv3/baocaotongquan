const fs = require('fs');
const content = fs.readFileSync('C:/Users/Ducbv/.gemini/antigravity/brain/bd67975a-acb4-4a7b-947f-d1c370182b00/.system_generated/steps/178/content.md', 'utf8');
const regex = /\[\d+,\d+,"(\d+)",\[\{"1":\[\[0,0,"([^"]+)"/g;
let match;
while ((match = regex.exec(content)) !== null) {
  console.log(match[2] + ': ' + match[1]);
}
